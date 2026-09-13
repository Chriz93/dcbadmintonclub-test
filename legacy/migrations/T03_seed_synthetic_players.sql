-- T03 (September 12, 2026): TEST PROJECT ONLY (wgolevihkvmosajumzvl). Adds synthetic players so the organizer can try
-- the release on the TEST site (Start Session, Attendance, Adjust courts, late arrivals, scores, spares).
--   * 22 regulars, placed four to a court on Courts 1–4 and three on Courts 5–6 (their earned courts);
--   * 3 approved spares;
--   * Session 1 votes: 20 regulars coming, 2 declining (so spare seats open), and 2 spares asking for a seat.
-- Every address is seed-player-NN@example.invalid, so no email can reach anyone, and only these rows are ever counted as
-- this script's (other synthetic players, such as L02's test-player-NN, are left alone). No waiver acceptance is created for them: records
-- are never invented. Running it again adds nothing. It refuses any database not marked as the TEST environment.
select public.assert_test_environment();
begin;
do $$
declare first_names text[] := array['Avery','Blake','Casey','Devon','Emery','Finley','Gray','Harper','Indigo','Jordan','Kai','Logan',
                                    'Morgan','Noel','Oakley','Parker','Quinn','Reese','Sage','Taylor','Uma','Vale','Wren','Xen','Yael'];
        n int; court int; pid bigint;
begin
  if exists(select 1 from public.players where email like 'seed-player-%@example.invalid') then
    raise notice 'Synthetic players are already there; nothing added'; return;
  end if;
  for n in 1..25 loop
    court := case when n <= 22 then least(6, case when n <= 16 then (n + 3) / 4 else 5 + (n - 17) / 3 end) else 0 end;
    insert into public.players(name,email,phone,emergency,medical,sig,waiver_signed,paid,current_court,highest_court,membership_type,
                               approved,waitlisted,registered_at,declared_payment)
    values(first_names[n] || ' Test', 'seed-player-' || lpad(n::text, 2, '0') || '@example.invalid', '613-555-' || lpad((1000 + n)::text, 4, '0'),
           'Synthetic contact 613-555-0100', '', first_names[n] || ' Test', true, n <= 22 and n % 3 = 0, court, court,
           case when n <= 22 then 'regular' else 'spare' end, true, false, now() - make_interval(mins => 30 - n),
           case when n > 22 then 'per_session' when n % 3 = 0 then 'paid_full' else 'will_pay' end)
    returning id into pid;
    if n <= 22 then
      insert into public.rsvps(session_number,player_id,response,note) values(1, pid, case when n in (7, 15) then 'notcoming' else 'coming' end, '');
    elsif n <= 24 then
      insert into public.rsvps(session_number,player_id,response,note) values(1, pid, 'coming', '');
    end if;
  end loop;
end $$;
commit;
select count(*) filter (where membership_type = 'regular') as synthetic_regulars,
       count(*) filter (where membership_type = 'spare') as synthetic_spares,
       string_agg(distinct current_court::text || ':' || (select count(*) from public.players q where q.current_court = p.current_court and q.email like 'seed-player-%@example.invalid')::text, ' ' order by current_court::text || ':' || (select count(*) from public.players q where q.current_court = p.current_court and q.email like 'seed-player-%@example.invalid')::text) as players_per_court,
       (select count(*) from public.rsvps r join public.players x on x.id = r.player_id where x.email like 'seed-player-%@example.invalid' and r.session_number = 1) as session1_votes
from public.players p where email like 'seed-player-%@example.invalid';
