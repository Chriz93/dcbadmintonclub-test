begin;
-- Keep the original approval implementation private for seasons without paid intake.
alter function club_app.approve_member(uuid,uuid,uuid) rename to approve_member_impl;
revoke all on function club_app.approve_member_impl(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function club_app.approve_member(c uuid,s uuid,u uuid) returns text language plpgsql security definer set search_path='' as $$
declare se club_app.seasons; i club_app.member_intake; used int;begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 select * into se from club_app.seasons where club_id=c and id=s for update;if not found then raise exception 'Season unavailable';end if;
 if coalesce((se.rules->>'requireIntake')::boolean,false) then
  perform club_app.throttle();
  select * into i from club_app.member_intake where club_id=c and season_id=s and user_id=u for update;
  if not found then raise exception 'Member details required';end if;
  if not exists(select 1 from club_app.registrations where club_id=c and season_id=s and user_id=u and status='pending') then raise exception 'Pending registration unavailable';end if;
  if not exists(select 1 from club_app.waiver_acceptances a join club_app.waiver_versions w on w.id=a.waiver_id and w.club_id=a.club_id where a.club_id=c and a.user_id=u and w.version=(select max(version) from club_app.waiver_versions where club_id=c)) then raise exception 'Latest participant waiver acceptance required';end if;
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
create or replace function club_app.export_my_data() returns jsonb language plpgsql security definer set search_path='' as $$ declare result jsonb;begin
 perform club_app.throttle();
 select jsonb_build_object('profile',(select to_jsonb(m) from club_app.members m where id=auth.uid()),'memberships',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from club_app.memberships m where user_id=auth.uid()),'rsvps',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from club_app.rsvps r where user_id=auth.uid()),'waivers',(select coalesce(jsonb_agg(to_jsonb(w)),'[]') from club_app.waiver_acceptances w where user_id=auth.uid()),'preferences',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from club_app.notification_preferences p where user_id=auth.uid()),'intake',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from club_app.member_intake i where user_id=auth.uid())) into result;
 return result;
end $$;
revoke all on function club_app.approve_member(uuid,uuid,uuid) from public,anon;
grant execute on function club_app.approve_member(uuid,uuid,uuid) to authenticated;
commit;
