-- P02: production, 14 September 2026, run after PROD_2026-09-12.sql. Its verification reported "anon function grants:
-- FAIL: 3": the trigger functions created by L18 and L20 kept Supabase's default EXECUTE grant to anon. They are
-- trigger-only (invoker rights, return trigger), so nothing could call them as an API, but the gate requires none.
-- Postgres checks EXECUTE on a trigger function only when the trigger is created, so the triggers keep firing.
revoke all on function public.environment_guard() from public,anon;
revoke all on function public.waiver_versions_guard() from public,anon;
revoke all on function public.waiver_acceptances_guard() from public,anon;
select 'anon function grants' check_name, case when count(*)=0 then 'OK' else 'FAIL: '||count(*) end result from information_schema.role_routine_grants where grantee='anon' and specific_schema='public';
