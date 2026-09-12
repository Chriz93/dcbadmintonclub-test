-- T01: marks the TEST project (wgolevihkvmosajumzvl) as the test environment. TEST ONLY — never run on production.
-- Run in the SQL editor of the TEST project after checking the project name and reference in the page address.
-- It refuses a database already marked production, and one whose past players look like real people (production's
-- past_players holds last season's real addresses; TEST's holds synthetic @example.invalid players).
begin;
do $$ declare real_people int := 0; begin
 if exists(select 1 from public.environment where name='production') then raise exception 'Refusing: this database is marked production'; end if;
 if to_regclass('public.past_players') is not null then
  select count(*) into real_people from public.past_players where coalesce(email,'')<>'' and email not like '%@example.invalid';
  if real_people>5 then raise exception 'Refusing: % past players have real email addresses; this looks like production', real_people; end if;
 end if;
end $$;
insert into public.environment(name,schema_version) values('test','L19') on conflict(id) do update set schema_version=excluded.schema_version;
commit;
select name,schema_version,marked_at from public.environment;
