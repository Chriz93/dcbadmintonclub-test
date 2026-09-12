-- Post-migration verification. Every row must say OK.
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
from (values('is_admin','public.is_admin()'),('dispatch_reminder_job','public.dispatch_reminder_job(text)'),('set_state','public.set_state(text,text,int)'),('register_me','public.register_me(text,text,text,text,text,text,text,text,text,text,text,int,text,text,boolean,text)'),('save_court_scores','public.save_court_scores(int,int,jsonb,int)'),('start_new_season','public.start_new_season(text)'),('rebuild_player_stats','public.rebuild_player_stats()'),('set_rsvp','public.set_rsvp(int,bigint,text,text)'),('reminder_targets','public.reminder_targets(int)'),('spare_seats','public.spare_seats(int)'),('set_email_reminders','public.set_email_reminders(boolean)'),('record_payment','public.record_payment(bigint,text,numeric,int,date,text)'),('save_push_subscription','public.save_push_subscription(text,text,text,text)'),('checkpoint','public.checkpoint(text)'),('undo_last','public.undo_last()')) v(f,sig)
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
select 'environment marker (L18)',case when count(*)=1 then 'OK: '||max(name)||' '||max(schema_version) else 'FAIL: run T01 (TEST) or P01 (production)' end from public.environment
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
select 'waiver records cannot be written directly (L20)',case when count(*)=0 then 'OK' else 'FAIL: '||count(*) end from information_schema.role_table_grants where table_schema='public' and table_name in('waiver_acceptances','waiver_versions','environment') and privilege_type in('INSERT','UPDATE','DELETE') and grantee in('anon','authenticated','service_role');
