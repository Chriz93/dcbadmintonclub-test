-- Production only, run AFTER the organizer has signed in once on the new site (that creates the auth user).
-- Makes the organizer's account the league organizer; nothing else changes.
insert into public.app_admins(user_id,email)
select id,lower(email) from auth.users where lower(email)='christygeorge993@gmail.com'
on conflict do nothing;
select case when exists(select 1 from public.app_admins a join auth.users u on u.id=a.user_id where lower(u.email)='christygeorge993@gmail.com')
 then 'ORGANIZER OK' else 'ORGANIZER MISSING — sign in on the new site first, then run again' end as result;
