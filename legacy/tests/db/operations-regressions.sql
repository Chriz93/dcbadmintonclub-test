\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2","email":"db.organizer@example.invalid"}',true);
do $$
declare p bigint=(select id from dbt.ids where name='P1');v int;cfg jsonb;fn record;n int;w public.waiver_versions;ret bigint;
begin
 perform public.delete_state('current_session');
 perform public.checkpoint('Archive player');perform public.archive_player(p);
 if not (select archived_at is not null from public.players where id=p) then raise exception 'FAIL archive';end if;
 perform public.undo_last();
 if not (select archived_at is null and approved from public.players where id=p) then raise exception 'FAIL archive undo';end if;
 raise notice 'PASS review: archiving and undo preserve identity, waiver evidence and active visibility';
 select value::jsonb into cfg from public.app_state where key='season_config';
 cfg=cfg||jsonb_build_object('season','2031-check','registration_start','2031-01-01','approved_dates','["2031-09-09"]'::jsonb);
 begin perform public.start_new_season('null-end',cfg-'end_time_local');raise exception 'FAIL missing end time';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform public.start_new_season('overlap',cfg||jsonb_build_object('cancelled_dates',cfg->'approved_dates'));raise exception 'FAIL contradictory calendar';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform public.start_new_season('bad-money',jsonb_set(cfg,'{fees,spare_session}','20.001'));raise exception 'FAIL fractional cents';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform public.cancel_league_session(1,0,'Test reason',null,0);raise exception 'FAIL null cancellation plan';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform public.cancel_league_session(1,0,'Test reason','refund',null);raise exception 'FAIL null refund';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform public.add_league_player('Null membership',0,null);raise exception 'FAIL null membership';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 raise notice 'PASS review: incomplete operation parameters are rejected before writes';
 -- Exhaust the last regular place, then prove the second promotion rolls back both representations.
 update public.players set approved=false where membership_type='regular' and id<>p;
 for n in 1..25 loop perform public.add_league_player('Capacity fixture '||n,0,'regular');end loop;
 select id into p from public.players where not approved and membership_type='regular' limit 1;
 select coalesce(version,0) into v from public.app_state where key='player_approvals';
 begin perform public.set_state('player_approvals',jsonb_build_object(p::text,jsonb_build_object('approved',true,'waitlisted',false))::text,coalesce(v,0));raise exception 'FAIL capacity overflow';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 if (select approved from public.players where id=p) then raise exception 'FAIL failed capacity change leaked';end if;
 raise notice 'PASS review: last-place capacity is enforced by the shared server transaction';
 -- A legacy roster may already exceed the new cap. Safe waitlisting must still work, without increasing that excess.
 insert into public.players(name,email,sig,waiver_signed,paid,current_court,highest_court,membership_type,approved,waitlisted) values('Legacy excess regular','','admin',false,false,0,0,'regular',true,false);
 select coalesce(version,0) into v from public.app_state where key='player_approvals';
 v=public.set_state('player_approvals',jsonb_build_object(p::text,jsonb_build_object('approved',true,'waitlisted',true))::text,coalesce(v,0));
 if not (select approved and waitlisted from public.players where id=p) then raise exception 'FAIL legacy excess prevents waitlisting';end if;
 begin perform public.set_state('player_approvals',jsonb_build_object(p::text,jsonb_build_object('approved',true,'waitlisted',false))::text,v);raise exception 'FAIL worsened legacy excess';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 raise notice 'PASS review: legacy excess capacity permits safe waitlisting but cannot grow';
 -- Each organizer-only entry point must remain unavailable to anonymous callers and reject aal1.
 for fn in select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname in ('start_league_session','finalize_session','cancel_league_session','settle_cancellation','start_new_season','save_league_snapshot','restore_league_snapshot','archive_player','add_league_player') loop
  if has_function_privilege('anon',fn.oid,'EXECUTE') then raise exception 'FAIL anonymous execute: %',fn.proname;end if;
 end loop;
 perform set_config('request.jwt.claims','{"aal":"aal1","email":"db.organizer@example.invalid"}',true);
 begin perform public.save_league_snapshot('unauthorized');raise exception 'FAIL no MFA snapshot';exception when insufficient_privilege then null;end;
 begin perform public.start_league_session('{}');raise exception 'FAIL no MFA start';exception when insufficient_privilege then null;end;
 begin perform public.cancel_league_session(1,0,'unauthorized','shuttles',0);raise exception 'FAIL no MFA cancel';exception when insufficient_privilege then null;end;
 begin perform public.archive_player(p);raise exception 'FAIL no MFA archive';exception when insufficient_privilege then null;end;
 raise notice 'PASS review: anonymous grants and organizer MFA enforced on new operation APIs';
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2","email":"db.organizer@example.invalid"}',true);
do $$
declare p bigint=(select id from dbt.ids where name='P1');w public.waiver_versions;ret bigint;n int;
begin
 perform public.delete_state('current_session');perform public.archive_player(p);
 delete from public.invitations where email='db.p1@example.invalid';
 select * into w from public.waiver_versions where is_current;
 perform set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000002',true);
 perform set_config('request.jwt.claims','{"aal":"aal1","email":"db.p1@example.invalid"}',true);
 -- L25 (open registration, the organizer's decision of 14 September): an archived member no longer needs an
 -- invitation to come back. What must still hold: they return on their ORIGINAL identity, they come back PENDING
 -- (never silently approved), and they sign the current waiver again.
 select count(*) into n from public.waiver_acceptances where player_id=p;
 ret=public.register_me('Dee Bee One','613-555-0100','Kin','','Dee Bee One','regular','will_pay',w.version,w.sha256,'Dee Bee One','America/Toronto',-240,'adult','',false,'regression');
 if ret<>p or not exists(select 1 from public.players where id=p and archived_at is null and not approved) then raise exception 'FAIL returning identity or approval';end if;
 if (select count(*) from public.waiver_acceptances where player_id=p)<>n+1 then raise exception 'FAIL returning waiver evidence';end if;
 raise notice 'PASS review: an archived member returns uninvited on the original identity, pending approval, signing a new acceptance (L25)';
end $$;
rollback;

-- L28: Undo restores the keys the organizer's own decisions live in, and season rollover clears them.
-- p92's admin_court_moves (the courts the organizer moved by hand, added back so a courtesy move is not a court drop)
-- and p99's player_seed_points (a drop-in's starting rating) were snapshotted by neither, so pressing Undo on a seat
-- change put the court back and left the adjustment behind, and a new season began with last season's adjustments.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2","email":"db.organizer@example.invalid"}',true);
do $$
declare v int;cfg jsonb;
begin
 perform public.delete_state('current_session');
 -- The state before the organizer's decision: one hand-made move on record, no starting points set.
 perform public.set_state('admin_court_moves','{"7":1}',coalesce((select version from public.app_state where key='admin_court_moves'),0));
 perform public.checkpoint('Change court');
 select version into v from public.app_state where key='admin_court_moves';
 perform public.set_state('admin_court_moves','{"7":3}',v);
 perform public.set_state('player_seed_points','{"7":1700}',coalesce((select version from public.app_state where key='player_seed_points'),0));
 perform public.undo_last();
 if (select value::jsonb from public.app_state where key='admin_court_moves')<>'{"7":1}'::jsonb then
  raise exception 'FAIL undo did not restore admin_court_moves: %',(select value from public.app_state where key='admin_court_moves');end if;
 if exists(select 1 from public.app_state where key='player_seed_points') then
  raise exception 'FAIL undo left a starting point the checkpoint never saw';end if;
 raise notice 'PASS review: Undo restores the organizer''s court adjustments and clears starting points it never saw (L28)';
 -- Season rollover archives both and leaves neither behind.
 perform public.set_state('admin_court_moves','{"7":1}',coalesce((select version from public.app_state where key='admin_court_moves'),0));
 perform public.set_state('player_seed_points','{"7":1700}',coalesce((select version from public.app_state where key='player_seed_points'),0));
 select value::jsonb into cfg from public.app_state where key='season_config';
 cfg=cfg||jsonb_build_object('season','2032-keys','registration_start','2032-01-01','approved_dates','["2032-09-07"]'::jsonb,'cancelled_dates','[]'::jsonb);
 perform public.start_new_season('keys-rollover',cfg);
 if exists(select 1 from public.app_state where key in ('admin_court_moves','player_seed_points')) then
  raise exception 'FAIL rollover left the organizer''s adjustments behind';end if;
 if not ((select value::jsonb->'state' from public.app_state where key='archive_keys-rollover') ? 'admin_court_moves'
     and (select value::jsonb->'state' from public.app_state where key='archive_keys-rollover') ? 'player_seed_points') then
  raise exception 'FAIL rollover did not archive the organizer''s adjustments';end if;
 raise notice 'PASS review: season rollover archives and clears the organizer''s court adjustments and starting points (L28)';
