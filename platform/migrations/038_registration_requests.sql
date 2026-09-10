begin;
-- A shared link admits applications only. Existing approval, payment, signature,
-- guardian review and capacity checks remain the only route to an active place.
create or replace function club_app.submit_intake(c uuid,s uuid,legal_name text,display_name text,phone text,emergency_contact text,kind text,payment_reference text,claimed_amount_cents int,expected_revision int) returns int language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Verified email required' using errcode='42501';end if;
 perform 1 from club_app.seasons where club_id=c and id=s for update;
 if not found then raise exception 'Season unavailable';end if;
 if exists(select 1 from club_app.registrations r where r.club_id=c and r.season_id=s and r.user_id=auth.uid() and r.status<>'pending') then
  raise exception 'Ask Christy to update or reopen your reviewed registration';
 end if;
 return club_app.submit_intake_open_impl(c,s,legal_name,display_name,phone,emergency_contact,kind,payment_reference,claimed_amount_cents,expected_revision);
end $$;

-- Private registration list includes incomplete applications and approved players.
-- No member/contact SELECT grants are widened to make this organizer screen work.
create function club_app.registration_review_list(c uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'user_id',r.user_id,'season_id',r.season_id,'season_name',s.name,'status',r.status,
  'legal_name',coalesce(i.legal_name,m.display_name),'display_name',m.display_name,'email',m.email,'phone',coalesce(m.phone,''),
  'kind',coalesce(i.kind,ms.kind),'emergency_contact',coalesce(i.emergency_contact,''),
  'payment_reference',coalesce(i.payment_reference,''),'claimed_amount_cents',coalesce(i.claimed_amount_cents,0),
  'payment_status',coalesce(i.payment_status,'unverified'),'intake_revision',i.revision,
  'required_fee_cents',coalesce((s.rules->>'regularFeeCents')::int,40000),
  'agreement_signed',exists(select 1 from club_app.signature_receipts sr where sr.club_id=c and sr.season_id=r.season_id and sr.participant_id=r.user_id and sr.waiver_id=(select p.waiver_id from club_app.agreement_publications p join club_app.waiver_versions w on w.id=p.waiver_id where p.club_id=c and p.season_id=r.season_id order by w.version desc limit 1)),
  'identity_reviewed',exists(select 1 from club_app.participant_eligibility e join club_app.eligibility_reviews er using(club_id,season_id,user_id) where e.club_id=c and e.season_id=r.season_id and e.user_id=r.user_id and e.revision=er.eligibility_revision),
  'require_intake',coalesce((s.rules->>'requireIntake')::boolean,false),
  'operations_enabled',coalesce((s.rules->>'operationsEnabled')::boolean,false)
 ) order by s.name desc,m.display_name,r.user_id),'[]'::jsonb) into result
 from club_app.registrations r join club_app.seasons s on s.club_id=r.club_id and s.id=r.season_id
 join club_app.memberships ms on ms.club_id=r.club_id and ms.user_id=r.user_id join club_app.members m on m.id=r.user_id
 left join club_app.member_intake i on i.club_id=r.club_id and i.season_id=r.season_id and i.user_id=r.user_id
 where r.club_id=c;
 return result;
end $$;
revoke all on function club_app.registration_review_list(uuid) from public,anon,authenticated,service_role;
grant execute on function club_app.registration_review_list(uuid) to authenticated;
comment on function club_app.submit_intake(uuid,uuid,text,text,text,text,text,text,int,int) is 'Verified-email registration request. No invitation needed; administrator approval remains mandatory.';
notify pgrst, 'reload schema';
commit;
