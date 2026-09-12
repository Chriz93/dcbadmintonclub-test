-- R02: the 2026-27 season starts with an empty player list (September 11, 2026). Every player on file moves to
-- past_players (organizer only, Admin → 📇 Past Players) with all their details, then the player list is emptied.
-- Their last-season record (court, wins, losses, games, paid) comes from the pre-go-live copy backup_20260911 where it
-- exists, because the fresh start (R01) had zeroed it. Run the SAME file on TEST and on production. Safe to run again.
begin;
do $$ begin
 if to_regclass('backup_20260911.players') is not null then
  execute $q$
   insert into public.past_players(id,season_label,name,email,phone,emergency,medical,sig,waiver_signed,membership_type,current_court,
     highest_court,season_wins,season_losses,games_played,no_show_count,paid,declared_payment,admin_note,registered_at,joined_at)
   select p.id,'2025-26',p.name,p.email,p.phone,p.emergency,p.medical,p.sig,p.waiver_signed,p.membership_type,
     coalesce(b.current_court,p.current_court),coalesce(b.highest_court,p.highest_court),coalesce(b.season_wins,p.season_wins),
     coalesce(b.season_losses,p.season_losses),coalesce(b.games_played,p.games_played),p.no_show_count,coalesce(b.paid,p.paid),
     p.declared_payment,p.admin_note,p.registered_at,p.created_at
   from public.players p left join backup_20260911.players b on b.id=p.id
   on conflict(id) do nothing$q$;
 else
  insert into public.past_players(id,season_label,name,email,phone,emergency,medical,sig,waiver_signed,membership_type,current_court,
    highest_court,season_wins,season_losses,games_played,no_show_count,paid,declared_payment,admin_note,registered_at,joined_at)
  select p.id,'2025-26',p.name,p.email,p.phone,p.emergency,p.medical,p.sig,p.waiver_signed,p.membership_type,p.current_court,
    p.highest_court,p.season_wins,p.season_losses,p.games_played,p.no_show_count,p.paid,p.declared_payment,p.admin_note,
    p.registered_at,p.created_at
  from public.players p
  on conflict(id) do nothing;
 end if;
end $$;
delete from public.players where id in (select id from public.past_players);
commit;
select (select count(*) from public.past_players) past_players,
       (select count(*) from public.players) players_this_season,
       (select count(*) from public.past_players where coalesce(email,'')<>'') past_players_with_email;
