-- L26 (16 September 2026): a blocked write fails in seconds instead of wedging the whole app.
-- What happened on 15 September, session 1: a score save for Court 1 timed out at the API gateway while holding the
-- league's single advisory lock (7262026). The call kept running in the database; the gateway retried; every retry
-- queued behind the same lock. Within minutes the API's small connection pool was full of waiting calls, so even plain
-- reads of app_state returned 504 and every phone lost the Courts and Scores tabs. It never recovered on its own: three
-- hours later eight connections were still queued. Nothing was lost — 11 scores saved before it wedged — but the night
-- could not be finished in the app.
-- The fix: every function that takes that lock now waits at most 5 seconds for it and runs at most 20 seconds in total.
-- A save that cannot get the lock fails quickly with "canceling statement due to lock timeout" and the organizer can
-- simply save again; the connection is freed instead of being held, so reads keep working and the app stays usable.
-- This changes no data and no logic; it only bounds how long these functions may wait and run.
begin;
do $$
declare r record; n int := 0;
begin
 for r in
   select p.oid::regprocedure as sig
   from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.prosrc like '%pg_advisory_xact_lock(7262026)%'
 loop
   execute format('alter function %s set lock_timeout = %L', r.sig, '5s');
   execute format('alter function %s set statement_timeout = %L', r.sig, '20s');
   n := n + 1;
 end loop;
 if n = 0 then raise exception 'Refusing: no function takes the league lock; check the schema version'; end if;
 raise notice 'bounded % functions', n;
end $$;
commit;
select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as function,
       coalesce((select string_agg(c, ', ') from unnest(p.proconfig) c where c like 'lock_timeout%' or c like 'statement_timeout%'), 'NOT BOUNDED') as limits
from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
where ns.nspname = 'public' and p.prosrc like '%pg_advisory_xact_lock(7262026)%'
order by 1;
