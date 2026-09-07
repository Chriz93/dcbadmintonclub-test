begin;
create function club_app.my_match_history(page_number int default 0) returns table(id uuid,club_id uuid,season_name text,starts_at timestamptz,court_number int,round int,game int,partner text,opponents text,my_score int,opponent_score int,result text) language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null or page_number is null or page_number not between 0 and 1000 then raise exception 'Sign in and use a valid page';end if;
 return query select m.id,m.club_id,se.name,s.starts_at,c.number,m.round,m.game,
 coalesce((select string_agg(p.display_name,', ' order by p.display_name) from club_app.members p where p.id=any(case when auth.uid()=any(m.side_a) then m.side_a else m.side_b end) and p.id<>auth.uid()),'Singles'),
 (select string_agg(p.display_name,', ' order by p.display_name) from club_app.members p where p.id=any(case when auth.uid()=any(m.side_a) then m.side_b else m.side_a end)),
 case when auth.uid()=any(m.side_a) then m.score_a else m.score_b end,
 case when auth.uid()=any(m.side_a) then m.score_b else m.score_a end,
 case when (auth.uid()=any(m.side_a) and m.score_a>m.score_b) or (auth.uid()=any(m.side_b) and m.score_b>m.score_a) then 'Won' else 'Lost' end
 from club_app.matches m join club_app.sessions s on s.club_id=m.club_id and s.id=m.session_id join club_app.seasons se on se.club_id=m.club_id and se.id=s.season_id join club_app.courts c on c.club_id=m.club_id and c.id=m.court_id
 where (auth.uid()=any(m.side_a) or auth.uid()=any(m.side_b)) and m.score_a is not null and m.score_b is not null and s.status in ('active','completed')
 order by s.starts_at desc,m.round desc,m.game desc,m.id desc limit 50 offset page_number*50;
end $$;
create function club_app.seed_candidates(c uuid,se uuid) returns table(user_id uuid,display_name text) language plpgsql stable security definer set search_path='' as $$ begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 return query select r.user_id,m.display_name from club_app.registrations r join club_app.members m on m.id=r.user_id join club_app.memberships ms on ms.club_id=r.club_id and ms.user_id=r.user_id
 where r.club_id=c and r.season_id=se and r.status='approved' and ms.status='active' and exists(select 1 from club_app.signature_receipts sr where sr.club_id=c and sr.season_id=se and sr.participant_id=r.user_id and sr.waiver_id=(select p.waiver_id from club_app.agreement_publications p join club_app.waiver_versions w on w.id=p.waiver_id where p.club_id=c and p.season_id=se order by w.version desc limit 1)) order by m.display_name,r.user_id;
end $$;
alter function club_app.set_seeding(uuid,uuid,uuid[],int,text) rename to set_seeding_impl;
revoke all on function club_app.set_seeding_impl(uuid,uuid,uuid[],int,text) from public,anon,authenticated,service_role;
create function club_app.set_seeding(c uuid,se uuid,ordered uuid[],expected_revision int,reason text) returns int language plpgsql security definer set search_path='' as $$ begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 perform 1 from club_app.seasons where club_id=c and id=se for update;
 if exists(select 1 from club_app.seasons where club_id=c and id=se and rules->>'operationsEnabled'='true') and exists(select 1 from unnest(ordered) u where not exists(select 1 from club_app.seed_candidates(c,se) p where p.user_id=u)) then raise exception 'Seeding requires approved registration and current season signature';end if;
 return club_app.set_seeding_impl(c,se,ordered,expected_revision,reason);
end $$;
-- A zero-cost notification policy must not silently activate a billable SMS adapter.
create or replace function club_app.set_sms_preference(c uuid,enabled boolean) returns void language plpgsql security definer set search_path='' as $$ begin
 if enabled is distinct from false then raise exception 'SMS is unavailable under the zero-cost notification policy';end if;
 perform club_app.throttle();update club_app.notification_preferences set enabled=false where club_id=c and user_id=auth.uid() and channel='sms';
end $$;
create table club_app.free_email_usage(day date primary key,reserved int not null default 0 check(reserved between 0 and 90));
alter table club_app.free_email_usage enable row level security;
revoke all on club_app.free_email_usage from public,anon,authenticated;
create function club_app.claim_free_email_batch(batch_size int default 20) returns setof club_app.notification_deliveries language plpgsql security definer set search_path='' as $$ declare today date=(now() at time zone 'UTC')::date; remaining int; n int;begin
 if batch_size is null or batch_size not between 1 and 20 then raise exception 'Invalid batch';end if;
 perform pg_advisory_xact_lock(723150022);
 insert into club_app.free_email_usage(day) values(today) on conflict do nothing;
 select least(batch_size,90-(select reserved from club_app.free_email_usage where day=today),2500-coalesce((select sum(reserved) from club_app.free_email_usage where day>=date_trunc('month',today)::date and day<=today),0))::int into remaining;
 if remaining<=0 then return;end if;
 return query select * from club_app.claim_delivery_batch(remaining,array['email']);get diagnostics n=row_count;
 update club_app.free_email_usage set reserved=reserved+n where day=today;
end $$;
revoke all on function club_app.my_match_history(int),club_app.seed_candidates(uuid,uuid),club_app.set_seeding(uuid,uuid,uuid[],int,text),club_app.claim_free_email_batch(int) from public,anon,authenticated,service_role;
grant execute on function club_app.my_match_history(int),club_app.seed_candidates(uuid,uuid),club_app.set_seeding(uuid,uuid,uuid[],int,text) to authenticated;
grant execute on function club_app.claim_free_email_batch(int) to service_role;
commit;
