begin;
-- Current policy: no minimum age; verified guardian consent for every minor.
create or replace function club_app.save_eligibility(c uuid,s uuid,birth_date date,guardian_email text,expected_revision int,acknowledged boolean) returns int language plpgsql security definer set search_path='' as $$ declare old club_app.participant_eligibility; own_email text;begin
 if acknowledged is not true then raise exception 'Explicit participant acknowledgment required';end if;
 perform club_app.throttle();select email into own_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if own_email is null then raise exception 'Verified email required';end if;
 if not exists(select 1 from club_app.member_intake where club_id=c and season_id=s and user_id=auth.uid()) then raise exception 'Complete member details first';end if;
 if birth_date is null or birth_date>current_date or birth_date<current_date-interval '110 years' then raise exception 'Valid birth date required';end if;
 if birth_date>current_date-interval '18 years' and (guardian_email is null or guardian_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or lower(trim(guardian_email))=lower(own_email)) then raise exception 'Separate guardian email required';end if;
 perform 1 from club_app.seasons where club_id=c and id=s for update;
 if exists(select 1 from club_app.signature_receipts where club_id=c and season_id=s and participant_id=auth.uid()) then raise exception 'Signed identity correction requires administrator review';end if;
 select * into old from club_app.participant_eligibility where club_id=c and season_id=s and user_id=auth.uid() for update;
 if expected_revision is null or expected_revision<>coalesce(old.revision,0) then raise exception 'Revision conflict' using errcode='40001';end if;
 insert into club_app.participant_eligibility values(c,s,auth.uid(),birth_date,case when birth_date>current_date-interval '18 years' then lower(trim(guardian_email)) end,now(),coalesce(old.revision,0)+1)
 on conflict(club_id,season_id,user_id) do update set birth_date=excluded.birth_date,guardian_email=excluded.guardian_email,acknowledged_at=now(),revision=excluded.revision;
 return coalesce(old.revision,0)+1;
end $$;
create or replace function club_app.agreement_terms() returns text language sql immutable set search_path='' as $$ select E'Organizer: Christy, acting personally. Maplewood Advanced Badminton League is the league name, not a separately registered club.\nRegular season fee: $400; approved spare session: $20. A payment claim is not proof of payment. Spare places are confirmed only after voting, verified payment and availability.\nEligible absence refund: $14 for notice received at least 72 elapsed hours before the session starts. Late notice and no-shows are not eligible.\nSchool/facility cancellations: no cash refund; two physical shuttlecocks credited per affected eligible player.\nVerified no-show: one court down, with administrator review and correction. No response alone is not proof of a no-show.\nChristy sets initial seeding. Ratings and court movement follow published rules; administrators may make audited corrections.\nBookings 20:15–22:15 Toronto time: no early entry, finish play by 22:05 and leave by 22:15. Indoor non-marking shoes and school facility conditions apply.\nThere is no minimum participant age. All players under 18 require verified parent/legal-guardian consent. Adult participants sign for themselves.\nRegistration and acceptance are season-specific. A new season requires its own signed agreement; earlier receipts remain on record.\n' $$;
commit;
