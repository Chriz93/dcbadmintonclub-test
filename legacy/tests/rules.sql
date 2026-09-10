-- Local rehearsal of L01/L02 against a copy of the legacy schema. Run with psql -v ON_ERROR_STOP=1.
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if; end $$;
create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
grant usage on schema auth to authenticated,anon; grant execute on all functions in schema auth to authenticated,anon;
-- Legacy tables exactly as production created them (plus the twelve anonymous policies).
create table public.players(id bigint generated always as identity primary key,name text,email text,phone text,emergency text,medical text,sig text,waiver_signed boolean,paid boolean,current_court int,highest_court int,season_wins int,season_losses int,games_played int,no_show_count int,membership_type text,created_at timestamptz default now());
create table public.announcements(id bigint generated always as identity primary key,content text,created_at timestamptz default now());
create table public.app_state(id bigint generated always as identity primary key,key text,value text,created_at timestamptz default now());
alter table public.players enable row level security; alter table public.announcements enable row level security; alter table public.app_state enable row level security;
do $$ declare t text; begin foreach t in array array['players','announcements','app_state'] loop
 execute format('create policy "anon read %1$s" on public.%1$I for select to anon using(true)',t);
 execute format('create policy "anon write %1$s" on public.%1$I for insert to anon with check(true)',t);
 execute format('create policy "anon update %1$s" on public.%1$I for update to anon using(true) with check(true)',t);
 execute format('create policy "anon delete %1$s" on public.%1$I for delete to anon using(true)',t);
end loop; end $$;
grant all on all tables in schema public to anon; grant usage on schema public to anon;
insert into auth.users values('a0000000-0000-0000-0000-000000000001','christygeorge993@gmail.com',now()),('a0000000-0000-0000-0000-000000000002','alice@example.invalid',now()),('a0000000-0000-0000-0000-000000000003','christygeorge993+spare@gmail.com',now()),('a0000000-0000-0000-0000-000000000004','stranger@example.invalid',now());
insert into public.players(name,email,phone,emergency,medical,sig,waiver_signed,paid,current_court,highest_court,season_wins,season_losses,games_played,no_show_count,membership_type) values
 ('Alice Real','alice@example.invalid','613-555-0001','Bob 613','asthma','data:sig',true,true,1,1,10,2,12,0,'regular'),
 ('Carl Real','carl@example.invalid','613-555-0002','Dee 613','','data:sig',true,true,2,1,5,7,12,1,'regular');
insert into public.app_state(key,value) values('current_session','{"number":3,"playerNames":{"1":"Alice Real","2":"Carl Real"}}'),('admin_pin','"1234"'),('invite_code','"MAPLE2026"'),('snapshot_2026','{"players":[{"name":"Alice Real","medical":"asthma"}]}'),('completed_sessions','[{"id":1,"playerNames":{"1":"Alice Real"}}]');
create schema upgrade_backup_20260906; create table upgrade_backup_20260906.players as table public.players;

\i legacy/migrations/L01_auth_and_rules.sql
\i legacy/migrations/L02_test_synthetic_players.sql

-- Anonymous visitors: nothing.
set role anon;
do $$ begin perform * from public.players; raise exception 'anon could read players'; exception when insufficient_privilege then null; end $$;
do $$ begin perform * from public.app_state; raise exception 'anon could read state'; exception when insufficient_privilege then null; end $$;
reset role;
-- Alice signs in (aal1): sees her own full row, other players only through the public view, no snapshots or retired keys.
set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',false); select set_config('request.jwt.claims','{"aal":"aal1","email":"test-player-01@example.invalid"}',false);
do $$ declare n int; begin
 select count(*) into n from public.players; if n<>1 then raise exception 'own-row read expected 1 got %',n; end if;
 select count(*) into n from public.players_public; if n<>2 then raise exception 'public view expected 2 got %',n; end if;
 select count(*) into n from public.app_state where key like 'snapshot_%' or key in ('admin_pin','invite_code'); if n<>0 then raise exception 'private state leaked'; end if;
 if public.my_player_id()<>1 then raise exception 'my_player_id wrong'; end if;
