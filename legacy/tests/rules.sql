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
-- Season rollover (organizer with second factor): archive created, stats zeroed, approval withdrawn.
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false); select set_config('request.jwt.claims','{"aal":"aal2","email":"christygeorge993@gmail.com"}',false);
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
