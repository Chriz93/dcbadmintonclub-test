-- TEST PROJECT ONLY (wgolevihkvmosajumzvl). Replaces the copied real player records with synthetic ones,
-- keeping ids so historical sessions stay consistent. Originals remain in upgrade_backup_20260906 and in production.
begin;
do $$ declare p record; n int=0; newname text; begin
 if to_regnamespace('upgrade_backup_20260906') is null then raise exception 'Protected snapshot missing; refusing to replace player records';end if;
 for p in select id,name from public.players order by id loop
  n=n+1; newname='TEST Player '||lpad(n::text,2,'0');
  update public.app_state set value=replace(value,to_json(p.name)::text,to_json(newname)::text) where value like '%'||replace(p.name,'%','')||'%';
  update public.players set name=newname,email='test-player-'||lpad(n::text,2,'0')||'@example.invalid',phone='',emergency='',medical='',sig=case when sig is not null and sig<>'' then 'admin' else '' end,admin_note='',user_id=null where id=p.id;
 end loop;
end $$;
delete from public.app_state where key in ('admin_pin','pin','invite_code') or key like 'snapshot_%';
-- Organizer account and the authorized test identities.
insert into public.app_admins(user_id,label) select id,'Christy' from auth.users where lower(email)='christygeorge993@gmail.com' on conflict do nothing;
insert into public.invitations(email,membership_type,note) values
 ('christygeorge993+regular@gmail.com','regular','authorized test identity'),
 ('christygeorge993+spare@gmail.com','spare','authorized test identity'),
 ('christygeorge993+minor@gmail.com','regular','authorized test identity (under 18)'),
 ('christygeorge993+guardian@gmail.com','regular','authorized test identity (guardian)')
on conflict(email) do nothing;
commit;
select (select count(*) from public.players where email like 'test-player-%@example.invalid') synthetic_players,(select count(*) from public.players where phone<>'' or medical<>'' or emergency<>'') remaining_private_fields,(select count(*) from public.app_state where key like 'snapshot_%' or key in ('admin_pin','pin','invite_code')) retired_keys,(select count(*) from public.app_admins) organizers,(select count(*) from public.invitations) invitations;
