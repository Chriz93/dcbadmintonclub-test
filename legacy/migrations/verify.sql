-- Post-migration verification for this TEST release (L24). Every row must say OK.
select 'rls '||c.relname as check_name,case when c.relrowsecurity then 'OK' else 'FAIL: RLS off' end as result
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
union all
select 'anon table grants',case when count(*)=0 then 'OK' else 'FAIL: '||count(*)||' grants' end from information_schema.role_table_grants where grantee='anon' and table_schema='public'
union all
select 'anon function grants',case when count(*)=0 then 'OK' else 'FAIL: '||count(*) end from information_schema.role_routine_grants where grantee='anon' and specific_schema='public'
union all
select 'anon policies',case when count(*)=0 then 'OK' else 'FAIL: '||count(*) end from pg_policies where schemaname='public' and 'anon'=any(roles)
union all
select 'function '||f,case when to_regprocedure(sig) is not null then 'OK' else 'FAIL: missing' end
from (values('is_admin','public.is_admin()'),('dispatch_reminder_job','public.dispatch_reminder_job(text)'),('set_state','public.set_state(text,text,int)'),('register_me','public.register_me(text,text,text,text,text,text,text,text,text,text,text,int,text,text,boolean,text)'),('save_court_scores','public.save_court_scores(int,int,jsonb,int,text,jsonb)'),('start_new_season','public.start_new_season(text,jsonb)'),('rebuild_player_stats','public.rebuild_player_stats()'),('set_rsvp','public.set_rsvp(int,bigint,text,text)'),('reminder_targets','public.reminder_targets(int)'),('spare_seats','public.spare_seats(int)'),('set_email_reminders','public.set_email_reminders(boolean)'),('record_payment','public.record_payment(bigint,text,numeric,int,date,text,uuid)'),('save_push_subscription','public.save_push_subscription(text,text,text,text)'),('checkpoint','public.checkpoint(text)'),('undo_last','public.undo_last()')) v(f,sig)
union all
select 'organizer in app_admins',case when count(*)>=1 then 'OK' else 'FAIL: run P00_organizer.sql after first sign-in' end from public.app_admins
union all
select 'players_public hides PII',case when count(*)=0 then 'OK' else 'FAIL' end from information_schema.columns where table_schema='public' and table_name='players_public' and column_name in('email','phone','emergency','medical','sig')
union all
select 'legacy secrets removed',case when count(*)=0 then 'OK' else 'FAIL: '||string_agg(key,',') end from public.app_state where key in('admin_pin','pin','invite_code')
union all
select 'app_state versions',case when count(*)=count(version) then 'OK' else 'FAIL' end from public.app_state
union all
select 'votes only through set_rsvp (L15)',case when count(*)=0 then 'OK' else 'FAIL: '||string_agg(policyname,',') end from pg_policies where schemaname='public' and tablename='rsvps' and cmd<>'SELECT'
union all
select 'no TRUNCATE for site roles (L15)',case when count(*)=0 then 'OK' else 'FAIL: '||count(*) end from information_schema.role_table_grants where table_schema='public' and privilege_type='TRUNCATE' and grantee in('anon','authenticated','service_role')
union all
select 'no REFERENCES or TRIGGER for site roles (L21)',case when count(*)=0 then 'OK' else 'FAIL: '||count(*) end from information_schema.role_table_grants where table_schema='public' and privilege_type in('REFERENCES','TRIGGER') and grantee in('anon','authenticated','service_role')
union all
select 'payment archive (L15)',case when to_regclass('public.payments_archive') is not null then 'OK' else 'FAIL: missing' end
union all
select 'question asker from record (L15)',case when count(*)=1 then 'OK' else 'FAIL' end from pg_trigger where tgname='questions_asker' and tgrelid='public.questions'::regclass
union all
select 'player columns',case when count(*)=8 then 'OK' else 'FAIL: '||count(*)||'/8' end from information_schema.columns where table_schema='public' and table_name='players' and column_name in('approved','waitlisted','registered_at','admin_note','user_id','updated_at','email_reminders','membership_type')
union all
select 'TEST environment and schema',case when count(*)=1 and bool_and(name='test' and schema_version='L24') then 'OK: '||max(name)||' '||max(schema_version) else 'FAIL: run T01 (TEST) or P01 (production)' end from public.environment
union all
select 'environment guard (L18)',case when count(*)=1 then 'OK' else 'FAIL' end from pg_trigger where tgname='environment_guard' and tgrelid='public.environment'::regclass
union all
select 'function '||f,case when to_regprocedure(sig) is not null then 'OK' else 'FAIL: missing' end
from (values('assert_test_environment','public.assert_test_environment()'),('record_waiver_acceptance','public.record_waiver_acceptance(bigint,text,text,text,text,text,text,int,text,text,text,boolean,text)'),('accept_waiver','public.accept_waiver(text,text,text,text,int,text,text,boolean,text)'),('publish_waiver_version','public.publish_waiver_version(text)')) v(f,sig)
union all
select 'no old register_me (L20)',case when to_regprocedure('public.register_me(text,text,text,text,text,text,text)') is null then 'OK' else 'FAIL: the 7-argument version still exists' end
union all
select 'best of three (L19)',case when bool_or(prosrc like '%Best of three%') then 'OK' else 'FAIL' end from pg_proc where proname='save_court_scores' and pronamespace='public'::regnamespace
union all
select 'waiver guards (L20)',case when count(*)=2 then 'OK' else 'FAIL: '||count(*)||'/2' end from pg_trigger where tgname in('waiver_versions_guard','waiver_acceptances_guard')
union all
select 'one current waiver (L20)',case when count(*)=1 then 'OK: '||max(version) else 'FAIL: '||count(*) end from public.waiver_versions where is_current
union all
select 'waiver digests (L20)',case when count(*)=0 then 'OK' else 'FAIL: '||count(*) end from public.waiver_versions where sha256<>encode(sha256(convert_to(body,'UTF8')),'hex')
union all
select 'waiver records cannot be written directly (L20)',case when count(*)=0 then 'OK' else 'FAIL: '||count(*) end from information_schema.role_table_grants where table_schema='public' and table_name in('waiver_acceptances','waiver_versions','environment') and privilege_type in('INSERT','UPDATE','DELETE') and grantee in('anon','authenticated','service_role')
union all
select 'function '||f,case when to_regprocedure(sig) is not null then 'OK' else 'FAIL: missing' end
from (values('start_league_session','public.start_league_session(jsonb)'),('finalize_session','public.finalize_session(text,int,jsonb,boolean,text)'),('save_league_snapshot','public.save_league_snapshot(text)'),('restore_league_snapshot','public.restore_league_snapshot(text)'),('list_league_snapshots','public.list_league_snapshots()'),('archive_player','public.archive_player(bigint)'),('add_league_player','public.add_league_player(text,int,text)'),('cancel_league_session','public.cancel_league_session(int,int,text,text,numeric)'),('settle_cancellation','public.settle_cancellation(int,bigint)'),('spare_seat_status','public.spare_seat_status(int)')) v(f,sig)
union all
select 'payment request uniqueness',case when exists(select 1 from pg_index where indexrelid=to_regclass('public.payments_request_unique') and indisunique) then 'OK' else 'FAIL: missing unique request index' end
union all
select 'season configuration',case when exists(select 1 from public.app_state where key='season_config' and jsonb_array_length(value::jsonb->'approved_dates')=(select count(*) from public.season_dates)) then 'OK' else 'FAIL: missing calendar/configuration' end
union all
select 'every lock-taking function is bounded (L26)',case when count(*)=0 then 'OK' else 'FAIL: '||string_agg(proname,', ') end
from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
where ns.nspname='public' and p.prosrc like '%pg_advisory_xact_lock(7262026)%'
  and not (coalesce(array_to_string(p.proconfig,','),'') like '%lock_timeout%' and coalesce(array_to_string(p.proconfig,','),'') like '%statement_timeout%')
union all
-- L27: a score save locks its own court, so six courts never queue behind one another.
select 'save_court_scores locks per court (L27)',
  case when exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname='save_court_scores'
                     and p.prosrc like '%pg_advisory_xact_lock(7262026, p_court)%')
       then 'OK' else 'FAIL: still takes the league-wide lock' end
union all
-- L27: a dropped connection can never hold the league lock by going idle inside its transaction (22 September).
select 'app roles give up an idle transaction (L27)',
  case when (select count(*) from pg_roles where rolname in ('authenticated','anon','service_role')
               and array_to_string(rolconfig,',') like '%idle_in_transaction_session_timeout%') = 3
       then 'OK' else 'FAIL: a stranded transaction can hold the league lock' end
union all
select 'retired unsafe API signatures',case when to_regprocedure('public.save_court_scores(int,int,jsonb,int)') is null and to_regprocedure('public.start_new_season(text)') is null and to_regprocedure('public.record_payment(bigint,text,numeric,int,date,text)') is null then 'OK' else 'FAIL: old API still callable' end;
