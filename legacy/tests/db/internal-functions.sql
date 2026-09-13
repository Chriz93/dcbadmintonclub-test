-- Internal database functions added by the audit remediation (L22–L24). No site role may call the internal ones directly;
-- the two reminder helpers are open only to the roles that use them; and each helper does what the league rules say.
-- Runs as the rehearsal superuser inside a transaction that is rolled back. (capture_league_snapshot,
-- restore_snapshot_table and rollover_season_internal change data; their behaviour is exercised through the public
-- restore and new-season operations in season-recovery.sql, and here only their permissions are checked.)
\set ON_ERROR_STOP on
begin;
do $$
declare f text; r text;
  closed text[] := array['capture_league_snapshot(text)','game_pairing(jsonb,integer)','refresh_all_paid_flags()',
    'restore_snapshot_table(text,jsonb,text,text)','rollover_season_internal(text)','round_complete(jsonb)',
    'season_setting(text,numeric)','validate_lineup(jsonb)'];
begin
 foreach f in array closed loop
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(r, 'public.'||f, 'execute') then raise exception 'FAIL % can run public.%', r, f; end if;
  end loop;
 end loop;
 if has_function_privilege('anon','public.spare_reservation_targets(integer)','execute')
    or has_function_privilege('authenticated','public.spare_reservation_targets(integer)','execute')
    or not has_function_privilege('service_role','public.spare_reservation_targets(integer)','execute') then raise exception 'FAIL spare_reservation_targets permissions'; end if;
 if has_function_privilege('anon','public.spare_seat_status(integer)','execute')
    or not has_function_privilege('authenticated','public.spare_seat_status(integer)','execute')
    or not has_function_privilege('service_role','public.spare_seat_status(integer)','execute') then raise exception 'FAIL spare_seat_status permissions'; end if;
 perform public.spare_seat_status(1); perform public.spare_reservation_targets(1);
 raise notice 'PASS review: capture_league_snapshot, game_pairing, refresh_all_paid_flags, restore_snapshot_table, rollover_season_internal, round_complete, season_setting and validate_lineup are closed to every site role; spare_reservation_targets is for the reminder job only, spare_seat_status for signed-in players and the job, and both answer for a session';
end $$;

-- The scheduled pairings, written from the rules: four players partner each other once; two play singles; five play five
-- games with each player sitting out exactly once.
do $$
declare four jsonb := '[10,20,30,40]'; five jsonb := '[1,2,3,4,5]'; g int; x jsonb; seen int[]; sits int[] := '{}'; p int;
begin
 if public.game_pairing(four,1) <> '{"a1":10,"a2":20,"b1":30,"b2":40}'::jsonb then raise exception 'FAIL four players, game 1: %', public.game_pairing(four,1); end if;
 if public.game_pairing(four,2) <> '{"a1":10,"a2":30,"b1":20,"b2":40}'::jsonb then raise exception 'FAIL four players, game 2: %', public.game_pairing(four,2); end if;
 if public.game_pairing(four,3) <> '{"a1":10,"a2":40,"b1":20,"b2":30}'::jsonb then raise exception 'FAIL four players, game 3: %', public.game_pairing(four,3); end if;
 if public.game_pairing('[7,8]',3) <> '{"a1":7,"a2":null,"b1":8,"b2":null}'::jsonb then raise exception 'FAIL two players play singles'; end if;
 for g in 1..5 loop
  x := public.game_pairing(five,g);
  seen := array[(x->>'a1')::int,(x->>'a2')::int,(x->>'b1')::int,(x->>'b2')::int];
  if (select count(distinct v) from unnest(seen) v) <> 4 then raise exception 'FAIL five players, game %: a player appears twice (%)', g, x; end if;
  for p in 1..5 loop if not p = any(seen) then sits := sits || p; end if; end loop;
 end loop;
 if (select array_agg(v order by v) from unnest(sits) v) <> array[1,2,3,4,5] then raise exception 'FAIL five players: each sits out once (sat out: %)', sits; end if;
 begin perform public.game_pairing(four,4); raise exception 'FAIL game 4 on a court of four was accepted';
 exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 raise notice 'PASS review: game_pairing gives the scheduled pairings (four: 1+2 v 3+4, 1+3 v 2+4, 1+4 v 2+3; two: singles; five: each sits out once) and refuses a game that does not exist';
end $$;

