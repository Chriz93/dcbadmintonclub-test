-- L30 (5 October 2026): the database counts spare seats by the same rule as the app, in one place.
--
-- THE MISMATCH, measured on the production backup of 4 October (Session 4: 25 regulars with a court, 20 said coming,
-- 2 said not coming, 3 never answered, 1 spare available):
--     the app showed                                            1 spare seat   (24 - the regulars not declining)
--     the app shows after p96                                   4 spare seats  (24 - the regulars who said coming)
--     spare_seat_status() said                                  2 spare seats  (one per decline)
--     reminder_targets()   said                                 2 spare seats  (its own copy of the same rule)
-- Four numbers for one night, from three rules written three times. The rule the organizer agreed (p69, 14 September:
-- "we have 27 regular players, if say 4 of them voted no, we will take in one spare") is that the spares fill the courts
-- up to 24 players — six courts of four. One seat per decline only coincides with that when exactly 24 regulars hold a
-- court; with 25 it under-counted, and with fewer than 24 it under-counted badly.
--
-- This matters because those two functions drive what players receive: who is told "your seat is reserved"
-- (spare_reservation_targets, built on spare_seat_status) and which spares are asked whether they are available
-- (reminder_targets). Under-counting meant a spare who really had a seat was never asked, while the organizer's own
-- screen said a seat was open.
--
-- Now there is ONE rule, in spare_seat_count: 24 minus the regulars who said "coming" (or whom the organizer marked
-- present before the night), leaving out anyone marked absent and anyone archived. Both functions use it. Nothing else
-- about either changes — the order spares are ranked in (answer time, then id), what counts as paid, who is skipped for
-- having answered already or turned reminders off, and the shape of both results are untouched.
--
-- NOTE for whoever applies this to production: more spares can hold a reserved seat and more can be asked whether they
-- are available, so the reminder worker can send more messages than it used to. That is the point of the fix, but it is
-- a change in what players receive, so it needs the organizer's explicit go-ahead before production.
begin;

-- Six courts of four: the spares fill tonight up to 24 players. Silence is not a yes (p96).
create or replace function public.spare_seat_count(p_session int) returns int language sql stable security definer set search_path='' as $$
 with pre as (select coalesce((select value::jsonb from public.app_state where key='pre_session_attendance'),'{}'::jsonb) j)
 select greatest(24-(
   select count(*)::int
   from public.players p cross join pre
   where p.approved and not p.waitlisted and p.archived_at is null and coalesce(p.membership_type,'regular')<>'spare'
     and coalesce(p.current_court,0)>0
     and coalesce(pre.j->>p.id::text,'') <> 'absent'
     and ((select r.response from public.rsvps r where r.session_number=p_session and r.player_id=p.id)='coming'
          or coalesce(pre.j->>p.id::text,'')='present')),0)
$$;
revoke all on function public.spare_seat_count(int) from public,anon;
grant execute on function public.spare_seat_count(int) to authenticated,service_role;

create or replace function public.spare_seat_status(p_session int) returns table(player_id bigint,rank int,reserved boolean,paid boolean,confirmed boolean,open_seats int) language sql stable security definer set search_path='' as $$
 with seats as (select public.spare_seat_count(p_session) n),
 claims as (select r.player_id,row_number() over(order by r.updated_at,r.player_id)::int rk,
                   coalesce((select sum(amount) from public.payments x where x.player_id=p.id and x.kind='spare' and x.session_number=p_session),0)>=public.season_setting('spare_session',20) pd
            from public.rsvps r join public.players p on p.id=r.player_id
            where r.session_number=p_session and r.response='coming' and p.approved and not p.waitlisted and p.archived_at is null and p.membership_type='spare')
 select c.player_id,c.rk,c.rk<=s.n,c.pd,c.rk<=s.n and c.pd,greatest(s.n-(select count(*)::int from claims),0)
 from claims c cross join seats s
$$;
revoke all on function public.spare_seat_status(int) from public,anon;
grant execute on function public.spare_seat_status(int) to authenticated,service_role;

create or replace function public.reminder_targets(p_session int) returns table(player_id bigint,name text,email text,membership_type text,kind text,open_seats int) language sql stable security definer set search_path='' as $$
 with claimed as (
  select count(*)::int n from public.rsvps r join public.players p on p.id=r.player_id
  where r.session_number=p_session and r.response='coming' and p.approved and not p.waitlisted and p.archived_at is null and p.membership_type='spare'
 ), seats as (select greatest(public.spare_seat_count(p_session)-c.n,0) open from claimed c)
 select p.id,p.name,lower(p.email),coalesce(p.membership_type,'regular'),
        case when coalesce(p.membership_type,'regular')='spare' then 'spare' else 'vote' end,seats.open
 from public.players p cross join seats
 where p.approved and not p.waitlisted and p.archived_at is null and p.email_reminders and p.email is not null and position('@' in p.email)>1
   and not exists(select 1 from public.rsvps r where r.session_number=p_session and r.player_id=p.id)
   and (coalesce(p.membership_type,'regular')<>'spare' or seats.open>0)
 order by p.id
$$;
revoke all on function public.reminder_targets(int) from public,anon,authenticated;
grant execute on function public.reminder_targets(int) to service_role;

commit;
