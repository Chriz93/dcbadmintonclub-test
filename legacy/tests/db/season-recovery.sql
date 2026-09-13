\set ON_ERROR_STOP on
-- End-to-end transactions and injected failures: only the disposable local test database.
begin;
create function dbt.fail_audit() returns trigger language plpgsql as $$begin if new.action=current_setting('dbt.fail_action',true) then raise exception 'Injected failure after all writes';end if;return new;end$$;
create trigger dbt_fail_audit before insert on public.audit_log for each row execute function dbt.fail_audit();
set local role authenticated;
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2","email":"db.organizer@example.invalid"}',true);
do $$
declare p1 bigint=(select id from dbt.ids where name='P1');p2 bigint=(select id from dbt.ids where name='P2');spare bigint=(select id from dbt.ids where name='S1');
 st jsonb;a jsonb;scores jsonb;final jsonb;v int;cy int;g int;result jsonb;before text;snap text;extra bigint;bad text;config jsonb;cnt int;paid bigint;
begin
 perform public.delete_state('current_session');perform public.delete_state('completed_sessions');
 a=jsonb_build_object('1',jsonb_build_array(p1,p2));
 st=jsonb_build_object('id','review-full','number',1,'cycle',1,'assignments',a,'scores','{}'::jsonb,'movements','[]'::jsonb,'attendance','{}'::jsonb,'completed',false);
 v=public.set_state('current_session',st::text,0);
 for cy in 1..2 loop
  for g in 1..2 loop
   scores=jsonb_build_object('c1_y'||cy||'_g'||g,jsonb_build_object('a1',p1,'a2',null,'b1',p2,'b2',null,'sA',21,'sB',10,'w','A'));
   v=public.save_court_scores(1,cy,scores,v,'review-full',a->'1');
  end loop;
  select value::jsonb into st from public.app_state where key='current_session';
  if cy=1 then st=st||jsonb_build_object('cycle',2,'movements',jsonb_build_array(jsonb_build_object('cycle',1)));v=public.set_state('current_session',st::text,v);end if;
 end loop;
 final=st||jsonb_build_object('finalAssignments',a);
 before=(select jsonb_build_object('state',value,'players',(select jsonb_agg(to_jsonb(p)) from public.players p))::text from public.app_state where key='current_session');
 perform set_config('dbt.fail_action','session.finished',true);
 begin perform public.finalize_session('review-full',v,final);raise exception 'FAIL finalization ignored injected failure';exception when others then if sqlerrm not like 'Injected%' then raise;end if;end;
 if before<>(select jsonb_build_object('state',value,'players',(select jsonb_agg(to_jsonb(p)) from public.players p))::text from public.app_state where key='current_session') then raise exception 'FAIL finalization was not atomic';end if;
 perform set_config('dbt.fail_action','',true);
 result=public.finalize_session('review-full',v,final);
 if exists(select 1 from public.app_state where key='current_session') or (select games_played from public.players where id=p1)<>4 then raise exception 'FAIL finished session or stats missing';end if;
 raise notice 'PASS review: full two-round finalization updates history and stats atomically; injected failure rolls every change back';
 -- A lost player identity can be recreated without inventing IDs or breaking references.
 insert into public.players(name,email,membership_type,approved,current_court) values('Snapshot identity','identity@example.invalid','spare',false,0) returning id into extra;
 snap=public.save_league_snapshot('Missing identity recovery');
 delete from public.players where id=extra;
 perform public.restore_league_snapshot(snap);
 if not exists(select 1 from public.players where id=extra and name='Snapshot identity') then raise exception 'FAIL missing ID not restored';end if;
 raise notice 'PASS review: restore recreates a missing identity with its original generated ID';
 before=(select value from public.app_state where key='completed_sessions');
 perform set_config('dbt.fail_action','snapshot.created',true);
 begin perform public.restore_league_snapshot(snap);raise exception 'FAIL restore proceeded without its backup';exception when others then if sqlerrm not like 'Injected%' then raise;end if;end;
 if (select value from public.app_state where key='completed_sessions')<>before then raise exception 'FAIL backup failure changed the league';end if;
 perform set_config('dbt.fail_action','',true);
 perform set_config('dbt.fail_action','snapshot.restored',true);
 update public.players set name='Keep after failed restore' where id=extra;
 begin perform public.restore_league_snapshot(snap);raise exception 'FAIL restore ignored its final failure';exception when others then if sqlerrm not like 'Injected%' then raise;end if;end;
 if not exists(select 1 from public.players where id=extra and name='Keep after failed restore') then raise exception 'FAIL failed restore changed player';end if;
 perform set_config('dbt.fail_action','',true);
 raise notice 'PASS review: backup failure aborts restore; failure after restoring all tables also rolls everything back';
 -- Cancellation is recorded, skipped, and fulfills the existing policy without fake cash receipts.
 paid=public.record_payment(spare,'spare',12,2,current_date,'partial spare fee',gen_random_uuid());
 result=public.cancel_league_session(2,0,'School closure','shuttles',0);
 if not (select cancelled from public.season_dates where session_number=2) or result->>'status'<>'cancelled' then raise exception 'FAIL cancellation date/history missing';end if;
 if not exists(select 1 from jsonb_array_elements(result->'compensation') c where (c->>'player_id')::bigint=p1 and c->>'unit'='shuttles' and (c->>'amount')::int=2) then raise exception 'FAIL regular compensation differs from school closure policy';end if;
 perform public.settle_cancellation(2,spare);perform public.settle_cancellation(2,spare);
 if (select count(*) from public.payments where player_id=spare and kind='refund' and session_number=2)<>1 or (select sum(amount) from public.payments where player_id=spare and kind='refund' and session_number=2)<>12 then raise exception 'FAIL cancellation refund duplicated or wrong amount';end if;
 raise notice 'PASS review: cancellations retain schedule history, regular shuttle obligation and idempotent partial spare refund';
 -- Changing season is a single transaction with a required new calendar and fee schedule.
 select value::jsonb into config from public.app_state where key='season_config';
 config=config||jsonb_build_object('season','2027-28-review','registration_start','2027-09-01','approved_dates',jsonb_build_array('2027-11-09','2027-11-16'),'cancelled_dates','[]'::jsonb,'regular_capacity',24);
 config=jsonb_set(config,'{fees,spare_session}','25');
 before=(select value from public.app_state where key='season_config');
 begin perform public.start_new_season('review-bad',jsonb_set(config,'{approved_dates}','["2027-11-09","2027-11-09"]'));raise exception 'FAIL duplicate season dates allowed';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 if (select value from public.app_state where key='season_config')<>before then raise exception 'FAIL invalid rollover changed season';end if;
 result=public.start_new_season('review-old-season',config);
 if result->>'season'<>'2027-28-review' or (select count(*) from public.season_dates)<>2 or (select start_at from public.season_dates where session_number=1)<>'2027-11-10 01:00:00+00'::timestamptz then raise exception 'FAIL new calendar/zone not saved';end if;
 if exists(select 1 from public.payments) or exists(select 1 from public.players where players.approved or players.paid or registered_at is not null) then raise exception 'FAIL rollover retained old registrations or ledger';end if;
 if not exists(select 1 from public.payments_archive where id=paid) then raise exception 'FAIL rollover lost archived payment';end if;
 raise notice 'PASS review: rollover validates dates and atomically updates calendar, fees, registration boundary and archives';
end$$;
rollback;