-- A round is complete when every court in use has all its games: three on two to four players (two after a 2–0 on a
-- court of two), five on five. Scores from another round do not count.
do $$
declare base jsonb := '{"cycle":1,"assignments":{"1":[1,2,3,4]},"scores":{}}';
begin
 if public.round_complete(base) then raise exception 'FAIL no scores counted as a complete round'; end if;
 if not public.round_complete(jsonb_set(base,'{scores}','{"c1_y1_g1":{"w":"A"},"c1_y1_g2":{"w":"B"},"c1_y1_g3":{"w":"A"}}')) then raise exception 'FAIL three games on a court of four'; end if;
 if public.round_complete(jsonb_set(base,'{scores}','{"c1_y1_g1":{"w":"A"},"c1_y1_g2":{"w":"B"}}')) then raise exception 'FAIL two of three games counted as complete'; end if;
 if public.round_complete(jsonb_set(base,'{scores}','{"c1_y2_g1":{"w":"A"},"c1_y2_g2":{"w":"B"},"c1_y2_g3":{"w":"A"}}')) then raise exception 'FAIL round 2 scores counted for round 1'; end if;
 if not public.round_complete('{"cycle":2,"assignments":{"6":[5,6]},"scores":{"c6_y2_g1":{"w":"A"},"c6_y2_g2":{"w":"A"}}}') then raise exception 'FAIL best of three ends at 2-0'; end if;
 if public.round_complete('{"cycle":2,"assignments":{"6":[5,6]},"scores":{"c6_y2_g1":{"w":"A"},"c6_y2_g2":{"w":"B"}}}') then raise exception 'FAIL 1-1 needs a deciding game'; end if;
 if public.round_complete('{"cycle":1,"assignments":{"2":[1,2,3,4,5]},"scores":{"c2_y1_g1":{"w":"A"},"c2_y1_g2":{"w":"A"},"c2_y1_g3":{"w":"A"},"c2_y1_g4":{"w":"A"}}}') then raise exception 'FAIL five players need five games'; end if;
 if public.round_complete('{"cycle":1,"assignments":{"1":[1]},"scores":{}}') then raise exception 'FAIL a court of one'; end if;
 if public.round_complete('{"cycle":1,"assignments":{},"scores":{}}') then raise exception 'FAIL no courts in use'; end if;
 raise notice 'PASS review: round_complete requires every game of the round (three on two to four players, two after a 2-0 on a court of two, five on five) and ignores other rounds';
end $$;

-- Every court in a lineup holds zero or two to five known players, each once, on courts 1 to 6.
do $$
declare ids bigint[] := (select array_agg(id order by id) from (select id from public.players order by id limit 7) x); bad jsonb;
begin
 if coalesce(array_length(ids,1),0) < 7 then raise exception 'FAIL fixture: fewer than seven players'; end if;
 perform public.validate_lineup(jsonb_build_object('1',to_jsonb(ids[1:4]),'2',to_jsonb(ids[5:6]),'3','[]'::jsonb));
 foreach bad in array array[
   jsonb_build_object('1',to_jsonb(ids[1:1])),
   jsonb_build_object('1',to_jsonb(ids[1:6])),
   jsonb_build_object('1',to_jsonb(ids[1:2]),'2',jsonb_build_array(ids[1],ids[3])),
   jsonb_build_object('1',jsonb_build_array(ids[1],-5)),
   jsonb_build_object('7',to_jsonb(ids[1:2]))] loop
  begin perform public.validate_lineup(bad); raise exception 'FAIL invalid lineup accepted: %', bad;
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 end loop;
 raise notice 'PASS review: validate_lineup accepts courts of two to five and refuses a court of one, more than five, a player twice, an unknown player or a court that does not exist';
end $$;

-- Season settings come from the season configuration, with the given fallback when a setting is missing.
do $$
begin
 if public.season_setting('no_such_setting', 7) <> 7 then raise exception 'FAIL a missing setting does not use the fallback'; end if;
 insert into public.app_state(key,value,version,updated_at) values('season_config','{"fees":{"spare_session":25}}',1,now())
 on conflict(key) do update set value=(coalesce(nullif(public.app_state.value,'null')::jsonb,'{}'::jsonb)
   || jsonb_build_object('fees', coalesce(nullif(public.app_state.value,'null')::jsonb->'fees','{}'::jsonb) || '{"spare_session":25}'::jsonb))::text;
 if public.season_setting('spare_session', 20) <> 25 then raise exception 'FAIL the configured spare fee is not used'; end if;
 raise notice 'PASS review: season_setting reads the configured value and falls back when a setting is missing';
end $$;

-- refresh_all_paid_flags is a trigger: a change to the session, the finished sessions or the season configuration, and a
-- change of membership, recompute every paid flag from the ledger. A regular marked paid with no season payment is cleared.
do $$
declare p bigint := (select id from public.players x where x.membership_type <> 'spare' and not exists(
  select 1 from public.payments y where y.player_id = x.id and y.kind in ('season','adjustment')) order by id limit 1);
begin
 if p is null then raise exception 'FAIL fixture: no regular without a season payment'; end if;
 update public.players set paid = true where id = p;
 update public.app_state set value = value where key = 'season_config';      -- trigger refresh_session_paid
 if not found then raise exception 'FAIL fixture: no season configuration'; end if;
 if (select paid from public.players where id = p) then raise exception 'FAIL a season change left a paid flag with no payment'; end if;
 update public.players set paid = true where id = p;
 update public.players set membership_type = membership_type where id = p;  -- trigger refresh_membership_paid
 if (select paid from public.players where id = p) then raise exception 'FAIL a membership change left a paid flag with no payment'; end if;
 raise notice 'PASS review: refresh_all_paid_flags runs as a trigger: a season change and a membership change recompute every paid flag from the ledger (a flag with no payment is cleared)';
end $$;
rollback;