end $$;
select public.set_rsvp(3,1,'coming');
do $$ begin perform public.set_rsvp(3,2,'coming'); raise exception 'forged rsvp accepted'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.set_state('current_session','{}',1); raise exception 'member wrote state'; exception when insufficient_privilege then null; end $$;
do $$ begin update public.players set season_wins=99 where id=2; if found then raise exception 'member updated another player'; end if; end $$;
-- Stranger: no row, not invited -> cannot register.
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000004',false); select set_config('request.jwt.claims','{"aal":"aal1","email":"stranger@example.invalid"}',false);
do $$ begin perform public.register_me('Stranger','','','','','regular'); raise exception 'uninvited registration accepted'; exception when insufficient_privilege then null; end $$;
-- Invited spare registers once, then updates.
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000003',false); select set_config('request.jwt.claims','{"aal":"aal1","email":"christygeorge993+spare@gmail.com"}',false);
select public.register_me('Spare Tester','613-555-0009','EC 613','','','regular') as new_id \gset
do $$ declare m text; begin select membership_type into m from public.players where email='christygeorge993+spare@gmail.com'; if m<>'spare' then raise exception 'invitation type not applied: %',m; end if; end $$;
select public.register_me('Spare Tester Updated','613-555-0010',null,null,null,'regular') as same_id \gset
select :new_id = :same_id as same \gset
\if :same
\echo registration reused existing player
\else
\echo DUPLICATE PLAYER CREATED
\quit 1
\endif
-- Organizer without second factor: still a member, not an admin.
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false); select set_config('request.jwt.claims','{"aal":"aal1","email":"christygeorge993@gmail.com"}',false);
do $$ begin if public.is_admin() then raise exception 'aal1 admin'; end if; if not public.is_admin_any_factor() then raise exception 'organizer not recognised'; end if; end $$;
do $$ begin perform public.set_state('current_session','{}',1); raise exception 'aal1 organizer wrote state'; exception when insufficient_privilege then null; end $$;
-- Organizer with second factor: versioned writes, stale rejected.
select set_config('request.jwt.claims','{"aal":"aal2","email":"christygeorge993@gmail.com"}',false);
do $$ declare v int; n int; begin
 v=public.set_state('current_session','{"number":3}',0); if v<>1 then raise exception 'expected version 1 got %',v; end if;
 v=public.set_state('current_session','{"number":4}',1); if v<>2 then raise exception 'expected version 2 got %',v; end if;
 begin perform public.set_state('current_session','{"number":5}',1); raise exception 'stale write accepted'; exception when serialization_failure then null; end;
 select count(*) into n from public.players; if n<>3 then raise exception 'admin sees % players',n; end if;
 update public.players set paid=false where id=1; if not found then raise exception 'admin update failed'; end if;
 select count(*) into n from public.players where phone<>'' and email like 'test-player-%'; if n<>0 then raise exception 'synthetic replacement left private fields'; end if;
 select count(*) into n from public.app_state where value like '%Alice Real%'; if n<>0 then raise exception 'real name survived in state'; end if;
end $$;
reset role;
select 'RULES PASS' as result;

