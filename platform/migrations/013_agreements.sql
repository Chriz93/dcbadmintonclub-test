begin;
create table club_app.participant_eligibility(
 club_id uuid not null,season_id uuid not null,user_id uuid not null,birth_date date not null,guardian_email text,
 acknowledged_at timestamptz not null default now(),revision int not null default 1,
 primary key(club_id,season_id,user_id),foreign key(club_id,season_id) references club_app.seasons(club_id,id),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id)
);
create table club_app.agreement_publications(
 club_id uuid not null,season_id uuid not null,waiver_id uuid not null,review_reference text not null,published_by uuid not null references auth.users(id),
 primary key(club_id,season_id,waiver_id),foreign key(club_id,season_id) references club_app.seasons(club_id,id),foreign key(club_id,waiver_id) references club_app.waiver_versions(club_id,id)
);
create table club_app.signature_receipts(
 id uuid primary key default gen_random_uuid(),club_id uuid not null,season_id uuid not null,participant_id uuid not null,waiver_id uuid not null,
 participant_name text not null,signer_id uuid not null references auth.users(id),signer_name text not null check(length(trim(signer_name)) between 1 and 150),
 signer_capacity text not null check(signer_capacity in ('adult','guardian')),relationship text,body text not null,sha256 text not null,signed_at timestamptz not null default now(),
 unique(club_id,season_id,participant_id,waiver_id),foreign key(club_id,season_id,waiver_id) references club_app.agreement_publications(club_id,season_id,waiver_id),foreign key(club_id,participant_id) references club_app.memberships(club_id,user_id)
);
alter table club_app.participant_eligibility enable row level security;
alter table club_app.agreement_publications enable row level security;
alter table club_app.signature_receipts enable row level security;
create policy eligibility_private on club_app.participant_eligibility for select to authenticated using(user_id=auth.uid() or club_app.is_admin(club_id));
create policy publication_read on club_app.agreement_publications for select to authenticated using(club_app.is_admin(club_id));
create policy receipt_private on club_app.signature_receipts for select to authenticated using(participant_id=auth.uid() or signer_id=auth.uid() or club_app.is_admin(club_id));
revoke all on club_app.participant_eligibility,club_app.agreement_publications,club_app.signature_receipts from public,anon,authenticated;
grant select on club_app.participant_eligibility,club_app.agreement_publications,club_app.signature_receipts to authenticated;
create function club_app.agreement_terms() returns text language sql immutable set search_path='' as $$ select E'Organizer: Christy, acting personally. Maplewood Advanced Badminton League is the league name, not a separately registered club.\nRegular season fee: $400; approved spare session: $20. A payment claim is not proof of payment. Spare places are confirmed only after voting, verified payment and availability.\nEligible absence refund: $14 for notice received at least 72 elapsed hours before the session starts. Late notice and no-shows are not eligible.\nSchool/facility cancellations: no cash refund; two physical shuttlecocks credited per affected eligible player.\nVerified no-show: one court down, with administrator review and correction. No response alone is not proof of a no-show.\nChristy sets initial seeding. Ratings and court movement follow published rules; administrators may make audited corrections.\nBookings 20:15–22:15 Toronto time: no early entry, finish play by 22:05 and leave by 22:15. Indoor non-marking shoes and school facility conditions apply.\nPlayers aged 16–17 require verified parent/legal-guardian consent. Adult participants sign for themselves.\n' $$;
create function club_app.publish_agreement(c uuid,s uuid,liability_text text,review_reference text,expected_version int) returns uuid language plpgsql security definer set search_path='' as $$ declare v int; w uuid; body text;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 perform 1 from club_app.clubs where id=c for update;
 if not exists(select 1 from club_app.seasons where club_id=c and id=s) then raise exception 'Season unavailable';end if;
 select coalesce(max(version),0) into v from club_app.waiver_versions where club_id=c;
 if expected_version is null or v<>expected_version then raise exception 'Revision conflict' using errcode='40001';end if;
 if liability_text is null or length(trim(liability_text)) not between 100 and 30000 or review_reference is null or length(trim(review_reference)) not between 5 and 500 then raise exception 'Reviewed agreement text and review reference required';end if;
 body=club_app.agreement_terms()||E'\nReviewed participation and liability terms:\n'||trim(liability_text);
 insert into club_app.waiver_versions(club_id,version,body,sha256) values(c,v+1,body,encode(sha256(convert_to(body,'UTF8')),'hex')) returning id into w;
 insert into club_app.agreement_publications values(c,s,w,trim(review_reference),auth.uid());
 if v>0 then update club_app.registrations set status='pending' where club_id=c and season_id=s and status='approved';end if;
 insert into club_app.audit_events(club_id,actor,action,after_value) values(c,auth.uid(),'agreement.published',jsonb_build_object('season',s,'waiver',w,'version',v+1,'review_reference',review_reference));return w;
