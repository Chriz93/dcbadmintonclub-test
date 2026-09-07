begin;
alter table club_app.notification_deliveries add column channel text not null default 'email' check(channel in ('email','sms'));
create table club_app.notification_contacts(club_id uuid not null,user_id uuid not null,phone text not null,verified_at timestamptz not null,primary key(club_id,user_id),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id));
alter table club_app.notification_contacts enable row level security;
create policy contact_private on club_app.notification_contacts for select to authenticated using(user_id=auth.uid());
revoke all on club_app.notification_contacts from public,anon,authenticated;
grant select on club_app.notification_contacts to authenticated;
create function club_app.set_sms_preference(c uuid,enabled boolean) returns void language plpgsql security definer set search_path='' as $$ declare phone text; proof text;begin
 perform club_app.throttle();if not club_app.is_member(c) or enabled is null then raise exception 'Active membership required';end if;
 select to_jsonb(u)->>'phone',to_jsonb(u)->>'phone_confirmed_at' into phone,proof from auth.users u where id=auth.uid();
 if enabled then
 if phone is null or proof is null then raise exception 'Verify your phone through sign-in security first';end if;
 insert into club_app.notification_contacts values(c,auth.uid(),phone,proof::timestamptz) on conflict(club_id,user_id) do update set phone=excluded.phone,verified_at=excluded.verified_at;
 end if;
 insert into club_app.notification_preferences values(c,auth.uid(),'sms',enabled,case when enabled then now() end) on conflict(club_id,user_id,channel) do update set enabled=excluded.enabled,consented_at=excluded.consented_at;
end $$;
create or replace function club_app.enqueue(c uuid,u uuid,k text,t text,p jsonb) returns void language sql security definer set search_path='' as $$
 insert into club_app.notification_deliveries(club_id,user_id,idempotency_key,template,payload,channel) select c,u,k||':'||n.channel,t,p,n.channel from club_app.notification_preferences n where n.club_id=c and n.user_id=u and n.enabled and n.channel in ('email','sms') and (n.channel='email' or exists(select 1 from club_app.notification_contacts co where co.club_id=c and co.user_id=u)) on conflict(idempotency_key) do nothing
$$;
create function club_app.delivery_target(delivery_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('email',m.email,'phone',co.phone,'channel',d.channel,'enabled',coalesce(p.enabled,false) and (d.channel='email' or (co.phone=to_jsonb(au)->>'phone' and to_jsonb(au)->>'phone_confirmed_at' is not null)) and case when d.template like 'attendance.%' then exists(select 1 from club_app.sessions s where s.club_id=d.club_id and s.id=(d.payload->>'session')::uuid and s.status='scheduled' and s.starts_at>now()+interval '72 hours' and not exists(select 1 from club_app.rsvps v where v.club_id=s.club_id and v.session_id=s.id and v.user_id=d.user_id and v.response<>'maybe')) else true end)
 from club_app.notification_deliveries d join club_app.members m on m.id=d.user_id join auth.users au on au.id=m.id left join club_app.notification_preferences p on p.club_id=d.club_id and p.user_id=d.user_id and p.channel=d.channel left join club_app.notification_contacts co on co.club_id=d.club_id and co.user_id=d.user_id where d.id=delivery_id
$$;
create function club_app.claim_delivery_batch(batch_size int,channels text[]) returns setof club_app.notification_deliveries language plpgsql security definer set search_path='' as $$ begin
 if batch_size is null or batch_size not between 1 and 50 or channels is null or not channels<@array['email','sms']::text[] then raise exception 'Invalid batch';end if;
 -- Never blindly retry an SMS whose provider outcome may have been lost.
 update club_app.notification_deliveries set status='failed',failure_reason='Delivery outcome requires provider reconciliation',lease_until=null where status='processing' and lease_until<now() and (attempts>=8 or channel='sms');
 update club_app.notification_deliveries set status='failed',failure_reason='Provider idempotency retention elapsed' where status in ('pending','processing') and attempts>0 and created_at<now()-interval '23 hours';
 return query with due as(select id from club_app.notification_deliveries where channel=any(channels) and ((status='pending' and available_at<=now()) or (status='processing' and lease_until<now())) and attempts<8 order by available_at for update skip locked limit batch_size)
 update club_app.notification_deliveries n set status='processing',attempts=n.attempts+1,lease_until=now()+interval '2 minutes' from due where n.id=due.id returning n.*;
end $$;
create function club_app.correct_attendance(c uuid,s uuid,u uuid,new_status text,expected_status text,reason text) returns void language plpgsql security definer set search_path='' as $$ declare old text;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 perform 1 from club_app.sessions where club_id=c and id=s and status<>'cancelled' for update;if not found then raise exception 'Session unavailable';end if;
 if reason is null or length(trim(reason)) not between 5 and 500 then raise exception 'Correction reason required';end if;
 select status into old from club_app.attendance where club_id=c and session_id=s and user_id=u for update;
 if old is distinct from expected_status then raise exception 'Attendance conflict' using errcode='40001';end if;
 insert into club_app.attendance values(c,s,u,new_status) on conflict(club_id,session_id,user_id) do update set status=excluded.status;
 insert into club_app.audit_events(club_id,actor,subject,action,before_value,after_value) values(c,auth.uid(),u,'attendance.corrected',jsonb_build_object('session',s,'status',old),jsonb_build_object('session',s,'status',new_status,'reason',reason));
end $$;
create or replace function club_app.export_my_data() returns jsonb language plpgsql security definer set search_path='' as $$ begin
 perform club_app.throttle();return jsonb_build_object(
 'profile',(select to_jsonb(m) from club_app.members m where id=auth.uid()),
 'memberships',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from club_app.memberships m where user_id=auth.uid()),
 'rsvps',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from club_app.rsvps m where user_id=auth.uid()),
 'waivers',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from club_app.waiver_acceptances m where user_id=auth.uid()),
 'notification_contacts',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from club_app.notification_contacts m where user_id=auth.uid()),
 'deletion_request',(select to_jsonb(m) from club_app.deletion_requests m where user_id=auth.uid()),
 'registrations',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from club_app.registrations m where user_id=auth.uid()),
 'preferences',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from club_app.notification_preferences m where user_id=auth.uid()),
 'intake',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from club_app.member_intake m where user_id=auth.uid()),
 'eligibility',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from club_app.participant_eligibility m where user_id=auth.uid()),
 'signature_receipts',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from club_app.signature_receipts m where participant_id=auth.uid() or signer_id=auth.uid()),
 'session_accounts',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from club_app.session_accounts m where user_id=auth.uid()),
 'spare_requests',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from club_app.spare_requests m where user_id=auth.uid()),
 'attendance',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from club_app.attendance m where user_id=auth.uid()),
 'penalties',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from club_app.no_show_penalties m where user_id=auth.uid()));
end $$;
revoke all on function club_app.set_sms_preference(uuid,boolean),club_app.delivery_target(uuid),club_app.claim_delivery_batch(int,text[]),club_app.correct_attendance(uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function club_app.set_sms_preference(uuid,boolean),club_app.correct_attendance(uuid,uuid,uuid,text,text,text) to authenticated;
grant execute on function club_app.delivery_target(uuid),club_app.claim_delivery_batch(int,text[]) to service_role;
commit;
