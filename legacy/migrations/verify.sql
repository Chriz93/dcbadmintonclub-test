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
from (values('is_admin','public.is_admin()'),('set_state','public.set_state(text,text,int)'),('register_me','public.register_me(text,text,text,text,text,text,text)'),('save_court_scores','public.save_court_scores(int,int,jsonb,int)'),('start_new_season','public.start_new_season(text)'),('rebuild_player_stats','public.rebuild_player_stats()'),('set_rsvp','public.set_rsvp(int,bigint,text,text)'),('reminder_targets','public.reminder_targets(int)'),('spare_seats','public.spare_seats(int)'),('set_email_reminders','public.set_email_reminders(boolean)'),('record_payment','public.record_payment(bigint,text,numeric,int,date,text)'),('save_push_subscription','public.save_push_subscription(text,text,text,text)')) v(f,sig)
union all
select 'organizer in app_admins',case when count(*)>=1 then 'OK' else 'FAIL: run P00_organizer.sql after first sign-in' end from public.app_admins
union all
select 'players_public hides PII',case when count(*)=0 then 'OK' else 'FAIL' end from information_schema.columns where table_schema='public' and table_name='players_public' and column_name in('email','phone','emergency','medical','sig')
union all
select 'legacy secrets removed',case when count(*)=0 then 'OK' else 'FAIL: '||string_agg(key,',') end from public.app_state where key in('admin_pin','pin','invite_code')
union all
select 'app_state versions',case when count(*)=count(version) then 'OK' else 'FAIL' end from public.app_state
union all
select 'player columns',case when count(*)=8 then 'OK' else 'FAIL: '||count(*)||'/8' end from information_schema.columns where table_schema='public' and table_name='players' and column_name in('approved','waitlisted','registered_at','admin_note','user_id','updated_at','email_reminders','membership_type');