end $$;
rollback;

-- L29: the organizer can add a regular place to the season, so "approve from the waitlist even if the cap is reached"
-- actually goes through. Before this, set_state refused the approval ("Regular places are full") and add_league_player
-- refused a new regular, so the app could ask the question and then only fail.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2","email":"db.organizer@example.invalid"}',true);
do $$
-- season_setting is internal (revoked from authenticated), so the number is read from app_state, the way the app does.
declare cap int;have int;extra bigint;v int;
begin
 perform public.delete_state('current_session');
 -- Fill the season exactly: capacity equals the regulars approved.
 update public.players set approved=false,waitlisted=false where membership_type='regular';
 perform public.set_regular_capacity(2);
 update public.players set approved=true,waitlisted=false where id in (select id from public.players where membership_type='regular' order by id limit 2);
 select count(*) into have from public.players where archived_at is null and approved and not waitlisted and membership_type='regular';
 if have<>2 then raise exception 'FAIL fixture: % regulars',have;end if;
 -- A third regular is refused while the places are full, by both doors.
 begin perform public.add_league_player('Over The Cap',0,'regular');raise exception 'FAIL add over the cap';
 exception when others then if sqlerrm like 'FAIL%' then raise;elsif sqlerrm not like '%Regular places are full%' then raise exception 'wanted a full-places refusal, got: %',sqlerrm;end if;end;
 select id into extra from public.players where membership_type='regular' and not approved order by id limit 1;
 update public.players set waitlisted=true,approved=true where id=extra;
 select coalesce(version,0) into v from public.app_state where key='player_approvals';
 begin perform public.set_state('player_approvals',jsonb_build_object(extra::text,jsonb_build_object('approved',true,'waitlisted',false))::text,v);raise exception 'FAIL promote over the cap';
 exception when others then if sqlerrm like 'FAIL%' then raise;elsif sqlerrm not like '%Regular places are full%' then raise exception 'wanted a full-places refusal, got: %',sqlerrm;end if;end;
 raise notice 'PASS review: a full season refuses a new regular and a promotion, by both doors';
 -- The organizer adds a place; the same promotion then goes through, and the change is on the record.
 cap=public.set_regular_capacity(3);
 if cap<>3 then raise exception 'FAIL capacity not set: %',cap;end if;
 if (select (value::jsonb->>'regular_capacity')::int from public.app_state where key='season_config')<>3 then raise exception 'FAIL setting not stored';end if;
 if not exists(select 1 from public.audit_log where action='season.capacity' and detail->>'was'='2' and detail->>'now'='3') then
  raise exception 'FAIL capacity change not recorded';end if;
 select coalesce(version,0) into v from public.app_state where key='player_approvals';
 perform public.set_state('player_approvals',jsonb_build_object(extra::text,jsonb_build_object('approved',true,'waitlisted',false))::text,v);
 if (select count(*) from public.players where archived_at is null and approved and not waitlisted and membership_type='regular')<>3 then
  raise exception 'FAIL the promotion did not go through';end if;
 raise notice 'PASS review: the organizer adds a regular place and the promotion goes through, on the record (L29)';
 -- What it will not do: go below the roster, or outside 2..30.
 begin perform public.set_regular_capacity(2);raise exception 'FAIL below the roster';
 exception when others then if sqlerrm like 'FAIL%' then raise;elsif sqlerrm not like '%already 3 regular members%' then raise exception 'wanted a roster refusal, got: %',sqlerrm;end if;end;
 begin perform public.set_regular_capacity(31);raise exception 'FAIL out of range high';
 exception when others then if sqlerrm like 'FAIL%' then raise;elsif sqlerrm not like '%from 2 to 30%' then raise exception 'wanted a range refusal, got: %',sqlerrm;end if;end;
 begin perform public.set_regular_capacity(null);raise exception 'FAIL null capacity';
 exception when others then if sqlerrm like 'FAIL%' then raise;elsif sqlerrm not like '%from 2 to 30%' then raise exception 'wanted a range refusal, got: %',sqlerrm;end if;end;
 if (select (value::jsonb->>'regular_capacity')::int from public.app_state where key='season_config')<>3 then raise exception 'FAIL a refused change was written';end if;
 raise notice 'PASS review: the number stays within 2 to 30 and never below the regulars already approved (L29)';
