-- L32 (19 October 2026): a spare does not answer for themselves. The organizer gives the seat.
--
-- The organizer: "Spares should not be able to vote, Spares are only voted by admin manually."
--
-- WHAT IT WAS. A spare claimed a seat by answering 'coming', and spare_seat_status ranked those answers by arrival
-- time: the first spare to reply took the open seat, confirmed once paid. Who played was decided by a race, not by
-- the organizer, who could not take the standard of the short court or who had not played in weeks into account.
--
-- WHAT CHANGES. Only who may write the row. callInSpare() already answers 'coming' for a spare as the organizer
-- (p61, p71), and that is now the only way one is written. Everything downstream is untouched: spare_seat_status,
-- the reservation, the payment check, spare_reservation_targets' "seat reserved"/"seat confirmed" emails and the
-- line-up all read the same rsvps row they always read. They never cared who wrote it.
--
-- WHAT IS NOT TOUCHED. No row is deleted. A spare who already answered for a session keeps that answer and the seat
-- it earned them -- the organizer asked for exactly that ("whoever voted for the upcoming session remains"). The
-- upcoming session's voting closed on 18 October in any case, so nothing is in flight.
--
-- THREE DOORS, NOT ONE. The buttons are gone from the page (p110), but the page is not the rule:
--   set_rsvp          refuses a spare answering for themselves. The organizer still answers for anyone.
--   issue_vote_link   refuses to mint a token for a spare, so the emailed one-tap path cannot become a way back in.
--   reminder_targets  stops offering open seats to spares, so nobody is invited to claim what they cannot claim.
--
-- REQUIRES L31 (set_rsvp and issue_vote_link are defined there).
begin;

do $$ begin
 if not exists(select 1 from public.environment) then raise exception 'Refusing: this database is not marked'; end if;
 if to_regprocedure('public.issue_vote_link(bigint,int)') is null then
  raise exception 'Refusing: L31 has not been applied to this database'; end if;
end $$;

-- ── the answer ───────────────────────────────────────────────────────────────────────────────────────────────────
-- rsvp_write is untouched: the rules a vote must pass are the same ones. What moves is the gate in front of it.
create or replace function public.set_rsvp(p_session int,p_player bigint,p_response text,p_note text default '')
returns void language plpgsql security definer set search_path='' as $$
declare me bigint;
begin
 me=public.my_player_id();
 if not public.is_admin() then
  if me is null or p_player is distinct from me then
   raise exception 'You can only answer for yourself' using errcode='42501'; end if;
  -- L32: a spare seat is given out by the organizer, so a spare has nothing to answer.
  if exists(select 1 from public.players where id=p_player and membership_type='spare') then
   raise exception 'Spare seats are given out by the organizer' using errcode='42501'; end if;
 end if;
 perform public.rsvp_write(p_session,p_player,p_response,coalesce(p_note,''), not public.is_admin());
end $$;

-- ── the emailed one-tap link ─────────────────────────────────────────────────────────────────────────────────────
-- A spare is never a reminder_targets 'vote' row, so remind.mjs never asks for one of these today. Refusing here
-- means that stays true even if the worker changes: the capability cannot be created at all.
create or replace function public.issue_vote_link(p_player bigint, p_session int)
returns text language plpgsql security definer set search_path='' as $$
declare tok text; dies timestamptz;
begin
 if not exists(select 1 from public.players where id=p_player) then raise exception 'No such player'; end if;
 if exists(select 1 from public.players where id=p_player and membership_type='spare') then
  raise exception 'Spare seats are given out by the organizer'; end if;
 select d.start_at - public.season_setting('vote_deadline_hours',46)*interval '1 hour' into dies
 from public.season_dates d where d.session_number=p_session and not d.cancelled;
 if dies is null then raise exception 'Invalid or cancelled session'; end if;
 select v.token into tok from public.vote_links v
  where v.player_id=p_player and v.session_number=p_session and v.expires_at>now();
 if tok is not null then return tok; end if;
 tok := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
 insert into public.vote_links(token,player_id,session_number,expires_at)
 values(tok,p_player,p_session,dies)
 on conflict(player_id,session_number) do update
   set token=excluded.token, expires_at=excluded.expires_at, created_at=now(), use_count=0,
       last_used_at=null, last_response=null;
 return tok;
end $$;

-- ── the invitation ───────────────────────────────────────────────────────────────────────────────────────────────
-- The "a regular can't make it -- open to review availability" email told spares to go and claim a seat. There is
-- nothing for them to claim now, so it is not sent. The organizer contacts the spare they want, and Call In then
-- triggers the "seat reserved" / "seat confirmed" mail through spare_reservation_targets, which is unchanged.
-- open_seats is still reported on every row: the worker's spare window reads it, and it is what it always was.
create or replace function public.reminder_targets(p_session int) returns table(player_id bigint,name text,email text,membership_type text,kind text,open_seats int) language sql stable security definer set search_path='' as $$
 with claimed as (
  select count(*)::int n from public.rsvps r join public.players p on p.id=r.player_id
  where r.session_number=p_session and r.response='coming' and p.approved and not p.waitlisted and p.archived_at is null and p.membership_type='spare'
 ), seats as (select greatest(public.spare_seat_count(p_session)-c.n,0) open from claimed c)
 select p.id,p.name,lower(p.email),coalesce(p.membership_type,'regular'),'vote',seats.open
 from public.players p cross join seats
 where p.approved and not p.waitlisted and p.archived_at is null and p.email_reminders and p.email is not null and position('@' in p.email)>1
   and coalesce(p.membership_type,'regular')<>'spare'
   and not exists(select 1 from public.rsvps r where r.session_number=p_session and r.player_id=p.id)
 order by p.id
$$;
revoke all on function public.reminder_targets(int) from public,anon,authenticated;
grant execute on function public.reminder_targets(int) to service_role;

-- L26: create or replace throws a function's SET clauses away, so the bounds go back on the two that take the lock
-- through rsvp_write, and on the link mint. verify.sql refuses an unbounded lock-taker.
alter function public.set_rsvp(int,bigint,text,text)  set lock_timeout='5s';
alter function public.set_rsvp(int,bigint,text,text)  set statement_timeout='20s';
alter function public.issue_vote_link(bigint,int)     set lock_timeout='5s';
alter function public.issue_vote_link(bigint,int)     set statement_timeout='20s';

commit;
