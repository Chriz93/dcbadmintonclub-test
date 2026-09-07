-- READ ONLY. Run in Supabase TEST wgolevihkvmosajumzvl only.
select 'RLS disabled' as check_name,count(*) as failures from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='club_app' and c.relkind='r' and not c.relrowsecurity
union all
select 'Anonymous table privileges',count(*) from information_schema.role_table_grants where table_schema='club_app' and grantee='anon'
union all
select 'Member direct table writes',count(*) from information_schema.role_table_grants where table_schema='club_app' and grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
union all
select 'Browser private helper execution',count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_app' and (p.proname like '%\_impl' escape '\' or p.proname in ('rebuild_results','rebuild_elo','promote_paid_spares','delivery_target','claim_delivery_batch','queue_due_reminders','unsubscribe_channel')) and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'));
select to_regprocedure('club_app.assign_reviewed_courts(uuid,uuid,integer,jsonb,integer,text,uuid[])') is not null as reviewed_assignment_ready,
 to_regprocedure('club_app.sign_agreement(uuid,uuid,uuid,uuid,text,text,text,boolean,boolean)') is not null as signatures_ready,
 to_regprocedure('club_app.undo_round_restart(uuid,bigint,integer,text)') is not null as undo_ready,
 to_regprocedure('club_app.withdraw_spare(uuid,uuid,integer,text)') is not null as spare_release_ready;
select name,regular_capacity,rules from club_app.seasons where id='40000000-0000-0000-0000-000000000001';
select status,count(*) from club_app.sessions where season_id='40000000-0000-0000-0000-000000000001' group by status;
select count(*) as notification_jobs from club_app.notification_deliveries;