end $$;
create function club_app.save_eligibility(c uuid,s uuid,birth_date date,guardian_email text,expected_revision int,acknowledged boolean) returns int language plpgsql security definer set search_path='' as $$ declare old club_app.participant_eligibility; age_at_start int; first_date date; own_email text;begin
 if acknowledged is not true then raise exception 'Explicit participant acknowledgment required';end if;
 perform club_app.throttle();select email into own_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if own_email is null then raise exception 'Verified email required';end if;
 if not exists(select 1 from club_app.member_intake where club_id=c and season_id=s and user_id=auth.uid()) then raise exception 'Complete member details first';end if;
 select min(starts_at at time zone 'America/Toronto')::date into first_date from club_app.sessions where club_id=c and season_id=s and status<>'cancelled';
 if birth_date is null or birth_date>current_date or birth_date<current_date-interval '110 years' then raise exception 'Valid birth date required';end if;
 age_at_start=extract(year from age(coalesce(first_date,current_date),birth_date));
 if age_at_start<16 then raise exception 'Participants under 16 require organizer review before registration';end if;
 if birth_date>current_date-interval '18 years' and (guardian_email is null or guardian_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or lower(trim(guardian_email))=lower(own_email)) then raise exception 'Separate guardian email required';end if;
 perform 1 from club_app.seasons where club_id=c and id=s for update;
 if exists(select 1 from club_app.signature_receipts where club_id=c and season_id=s and participant_id=auth.uid()) then raise exception 'Signed identity correction requires administrator review';end if;
 select * into old from club_app.participant_eligibility where club_id=c and season_id=s and user_id=auth.uid() for update;
 if expected_revision is null or expected_revision<>coalesce(old.revision,0) then raise exception 'Revision conflict' using errcode='40001';end if;
 insert into club_app.participant_eligibility values(c,s,auth.uid(),birth_date,case when birth_date>current_date-interval '18 years' then lower(trim(guardian_email)) end,now(),coalesce(old.revision,0)+1)
 on conflict(club_id,season_id,user_id) do update set birth_date=excluded.birth_date,guardian_email=excluded.guardian_email,acknowledged_at=now(),revision=excluded.revision;
 return coalesce(old.revision,0)+1;
end $$;
create function club_app.signing_options() returns table(club_id uuid,season_id uuid,participant_id uuid,participant_name text,waiver_id uuid,version int,body text,sha256 text,capacity text) language sql stable security definer set search_path='' as $$
 select e.club_id,e.season_id,e.user_id,i.legal_name,w.id,w.version,w.body,w.sha256,case when e.user_id=auth.uid() then 'adult' else 'guardian' end
 from club_app.participant_eligibility e join club_app.member_intake i on i.club_id=e.club_id and i.season_id=e.season_id and i.user_id=e.user_id
 cross join lateral(select v.* from club_app.agreement_publications p join club_app.waiver_versions v on v.id=p.waiver_id where p.club_id=e.club_id and p.season_id=e.season_id order by v.version desc limit 1) w
 where (e.user_id=auth.uid() and e.birth_date<=current_date-interval '18 years') or (e.user_id<>auth.uid() and e.guardian_email=(select lower(email) from auth.users where id=auth.uid() and email_confirmed_at is not null))
$$;
create function club_app.sign_agreement(c uuid,s uuid,participant uuid,waiver uuid,expected_hash text,signer_name text,relationship text,adult_signer boolean,accepted boolean) returns uuid language plpgsql security definer set search_path='' as $$ declare choice record; receipt uuid;begin
 perform club_app.throttle();
 if accepted is not true or adult_signer is not true or signer_name is null or length(trim(signer_name)) not between 1 and 150 then raise exception 'Adult signer and explicit acceptance required';end if;
 perform 1 from club_app.seasons where club_id=c and id=s for update;
 perform 1 from auth.users where id=auth.uid() and email_confirmed_at is not null;if not found then raise exception 'Verified signer email required';end if;
 select * into choice from club_app.signing_options() o where o.club_id=c and o.season_id=s and o.participant_id=participant and o.waiver_id=waiver;
 if not found or expected_hash is distinct from choice.sha256 then raise exception 'Current agreement and authorized signer required' using errcode='42501';end if;
 if choice.capacity='guardian' and (relationship is null or length(trim(relationship)) not between 2 and 100) then raise exception 'Guardian relationship required';end if;
 insert into club_app.signature_receipts(club_id,season_id,participant_id,waiver_id,participant_name,signer_id,signer_name,signer_capacity,relationship,body,sha256) values(c,s,participant,waiver,choice.participant_name,auth.uid(),trim(signer_name),choice.capacity,case when choice.capacity='guardian' then trim(relationship) end,choice.body,choice.sha256)
 on conflict(club_id,season_id,participant_id,waiver_id) do nothing returning id into receipt;
 if receipt is null then select id into receipt from club_app.signature_receipts where club_id=c and season_id=s and participant_id=participant and waiver_id=waiver;return receipt;end if;
 insert into club_app.waiver_acceptances values(c,participant,waiver,now()) on conflict do nothing;
 insert into club_app.audit_events(club_id,actor,subject,action,after_value) values(c,auth.uid(),participant,'agreement.signed',jsonb_build_object('receipt',receipt,'waiver',waiver,'capacity',choice.capacity));return receipt;