\i legacy/migrations/L03_scores_and_season.sql
\i legacy/migrations/L05_rollover_registration.sql
\i legacy/migrations/L06_stats_rebuild.sql
-- Court-scoped score entry: player 1 is on court 1 of the active session; player 2 is not.
update public.app_state set value='{"number":4,"cycle":1,"assignments":{"1":[1,2],"6":[3]},"scores":{}}',version=7 where key='current_session';
set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',false); select set_config('request.jwt.claims','{"aal":"aal1","email":"test-player-01@example.invalid"}',false);
do $$ declare v int; begin
 v=public.save_court_scores(1,1,'{"c1_y1_g1":{"a1":1,"a2":null,"b1":2,"b2":null,"sA":21,"sB":15,"w":"A"}}'::jsonb,7);
 if v<>8 then raise exception 'version expected 8 got %',v; end if;
 begin perform public.save_court_scores(1,1,'{"c1_y1_g2":{"a1":1,"a2":null,"b1":2,"b2":null,"sA":21,"sB":21,"w":"A"}}'::jsonb,8); raise exception 'tie accepted'; exception when raise_exception then null; end;
 begin perform public.save_court_scores(1,1,'{"c1_y1_g2":{"a1":1,"a2":null,"b1":2,"b2":null,"sA":22,"sB":20,"w":"A"}}'::jsonb,8); raise exception 'over-score accepted'; exception when raise_exception then null; end;
 begin perform public.save_court_scores(6,1,'{"c6_y1_g1":{"a1":3,"a2":null,"b1":3,"b2":null,"sA":21,"sB":1,"w":"A"}}'::jsonb,8); raise exception 'foreign court accepted'; exception when insufficient_privilege then null; end;
 begin perform public.save_court_scores(1,1,'{"c1_y1_g2":{"a1":1,"a2":null,"b1":2,"b2":null,"sA":21,"sB":3,"w":"A"}}'::jsonb,7); raise exception 'stale accepted'; exception when serialization_failure then null; end;
 begin perform public.save_court_scores(1,2,'{"c1_y2_g1":{"a1":1,"a2":null,"b1":2,"b2":null,"sA":21,"sB":3,"w":"A"}}'::jsonb,8); raise exception 'wrong round accepted'; exception when serialization_failure then null; end;
end $$;
-- Statistics rebuild: completed sessions count fully; only rotated rounds of the live session count; ties count as played.
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false); select set_config('request.jwt.claims','{"aal":"aal2","email":"christygeorge993@gmail.com"}',false);
do $$ declare r jsonb; begin
 perform public.set_state('completed_sessions','[{"id":9,"scores":{"c1_y1_g1":{"a1":1,"a2":null,"b1":2,"b2":null,"sA":21,"sB":10,"w":"A"},"c1_y2_g1":{"a1":1,"a2":null,"b1":2,"b2":null,"sA":15,"sB":15,"w":"T"}},"movements":[{"cycle":1},{"cycle":2}]}]',0);
 perform public.set_state('current_session','{"number":4,"cycle":2,"assignments":{"1":[1,2]},"movements":[{"cycle":1}],"scores":{"c1_y1_g1":{"a1":2,"a2":null,"b1":1,"b2":null,"sA":21,"sB":5,"w":"A"},"c1_y2_g1":{"a1":1,"a2":null,"b1":2,"b2":null,"sA":21,"sB":7,"w":"A"}}}',8);
 r=public.rebuild_player_stats();
 if (select (season_wins,season_losses,games_played) from public.players where id=1)<>(1,1,3) then raise exception 'player 1 stats wrong: %',(select row(season_wins,season_losses,games_played) from public.players where id=1); end if;
 if (select (season_wins,season_losses,games_played) from public.players where id=2)<>(1,1,3) then raise exception 'player 2 stats wrong'; end if;
 r=public.rebuild_player_stats(); if (r->>'players_changed')::int<>0 then raise exception 'rebuild not idempotent'; end if;
end $$;
-- Season rollover (organizer with second factor): archive created, stats zeroed, approval withdrawn.
do $$ declare r jsonb; begin
 begin perform public.start_new_season('2026-27'); raise exception 'rollover with active session accepted'; exception when raise_exception then null; end;
 perform public.delete_state('current_session');
 r=public.start_new_season('2025-26');
 if (r->>'players_reset')::int<>3 then raise exception 'players reset %',r; end if;
 if exists(select 1 from public.players where approved or season_wins<>0 or registered_at is not null) then raise exception 'stats not reset'; end if;
 if not exists(select 1 from public.app_state where key='archive_2025-26') then raise exception 'archive missing'; end if;
 begin perform public.start_new_season('2025-26'); raise exception 'duplicate archive accepted'; exception when raise_exception then null; end;
end $$;
reset role;
select 'PHASE2 RULES PASS' as result;

