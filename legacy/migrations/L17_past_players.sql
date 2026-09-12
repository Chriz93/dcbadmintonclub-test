-- L17: past players (September 11, 2026). Players from earlier seasons, kept with all their details for the organizer
-- only (Admin → 📇 Past Players). Nobody else can read them; nothing writes to them except R02 (the one-time move).
-- Safe to run again.
begin;
create table if not exists public.past_players(
  id bigint primary key,                 -- the player's id when they were moved here
  season_label text not null,            -- the roster they came from
  name text not null, email text, phone text, emergency text, medical text, sig text, waiver_signed boolean,
  membership_type text, current_court int, highest_court int, season_wins int, season_losses int, games_played int,
  no_show_count int, paid boolean, declared_payment text, admin_note text, registered_at timestamptz,
  joined_at timestamptz, archived_at timestamptz not null default now());
alter table public.past_players enable row level security;
revoke all on public.past_players from public,anon,authenticated,service_role;
drop policy if exists "organizer reads past players" on public.past_players;
create policy "organizer reads past players" on public.past_players for select to authenticated using(public.is_admin());
grant select on public.past_players to authenticated,service_role;   -- the organizer through the rule above; the daily backup
commit;