end $$;
alter function club_app.register_member(uuid,uuid,text,uuid) rename to register_member_impl;
revoke all on function club_app.register_member_impl(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
create function club_app.register_member(c uuid,s uuid,display_name text,waiver uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if exists(select 1 from club_app.seasons where club_id=c and id=s and rules->>'operationsEnabled'='true') then raise exception 'Use verified participant or guardian signing';end if;
 perform club_app.register_member_impl(c,s,display_name,waiver);
end $$;
alter function club_app.approve_member(uuid,uuid,uuid) rename to approve_member_intake_impl;
revoke all on function club_app.approve_member_intake_impl(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create or replace function club_app.approve_member_intake_impl(c uuid,s uuid,u uuid) returns text language plpgsql security definer set search_path='' as $$
declare se club_app.seasons; i club_app.member_intake; used int;begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 select * into se from club_app.seasons where club_id=c and id=s for update;if not found then raise exception 'Season unavailable';end if;
 if coalesce((se.rules->>'requireIntake')::boolean,false) then
  perform club_app.throttle();
  select * into i from club_app.member_intake where club_id=c and season_id=s and user_id=u for update;
  if not found then raise exception 'Member details required';end if;
  if not exists(select 1 from club_app.registrations where club_id=c and season_id=s and user_id=u and status='pending') then raise exception 'Pending registration unavailable';end if;
  if coalesce((se.rules->>'operationsEnabled')::boolean,false)=false and not exists(select 1 from club_app.waiver_acceptances a join club_app.waiver_versions w on w.id=a.waiver_id and w.club_id=a.club_id where a.club_id=c and a.user_id=u and w.version=(select max(version) from club_app.waiver_versions where club_id=c)) then raise exception 'Latest participant waiver acceptance required';end if;
  if i.kind='regular' then
   if i.payment_status<>'verified' or i.claimed_amount_cents<coalesce((se.rules->>'regularFeeCents')::int,40000) then raise exception 'Verified full season payment required';end if;
   select count(*) into used from club_app.registrations r join club_app.member_intake mi on mi.club_id=r.club_id and mi.season_id=r.season_id and mi.user_id=r.user_id where r.club_id=c and r.season_id=s and r.status='approved' and mi.kind='regular';
   if used>=se.regular_capacity then raise exception 'Regular roster is full';end if;
  end if;
  -- Spare approval is eligibility only, never a reservation or a payment entitlement.
  update club_app.registrations set status='approved' where club_id=c and season_id=s and user_id=u;
  update club_app.memberships set status='active',kind=i.kind where club_id=c and user_id=u;
  insert into club_app.audit_events(club_id,actor,subject,action,after_value) values(c,auth.uid(),u,'membership.reviewed',jsonb_build_object('season',s,'kind',i.kind,'status','approved'));
  return 'approved';
 end if;
 return club_app.approve_member_impl(c,s,u);
end $$;
create function club_app.approve_member(c uuid,s uuid,u uuid) returns text language plpgsql security definer set search_path='' as $$ begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 if exists(select 1 from club_app.seasons where club_id=c and id=s and rules->>'operationsEnabled'='true') and not exists(select 1 from club_app.signature_receipts r join club_app.agreement_publications p on p.waiver_id=r.waiver_id and p.season_id=r.season_id and p.club_id=r.club_id where r.club_id=c and r.season_id=s and r.participant_id=u and r.waiver_id=(select p2.waiver_id from club_app.agreement_publications p2 join club_app.waiver_versions w on w.id=p2.waiver_id where p2.club_id=c and p2.season_id=s order by w.version desc limit 1)) then raise exception 'Current signed agreement required';end if;
 return club_app.approve_member_intake_impl(c,s,u);
end $$;
revoke all on function club_app.agreement_terms(),club_app.publish_agreement(uuid,uuid,text,text,int),club_app.save_eligibility(uuid,uuid,date,text,int,boolean),club_app.signing_options(),club_app.sign_agreement(uuid,uuid,uuid,uuid,text,text,text,boolean,boolean),club_app.register_member(uuid,uuid,text,uuid),club_app.approve_member(uuid,uuid,uuid) from public,anon;
grant execute on function club_app.agreement_terms(),club_app.publish_agreement(uuid,uuid,text,text,int),club_app.save_eligibility(uuid,uuid,date,text,int,boolean),club_app.signing_options(),club_app.sign_agreement(uuid,uuid,uuid,uuid,text,text,text,boolean,boolean),club_app.register_member(uuid,uuid,text,uuid),club_app.approve_member(uuid,uuid,uuid) to authenticated;
commit;