-- ── L07: reminder targets and spare seats ──────────────────────────────────────────────────────
\i legacy/migrations/L07_reminders_and_spares.sql
reset role;
-- Fresh season 3 for this block: players 1 (regular, court 1), 2 (regular), 3 (spare) approved again.
update public.players set approved=true,waitlisted=false where id in(1,2,3);
update public.players set membership_type='spare' where id=3;
update public.players set user_id='a0000000-0000-0000-0000-000000000002' where id=1;
delete from public.rsvps where session_number=7;
set role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',false); select set_config('request.jwt.claims','{"aal":"aal1","email":"alice@example.invalid"}',false);
do $$ begin
 perform public.set_email_reminders(false);
 if (select email_reminders from public.players where id=1) then raise exception 'opt-out not stored'; end if;
 perform public.set_email_reminders(true);
 begin perform public.reminder_targets(7); raise exception 'member could read reminder targets'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare n int; begin
 -- Nobody answered: both regulars are targets, the spare is not (no open seat).
 select count(*) into n from public.reminder_targets(7) where kind='vote'; if n<>2 then raise exception 'vote targets %',n; end if;
 select count(*) into n from public.reminder_targets(7) where kind='spare'; if n<>0 then raise exception 'spare invited without a seat'; end if;
 -- Alice declines: one seat opens, the spare becomes a target, Alice no longer is.
 insert into public.rsvps(session_number,player_id,response) values(7,1,'notcoming');
 select count(*) into n from public.reminder_targets(7) where kind='spare' and open_seats=1; if n<>1 then raise exception 'spare not invited'; end if;
 select count(*) into n from public.reminder_targets(7) where kind='vote'; if n<>1 then raise exception 'declined player still targeted'; end if;
 -- Opted-out players are never targeted.
 update public.players set email_reminders=false where id=2;
 select count(*) into n from public.reminder_targets(7); if n<>1 then raise exception 'opt-out ignored'; end if;
 update public.players set email_reminders=true where id=2;
 -- The spare claims the seat: confirmed, rank 1, no seats left.
 insert into public.rsvps(session_number,player_id,response) values(7,3,'coming');
 if not exists(select 1 from public.spare_seats(7) where player_id=3 and rank=1 and confirmed and open_seats=0) then raise exception 'spare not confirmed'; end if;
 select count(*) into n from public.reminder_targets(7) where kind='spare'; if n<>0 then raise exception 'confirmed spare still targeted'; end if;
 -- Alice changes her mind: the spare drops to standby.
 update public.rsvps set response='coming' where session_number=7 and player_id=1;
 if exists(select 1 from public.spare_seats(7) where player_id=3 and confirmed) then raise exception 'standby not applied'; end if;
 -- Reminder log refuses duplicates.
 insert into public.reminder_log(session_number,player_id,kind) values(7,2,'vote-1');
 begin insert into public.reminder_log(session_number,player_id,kind) values(7,2,'vote-1'); raise exception 'duplicate reminder logged'; exception when unique_violation then null; end;
end $$;
select 'PHASE3 RULES PASS' as result;

-- ── L08: payment ledger and push subscriptions ─────────────────────────────────────────────────
\i legacy/migrations/L08_payments_and_push.sql
reset role;
update public.players set membership_type='regular',paid=false where id=1;
set role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',false); select set_config('request.jwt.claims','{"aal":"aal1","email":"alice@example.invalid"}',false);
do $$ begin
 begin perform public.record_payment(1,'season',400); raise exception 'member recorded a payment'; exception when insufficient_privilege then null; end;
 perform public.save_push_subscription('https://push.example/abc','p256','auth','Safari');
 if (select count(*) from public.push_subscriptions where player_id=1)<>1 then raise exception 'subscription not saved'; end if;
 perform public.save_push_subscription('https://push.example/abc','p256b','auth2','Safari');
 if (select p256dh from public.push_subscriptions where endpoint='https://push.example/abc')<>'p256b' then raise exception 'subscription not refreshed'; end if;
 begin perform public.save_push_subscription('http://insecure','x','y'); raise exception 'insecure endpoint accepted'; exception when raise_exception then null; end;
 if (select count(*) from public.payments)<>0 then raise exception 'member sees payments that do not exist'; end if;