end $$;
rollback;

-- L29: only the organizer, at full verification, can move the number.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"aal":"aal1","email":"db.p1@example.invalid"}',true);
do $$
begin
 begin perform public.set_regular_capacity(30);raise exception 'FAIL a player changed the season';
 exception when others then if sqlerrm like 'FAIL%' then raise;elsif sqlerrm not ilike '%Organizer verification required%' then raise exception 'wanted an organizer refusal, got: %',sqlerrm;end if;end;
 raise notice 'PASS review: a player cannot change the season''s regular places (L29)';
end $$;
rollback;

-- L30: the database counts spare seats by the same rule as the app — 24 minus the regulars who said "coming" (or whom
-- the organizer marked present), not one seat per decline. Measured on the 4 October production backup, the two rules
-- gave 4 and 2 for the same night, and the number drives both the "your seat is reserved" message and the spare's fee.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2","email":"db.organizer@example.invalid"}',true);
do $$
declare sp1 bigint;sp2 bigint;ids bigint[];open1 int;n int;k int;
begin
 perform public.delete_state('current_session');
 perform public.delete_state('pre_session_attendance');
 -- A clean roster: 25 regulars with a ladder court, and two spares available in answer order.
 update public.players set approved=false,waitlisted=false where true;
 select array_agg(id order by id) into ids from (select id from public.players where membership_type='regular' order by id limit 25) q;
 if array_length(ids,1)<25 then
  for k in 1..(25-coalesce(array_length(ids,1),0)) loop perform public.add_league_player('Seat fixture '||k,0,'regular');end loop;
  select array_agg(id order by id) into ids from (select id from public.players where membership_type='regular' order by id limit 25) q;
 end if;
 perform public.set_regular_capacity(25);
 update public.players set approved=true,waitlisted=false,current_court=1+(i%6) from (select id,row_number() over(order by id) i from public.players where id=any(ids)) q where public.players.id=q.id;
 select id into sp1 from public.players where membership_type='spare' order by id limit 1;
 select id into sp2 from public.players where membership_type='spare' and id<>sp1 order by id limit 1;
 if sp1 is null or sp2 is null then
  perform public.add_league_player('Spare fixture A',0,'spare');perform public.add_league_player('Spare fixture B',0,'spare');
  select id into sp1 from public.players where name='Spare fixture A';select id into sp2 from public.players where name='Spare fixture B';
 end if;
 update public.players set approved=true,waitlisted=false where id in (sp1,sp2);
 -- 20 of the 25 say yes, 2 say no, 3 never answer. The seats are 24 - 20 = 4, not one per decline (2).
 for k in 1..20 loop perform public.set_rsvp(27,ids[k],'coming');end loop;
 perform public.set_rsvp(27,ids[21],'notcoming');
 perform public.set_rsvp(27,ids[22],'notcoming');
 perform public.set_rsvp(27,sp1,'coming');
 perform public.set_rsvp(27,sp2,'coming');
 -- The one number both functions read (L30), checked on its own first.
 if public.spare_seat_count(27)<>4 then raise exception 'FAIL spare_seat_count: 24-20 is 4; got %',public.spare_seat_count(27);end if;
 select open_seats into open1 from public.spare_seat_status(27) limit 1;
 if open1<>2 then raise exception 'FAIL seats: 24-20 leaves 4, two claimed, so 2 open; got %',open1;end if;
 select count(*) into n from public.spare_seat_status(27) where reserved;
 if n<>2 then raise exception 'FAIL both spares hold a seat when four are open; got % reserved',n;end if;
 raise notice 'PASS review: spare seats are 24 minus the regulars who said yes, not one per decline (L30)';
 -- Silence is not a yes here either: one more "coming" takes a seat away.
 perform public.set_rsvp(27,ids[23],'coming');
 select open_seats into open1 from public.spare_seat_status(27) limit 1;
 if open1<>1 then raise exception 'FAIL one more yes leaves 1 open; got %',open1;end if;
 -- The organizer's Present mark counts as coming; an absent mark does not.
 perform public.set_state('pre_session_attendance',jsonb_build_object(ids[24]::text,'present',ids[1]::text,'absent')::text,coalesce((select version from public.app_state where key='pre_session_attendance'),0));
 select open_seats into open1 from public.spare_seat_status(27) limit 1;
 if open1<>1 then raise exception 'FAIL present adds one and absent removes one, so 1 open; got %',open1;end if;
 raise notice 'PASS review: the organizer''s present and absent marks count the same way the app counts them (L30)';
 -- Every regular coming: no seats, and no spare is reserved.
 for k in 21..25 loop perform public.set_rsvp(27,ids[k],'coming');end loop;
 perform public.delete_state('pre_session_attendance');
 select open_seats into open1 from public.spare_seat_status(27) limit 1;
 select count(*) into n from public.spare_seat_status(27) where reserved;
 if open1<>0 or n<>0 then raise exception 'FAIL a full night leaves no spare seat; got % open, % reserved',open1,n;end if;
 raise notice 'PASS review: 25 regulars coming leaves no spare seat at all (L30)';
end $$;
rollback;
