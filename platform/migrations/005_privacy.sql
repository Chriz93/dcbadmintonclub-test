begin;
create table club_app.deletion_requests(user_id uuid primary key references auth.users(id),requested_at timestamptz not null default now(),status text not null default 'pending' check(status in ('pending','reviewed','completed')));
alter table club_app.deletion_requests enable row level security;
create policy own_deletion_request on club_app.deletion_requests for select to authenticated using(user_id=auth.uid());
grant select on club_app.deletion_requests to authenticated;
grant all on club_app.deletion_requests to service_role;
create function club_app.export_my_data() returns jsonb language plpgsql security definer set search_path='' as $$ declare result jsonb;begin
 perform club_app.throttle();
 select jsonb_build_object('profile',(select to_jsonb(m) from club_app.members m where id=auth.uid()),'memberships',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from club_app.memberships m where user_id=auth.uid()),'rsvps',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from club_app.rsvps r where user_id=auth.uid()),'waivers',(select coalesce(jsonb_agg(to_jsonb(w)),'[]') from club_app.waiver_acceptances w where user_id=auth.uid()),'preferences',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from club_app.notification_preferences p where user_id=auth.uid())) into result;
 return result;
end $$;
create function club_app.request_my_deletion() returns void language plpgsql security definer set search_path='' as $$ begin
 perform club_app.throttle();
 insert into club_app.deletion_requests(user_id) values(auth.uid()) on conflict(user_id) do nothing;
 update club_app.notification_preferences set enabled=false where user_id=auth.uid();
 insert into club_app.audit_events(club_id,actor,subject,action) select club_id,auth.uid(),auth.uid(),'privacy.deletion_requested' from club_app.memberships where user_id=auth.uid();
end $$;
revoke all on function club_app.export_my_data(),club_app.request_my_deletion() from public;
grant execute on function club_app.export_my_data(),club_app.request_my_deletion() to authenticated;
commit;
