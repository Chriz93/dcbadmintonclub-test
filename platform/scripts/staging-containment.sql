-- TEST PROJECT ONLY: wgolevihkvmosajumzvl. Verify dashboard project before running.
-- Internal safety snapshot, NOT a replacement for a verified encrypted external backup.
begin;
lock table public.players, public.announcements, public.app_state in share mode;
create schema upgrade_backup_20260906;
revoke all on schema upgrade_backup_20260906 from public,anon,authenticated,service_role;
create table upgrade_backup_20260906.players as table public.players;
create table upgrade_backup_20260906.announcements as table public.announcements;
create table upgrade_backup_20260906.app_state as table public.app_state;
create table upgrade_backup_20260906.policies as select * from pg_policies where schemaname='public' and tablename in ('players','announcements','app_state');
revoke all on all tables in schema upgrade_backup_20260906 from public,anon,authenticated,service_role;
do $$ declare t text; original_hash text; backup_hash text; begin
 foreach t in array array['players','announcements','app_state'] loop
  execute format('select md5(string_agg(to_jsonb(r)::text, %L order by id)) from public.%I r','',t) into original_hash;
  execute format('select md5(string_agg(to_jsonb(r)::text, %L order by id)) from upgrade_backup_20260906.%I r','',t) into backup_hash;
  if original_hash is distinct from backup_hash then raise exception 'Snapshot verification failed for %',t;end if;
 end loop;
end $$;
revoke all on public.players,public.announcements,public.app_state from public,anon,authenticated;
commit;
select 'TEST snapshot verified; legacy browser grants revoked' as result,(select count(*) from public.players) as players,(select count(*) from public.announcements) as announcements,(select count(*) from public.app_state) as state_keys,has_table_privilege('anon','public.players','SELECT') as anon_players_read,has_table_privilege('anon','public.app_state','UPDATE') as anon_state_write;
