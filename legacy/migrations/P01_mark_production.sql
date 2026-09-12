-- P01: marks the PRODUCTION project (bwepvxelvwgwxrnaglrx) as the production environment. PREPARED ONLY: run it as part
-- of an approved production release (docs/28, section "Production release"), never before the organizer approves.
-- It refuses a database already marked test, and one whose past players are all synthetic (that is TEST).
begin;
do $$ declare real_people int := 0; synthetic int := 0; begin
 if exists(select 1 from public.environment where name='test') then raise exception 'Refusing: this database is marked test'; end if;
 select count(*) filter (where coalesce(email,'')<>'' and email not like '%@example.invalid'),
        count(*) filter (where email like '%@example.invalid') into real_people,synthetic from public.past_players;
 if synthetic>0 and real_people<=5 then raise exception 'Refusing: past players are synthetic; this looks like TEST'; end if;
end $$;
insert into public.environment(name,schema_version) values('production','L19') on conflict(id) do update set schema_version=excluded.schema_version;
commit;
select name,schema_version,marked_at from public.environment;
