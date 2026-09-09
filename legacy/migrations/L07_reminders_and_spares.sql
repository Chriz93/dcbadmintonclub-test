-- Reminders and spare seats.
-- * players.email_reminders: each player's own opt-out for reminder emails (default on).
-- * reminder_log: one row per (session, player, kind) so the scheduled job can never email twice.
-- * reminder_targets(): who still needs a nudge for a session — callable only by the service role from the job.
-- * Spare seats are derived, never stored: declined regulars open seats; spares who said "available" fill them in
--   the order they answered (rsvps.updated_at); the rest are standby. The same rule is used by the app and the job.
begin;
alter table public.players add column if not exists email_reminders boolean not null default true;
create table if not exists public.reminder_log(id bigint generated always as identity primary key,session_number int not null,player_id bigint not null references public.players(id) on delete cascade,kind text not null,sent_at timestamptz not null default now(),unique(session_number,player_id,kind));
alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from public,anon,authenticated;
create policy "admin reads reminder log" on public.reminder_log for select to authenticated using(public.is_admin());
grant select on public.reminder_log to authenticated;

create or replace function public.set_email_reminders(p_on boolean) returns void language plpgsql security definer set search_path='' as $$ declare pid bigint;begin
 pid=public.my_player_id();if pid is null then raise exception 'No player record' using errcode='42501';end if;
 update public.players set email_reminders=coalesce(p_on,true),updated_at=now() where id=pid;
end $$;
revoke all on function public.set_email_reminders(boolean) from public,anon;
grant execute on function public.set_email_reminders(boolean) to authenticated;

-- Seats opened by declined regulars minus spares already confirmed, in answer order.
create or replace function public.spare_seats(p_session int) returns table(player_id bigint,rank int,confirmed boolean,open_seats int) language sql stable security definer set search_path='' as $$
 with declined as (
  select count(*)::int n from public.rsvps r join public.players p on p.id=r.player_id
  where r.session_number=p_session and r.response='notcoming' and p.approved and not p.waitlisted and coalesce(p.membership_type,'regular')<>'spare'
 ), claims as (
  select r.player_id,row_number() over(order by r.updated_at,r.player_id)::int rk from public.rsvps r join public.players p on p.id=r.player_id
  where r.session_number=p_session and r.response='coming' and p.approved and p.membership_type='spare'
 )
 select c.player_id,c.rk,c.rk<=d.n,greatest(d.n-(select count(*)::int from claims),0) from claims c cross join declined d
$$;
revoke all on function public.spare_seats(int) from public,anon;
grant execute on function public.spare_seats(int) to authenticated;

-- Reminder targets: approved regulars without an answer ('vote'); spares without an answer while seats are open ('spare').
create or replace function public.reminder_targets(p_session int) returns table(player_id bigint,name text,email text,membership_type text,kind text,open_seats int) language sql stable security definer set search_path='' as $$
 with declined as (
  select count(*)::int n from public.rsvps r join public.players p on p.id=r.player_id
  where r.session_number=p_session and r.response='notcoming' and p.approved and not p.waitlisted and coalesce(p.membership_type,'regular')<>'spare'
 ), claimed as (
  select count(*)::int n from public.rsvps r join public.players p on p.id=r.player_id
  where r.session_number=p_session and r.response='coming' and p.approved and p.membership_type='spare'
 ), seats as (select greatest(d.n-c.n,0) open from declined d cross join claimed c)
 select p.id,p.name,lower(p.email),coalesce(p.membership_type,'regular'),
        case when coalesce(p.membership_type,'regular')='spare' then 'spare' else 'vote' end,seats.open
 from public.players p cross join seats
 where p.approved and not p.waitlisted and p.email_reminders and p.email is not null and position('@' in p.email)>1
   and not exists(select 1 from public.rsvps r where r.session_number=p_session and r.player_id=p.id)
   and (coalesce(p.membership_type,'regular')<>'spare' or seats.open>0)
 order by p.id
$$;
revoke all on function public.reminder_targets(int) from public,anon,authenticated;
grant execute on function public.reminder_targets(int) to service_role;
revoke all on public.reminder_log from service_role; grant select,insert on public.reminder_log to service_role;
commit;
