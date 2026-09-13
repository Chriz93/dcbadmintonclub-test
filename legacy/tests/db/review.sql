\set ON_ERROR_STOP on
-- Requires the ordinary synthetic dbt fixtures. Every change, including snapshots, is rolled back.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2","email":"db.organizer@example.invalid"}',true);
do $$
declare p1 bigint=(select id from dbt.ids where name='P1');p2 bigint=(select id from dbt.ids where name='P2');
 spare bigint=(select id from dbt.ids where name='S1');r3 bigint=(select id from dbt.ids where name='R3');r4 bigint=(select id from dbt.ids where name='R4');
 v int; st jsonb; scores jsonb; a jsonb; snapshot text; before_name text; n int; money bigint; request uuid=gen_random_uuid(); old_time timestamptz; before_state text; final jsonb;
begin
 -- Atomic approval mirrors the real database columns, not a mocked client helper.
 update public.players set approved=false,waitlisted=true where id=p1;
 select coalesce(version,0) into v from public.app_state where key='player_approvals';
 perform public.set_state('player_approvals',jsonb_build_object(p1::text,jsonb_build_object('approved',true,'waitlisted',false))::text,coalesce(v,0));
 if not (select approved and not waitlisted from public.players where id=p1) then raise exception 'FAIL approval did not reach canonical columns';end if;
 raise notice 'PASS review: approval updates authoritative columns';
 begin
  select version into v from public.app_state where key='player_approvals';
  perform public.set_state('player_approvals',jsonb_build_object(p1::text,jsonb_build_object('membershipType','invalid'))::text,v);
  raise exception 'FAIL invalid approval committed';
 exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 if (select membership_type from public.players where id=p1)<>'regular' then raise exception 'FAIL failed approval was not atomic';end if;
 raise notice 'PASS review: rejected status change rolls back columns and state';

 perform public.delete_state('current_session');
 a=jsonb_build_object('1',jsonb_build_array(p1,p2),'2',jsonb_build_array(r3,r4));
 st=jsonb_build_object('id',101,'number',1,'cycle',1,'assignments',a,'scores','{}'::jsonb,'movements','[]'::jsonb,'completed',false);
 v=public.set_state('current_session',st::text,0);
 begin
  perform public.set_state('current_session',(st||jsonb_build_object('assignments',jsonb_build_object('1',jsonb_build_array(p1))))::text,v);
  raise exception 'FAIL singleton lineup committed';
 exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 raise notice 'PASS review: singleton lineup refused';
 scores=jsonb_build_object('c1_y1_g1',jsonb_build_object('a1',p1,'a2',null,'b1',p2,'b2',null,'sA',21,'sB',12,'w','A'));
 begin perform public.save_court_scores(1,1,scores,v,'another-session',a->'1');raise exception 'FAIL stale session accepted';
 exception when serialization_failure then null;end;
 begin perform public.save_court_scores(1,1,scores,v,'101',jsonb_build_array(p2,p1));raise exception 'FAIL stale lineup accepted';
 exception when serialization_failure then null;end;
 raise notice 'PASS review: stale session and lineup rejected';
 v=public.save_court_scores(1,1,scores,v,'101',a->'1');
 begin
  perform public.set_state('current_session',(st||jsonb_build_object('assignments',jsonb_build_object('1',jsonb_build_array(p1,r3),'2',jsonb_build_array(p2,r4))))::text,v);
  raise exception 'FAIL scored court changed';
 exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 raise notice 'PASS review: scored court lineup stays locked';
 scores=jsonb_build_object('c1_y1_g2',jsonb_build_object('a1',p1,'a2',null,'b1',p2,'b2',null,'sA',12,'sB',21,'w','B'),
 'c1_y1_g3',jsonb_build_object('a1',p1,'a2',null,'b1',p2,'b2',null,'sA',21,'sB',10,'w','A'));
 v=public.save_court_scores(1,1,scores,v,'101',a->'1');
 scores=jsonb_build_object('c1_y1_g2',jsonb_build_object('a1',p1,'a2',null,'b1',p2,'b2',null,'sA',21,'sB',10,'w','A'));
 v=public.save_court_scores(1,1,scores,v,'101',a->'1');
 if (select value::jsonb#>'{scores,c1_y1_g3}' from public.app_state where key='current_session') is not null then raise exception 'FAIL obsolete deciding game retained';end if;
 raise notice 'PASS review: best-of-three correction removes obsolete deciding game atomically';
 select value into before_state from public.app_state where key='current_session';
 begin perform public.finalize_session('101',v,st||jsonb_build_object('finalAssignments',a));raise exception 'FAIL incomplete session finalized';
 exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 if (select value from public.app_state where key='current_session')<>before_state then raise exception 'FAIL failed finalization changed current session';end if;
 raise notice 'PASS review: incomplete finalization leaves the session unchanged';

 -- A four-player court cannot repeat one doubles pairing for every game.
 perform public.delete_state('current_session');a=jsonb_build_object('1',jsonb_build_array(p1,p2,r3,r4));
 st=jsonb_build_object('id',102,'number',1,'cycle',1,'assignments',a,'scores','{}'::jsonb,'movements','[]'::jsonb,'completed',false);
 v=public.set_state('current_session',st::text,0);
 scores=jsonb_build_object('c1_y1_g2',jsonb_build_object('a1',p1,'a2',p2,'b1',r3,'b2',r4,'sA',21,'sB',12,'w','A'));
 begin perform public.save_court_scores(1,1,scores,v,'102',a->'1');raise exception 'FAIL repeated doubles pairing accepted';
 exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 raise notice 'PASS review: wrong scheduled pairing rejected';

 money=public.record_payment(spare,'spare',20,1,'2026-09-15','test transfer',request);
 if public.record_payment(spare,'spare',20,1,'2026-09-15','test transfer',request)<>money then raise exception 'FAIL payment retry created another entry';end if;
 if (select count(*) from public.payments where request_id=request)<>1 then raise exception 'FAIL duplicate payment entry';end if;
 begin perform public.record_payment(spare,'spare',10,1,'2026-09-15','changed transfer',request);raise exception 'FAIL request ID reused for different payment';
 exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform public.record_payment(spare,'spare',0,1,'2026-09-15','zero',gen_random_uuid());raise exception 'FAIL zero payment accepted';
 exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform public.record_payment(spare,'spare',20,999,'2026-09-15','invalid session',gen_random_uuid());raise exception 'FAIL invalid session accepted';
 exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 raise notice 'PASS review: payment retries are idempotent and invalid amounts/sessions are rejected';

 perform public.set_rsvp(1,spare,'coming','first');
 select updated_at into old_time from public.rsvps where session_number=1 and player_id=spare;
 perform public.set_rsvp(1,spare,'coming','note correction');
 if (select updated_at from public.rsvps where session_number=1 and player_id=spare)<>old_time then raise exception 'FAIL identical answer lost original timestamp';end if;
 raise notice 'PASS review: repeated RSVP and note edits preserve answer timestamp';

 snapshot=public.save_league_snapshot('Review recovery fixture');
 select name into before_name from public.players where id=p1;
 update public.players set name='Changed after snapshot' where id=p1;
 perform public.record_payment(spare,'spare',7,2,'2026-09-15','after snapshot',gen_random_uuid());
 perform public.restore_league_snapshot(snapshot);
 if (select name from public.players where id=p1)<>before_name then raise exception 'FAIL player name not restored';end if;
 if exists(select 1 from public.payments where note='after snapshot') then raise exception 'FAIL ledger not restored';end if;
 if not exists(select 1 from public.payments where request_id=request) then raise exception 'FAIL original payment not restored';end if;
 if not exists(select 1 from public.rsvps where session_number=1 and player_id=spare and updated_at=old_time) then raise exception 'FAIL RSVP not restored';end if;
 raise notice 'PASS review: transactional snapshot restores player, ledger and RSVP records with original IDs';
 select count(*) into n from public.app_state where key like 'snapshot\_%';
 if n<2 then raise exception 'FAIL restore did not first save current data';end if;
 raise notice 'PASS review: restore retains its mandatory pre-restore snapshot';
end $$;
rollback;
