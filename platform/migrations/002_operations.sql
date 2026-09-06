begin;
-- Changes and notification enqueue share one transaction.
create function club_app.cancel_session(c uuid,s uuid,expected_revision int) returns void language plpgsql security definer set search_path='' as $$ declare old club_app.sessions; u record;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 select * into old from club_app.sessions where club_id=c and id=s for update;
 if not found then raise exception 'Session unavailable';end if;
 if old.revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if old.status='completed' then raise exception 'Completed session cannot be cancelled';end if;
 if old.status='cancelled' then return;end if;
 update club_app.sessions set status='cancelled',revision=revision+1 where id=s;
 insert into club_app.audit_events(club_id,actor,action,before_value,after_value) values(c,auth.uid(),'session.cancelled',jsonb_build_object('session',s,'status',old.status),jsonb_build_object('session',s,'status','cancelled'));
 for u in select user_id from club_app.memberships where club_id=c and status='active' loop
 perform club_app.enqueue(c,u.user_id,'cancel:'||s||':'||(old.revision+1)||':'||u.user_id,'session.cancelled',jsonb_build_object('session',s));end loop;
end $$;
create function club_app.public_schedule(club_slug text) returns table(id uuid,calendar_uid uuid,club_name text,venue_name text,starts_at timestamptz,ends_at timestamptz,status text,revision int) language sql stable security definer set search_path='' as $$ select s.id,s.calendar_uid,c.name,v.name,s.starts_at,s.ends_at,s.status,s.revision from club_app.sessions s join club_app.clubs c on c.id=s.club_id join club_app.venues v on v.id=s.venue_id and v.club_id=s.club_id where c.slug=club_slug order by s.starts_at $$;
create function club_app.update_profile(display_name text,phone text) returns void language plpgsql security definer set search_path='' as $$ begin
 perform club_app.throttle();if length(display_name) not between 1 and 100 or length(phone)>40 then raise exception 'Invalid profile';end if;
 update club_app.members set display_name=update_profile.display_name,phone=update_profile.phone where id=auth.uid();
end $$;
create function club_app.register_member(c uuid,s uuid,display_name text,waiver uuid) returns void language plpgsql security definer set search_path='' as $$ declare verified_email text;begin
 perform club_app.throttle();
 select email into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if verified_email is null then raise exception 'Verified email required';end if;
 if not exists(select 1 from club_app.seasons where club_id=c and id=s) or not exists(select 1 from club_app.waiver_versions where club_id=c and id=waiver) then raise exception 'Invalid season or waiver';end if;
 insert into club_app.members(id,display_name,email) values(auth.uid(),display_name,verified_email) on conflict(id) do nothing;
 insert into club_app.memberships(club_id,user_id,role,status) values(c,auth.uid(),'member','pending') on conflict do nothing;
 insert into club_app.registrations(club_id,season_id,user_id) values(c,s,auth.uid()) on conflict do nothing;
 insert into club_app.waiver_acceptances values(c,auth.uid(),waiver,now()) on conflict do nothing;
 insert into club_app.audit_events(club_id,actor,subject,action) values(c,auth.uid(),auth.uid(),'registration.submitted');
end $$;
create function club_app.approve_member(c uuid,u uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 update club_app.memberships set status='active' where club_id=c and user_id=u and status in ('pending','waitlisted');
 if not found then raise exception 'No pending membership';end if;
 update club_app.registrations set status='approved' where club_id=c and user_id=u;
 insert into club_app.audit_events(club_id,actor,subject,action) values(c,auth.uid(),u,'membership.approved');
end $$;
create function club_app.claim_deliveries(batch_size int default 10) returns setof club_app.notification_deliveries language plpgsql security definer set search_path='' as $$ begin
 if batch_size not between 1 and 50 then raise exception 'Invalid batch';end if;
 return query with due as (select id from club_app.notification_deliveries where ((status='pending' and available_at<=now()) or (status='processing' and lease_until<now())) and attempts<8 order by available_at for update skip locked limit batch_size)
 update club_app.notification_deliveries n set status='processing',attempts=n.attempts+1,lease_until=now()+interval '2 minutes' from due where n.id=due.id returning n.*;
end $$;
create function club_app.delivery_recipient(delivery_id uuid) returns table(email text,enabled boolean) language sql stable security definer set search_path='' as $$ select m.email,coalesce(p.enabled,false) from club_app.notification_deliveries d join club_app.members m on m.id=d.user_id left join club_app.notification_preferences p on p.club_id=d.club_id and p.user_id=d.user_id and p.channel='email' where d.id=delivery_id $$;
create function club_app.finish_delivery(delivery_id uuid,attempt int,outcome text,provider_id text default null) returns void language plpgsql security definer set search_path='' as $$ begin
 if outcome not in ('pending','delivered','suppressed','failed') then raise exception 'Invalid outcome';end if;
 update club_app.notification_deliveries set status=case when outcome='pending' and attempts>=8 then 'failed' else outcome end,provider_message_id=provider_id,failure_reason=case when outcome in ('pending','failed') then 'Provider delivery failed' else null end,available_at=now()+make_interval(secs=>least(86400,30*power(2,attempts-1))::int),lease_until=null where id=delivery_id and attempts=attempt and status='processing';
 if not found then raise exception 'Stale delivery lease';end if;
end $$;
revoke all on all functions in schema club_app from public,anon;
grant usage on schema club_app to anon;
grant execute on function club_app.public_schedule(text) to anon,authenticated;
grant execute on function club_app.cancel_session(uuid,uuid,int),club_app.update_profile(text,text),club_app.register_member(uuid,uuid,text,uuid),club_app.approve_member(uuid,uuid) to authenticated;
grant execute on function club_app.claim_deliveries(int),club_app.delivery_recipient(uuid),club_app.finish_delivery(uuid,int,text,text) to service_role;
commit;
