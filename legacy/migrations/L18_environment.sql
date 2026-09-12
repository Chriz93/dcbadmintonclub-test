-- L18: environment marker and schema version. Each database states which environment it is (test or production) and
-- which schema release it runs. Seed, reset and test scripts call public.assert_test_environment() first and refuse to
-- run anywhere not marked test; the site refuses to load when the database's marker contradicts the site it is on.
-- Signed-in users may read it (the site checks it right after sign-in); anonymous visitors get nothing, as everywhere.
-- The marker row is written once per project, by hand: T01_mark_test.sql on TEST, P01_mark_production.sql on production.
begin;
create table if not exists public.environment(
  id boolean primary key default true check (id),                -- one row only
  name text not null check (name in ('test','production')),
  schema_version text not null,
  marked_at timestamptz not null default now());
alter table public.environment enable row level security;
revoke all on public.environment from public,anon,authenticated;
drop policy if exists "anyone reads the environment" on public.environment;
drop policy if exists "signed-in users read the environment" on public.environment;
create policy "signed-in users read the environment" on public.environment for select to authenticated using(true);
grant select on public.environment to authenticated,service_role;
-- The name can never be switched in place (production can not be relabelled test by an update); only the version moves.
create or replace function public.environment_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_op='UPDATE' and new.name<>old.name then raise exception 'The environment name cannot be changed' using errcode='42501'; end if;
 if tg_op='DELETE' then raise exception 'The environment marker cannot be removed' using errcode='42501'; end if;
 return coalesce(new,old);
end $$;
drop trigger if exists environment_guard on public.environment;
create trigger environment_guard before update or delete on public.environment for each row execute function public.environment_guard();
-- Every seed, reset or test script starts with: select public.assert_test_environment();
create or replace function public.assert_test_environment() returns void language plpgsql stable security definer set search_path='' as $$ begin
 if not exists(select 1 from public.environment where name='test') then
  raise exception 'Refusing: this database is not marked as the TEST environment. Seed, reset and test scripts run on TEST only.' using errcode='42501';
 end if;
end $$;
revoke all on function public.assert_test_environment() from public,anon,authenticated;
commit;