end $$;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false); select set_config('request.jwt.claims','{"aal":"aal2","email":"christygeorge993@gmail.com"}',false);
do $$ declare pid bigint; begin
 pid=public.record_payment(1,'season',200,null,'2026-09-10','first half');
 if (select paid from public.players where id=1) then raise exception 'half payment marked paid'; end if;
 perform public.record_payment(1,'season',200);
 if not (select paid from public.players where id=1) then raise exception 'full payment not marked paid'; end if;
 perform public.record_payment(1,'refund',14,3,current_date,'declined 72h before');
 if not (select paid from public.players where id=1) then raise exception 'refund of an absence should not unpay the season'; end if;
 perform public.delete_payment(pid);
 if (select paid from public.players where id=1) then raise exception 'deleting a payment did not refresh the flag'; end if;
 update public.players set membership_type='spare' where id=3;
 perform public.record_payment(3,'spare',20,2);
 if not (select paid from public.players where id=3) then raise exception 'spare fee not marked paid'; end if;
 if (select count(*) from public.audit_log where action in('payment.recorded','payment.deleted'))<>5 then raise exception 'payment audit incomplete'; end if;
end $$;
-- A member sees only their own ledger.
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',false); select set_config('request.jwt.claims','{"aal":"aal1","email":"alice@example.invalid"}',false);
do $$ begin
 if (select count(*) from public.payments)<>2 or exists(select 1 from public.payments where player_id<>1) then raise exception 'member sees another ledger'; end if;
end $$;
reset role;
select 'PHASE4 RULES PASS' as result;

-- ── L09: organizers register themselves; invitations still gate everyone else ───────────────────
\i legacy/migrations/L09_invites.sql
reset role;
insert into auth.users values('a0000000-0000-0000-0000-000000000009','nobody@example.invalid',now()) on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000009',false); select set_config('request.jwt.claims','{"aal":"aal1","email":"nobody@example.invalid"}',false);
do $$ begin
 begin perform public.register_me('Nobody Here','','','','data:sig','regular'); raise exception 'stranger registered'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false); select set_config('request.jwt.claims','{"aal":"aal1","email":"christygeorge993@gmail.com"}',false);
do $$ declare pid bigint; begin
 pid=public.register_me('Christy Organizer','613','x','','data:sig','regular');
 if (select email from public.players where id=pid)<>'christygeorge993@gmail.com' then raise exception 'organizer row wrong'; end if;
end $$;
reset role;
select 'PHASE5 RULES PASS' as result;

-- ── L10: payment declaration at registration; regulars cannot change a vote inside 48 hours ────────
\i legacy/migrations/L10_payment_declaration_and_vote_lock.sql
reset role;
insert into public.season_dates(session_number,play_on,start_at) values(7,current_date,now()+interval '10 hours') on conflict(session_number) do update set start_at=excluded.start_at;
insert into public.season_dates(session_number,play_on,start_at) values(8,current_date+7,now()+interval '7 days') on conflict(session_number) do update set start_at=excluded.start_at;
update public.players set membership_type='regular' where id=1; update public.players set membership_type='spare' where id=3;
set role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',false); select set_config('request.jwt.claims','{"aal":"aal1","email":"alice@example.invalid"}',false);
do $$ begin
 perform public.register_me('Alice Real','613','Bob','','data:sig','regular','paid_full');
 if (select declared_payment from public.players where id=1)<>'paid_full' then raise exception 'declaration not stored'; end if;
 perform public.set_rsvp(8,1,'coming'); -- a week out: fine
 begin perform public.set_rsvp(7,1,'notcoming'); raise exception 'vote changed inside 48 hours'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000003',false); select set_config('request.jwt.claims','{"aal":"aal1","email":"carl@example.invalid"}',false);
reset role;
update public.players set user_id='a0000000-0000-0000-0000-000000000003' where id=3;
set role authenticated;
do $$ begin perform public.set_rsvp(7,3,'coming'); end $$; -- spares keep claiming seats
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false); select set_config('request.jwt.claims','{"aal":"aal2","email":"christygeorge993@gmail.com"}',false);
do $$ begin perform public.set_rsvp(7,1,'notcoming'); if (select response from public.rsvps where session_number=7 and player_id=1)<>'notcoming' then raise exception 'admin override failed'; end if; end $$;
reset role;
select 'PHASE6 RULES PASS' as result;
