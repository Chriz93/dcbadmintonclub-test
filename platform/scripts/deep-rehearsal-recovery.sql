-- Approved TEST rehearsal only. All corrections/restarts below roll back after verification.
begin;set local role authenticated;
do $$
declare c uuid='f0260908-0001-4000-8000-000000000001';s uuid='f0260908-0003-4000-8000-000000000001';a uuid='f0260908-0006-4000-8000-000000000002';rev int;event_id bigint;old_ratings jsonb;original club_app.matches;
begin
 perform set_config('request.jwt.claim.sub',a::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'aal','aal2')::text,true);
 select jsonb_agg(to_jsonb(e) order by user_id) into old_ratings from club_app.elo_ratings e where club_id=c;
 select * into strict original from club_app.matches where session_id=s and round=1 and court_id='f0260908-0007-4000-8000-000000000001' and game=1;
 perform club_app.correct_score(c,original.id,original.score_b,original.score_a,original.revision,'Synthetic review: reverse winning side');
 if old_ratings is not distinct from (select jsonb_agg(to_jsonb(e) order by user_id) from club_app.elo_ratings e where club_id=c) then raise exception 'ELO did not change after reversing result';end if;
 perform club_app.correct_score(c,original.id,original.score_a,original.score_b,original.revision+1,'Synthetic review: restore original result');
 if old_ratings is distinct from (select jsonb_agg(to_jsonb(e) order by user_id) from club_app.elo_ratings e where club_id=c) then raise exception 'ELO did not exactly restore after correction';end if;
 select revision into rev from club_app.sessions where id=s;
 perform club_app.restart_round(c,s,3,rev,(select jsonb_object_agg(id,revision) from club_app.matches where session_id=s and round>=3),'Synthetic recovery of final two rounds');
 if (select count(*) from club_app.matches where session_id=s)<>40 then raise exception 'Expected first two rounds retained';end if;
 select max(id) into event_id from club_app.audit_events where club_id=c and action='round.restarted';
 select revision into rev from club_app.sessions where id=s;
 perform club_app.undo_round_restart(c,event_id,rev,'Synthetic restore before replacement work');
 if (select count(*) from club_app.matches where session_id=s)<>80 or (select status from club_app.sessions where id=s)<>'completed' then raise exception 'Full session was not restored';end if;
 if old_ratings is distinct from (select jsonb_agg(to_jsonb(e) order by user_id) from club_app.elo_ratings e where club_id=c) then raise exception 'Ratings were not restored exactly';end if;
end $$;
rollback;
select 'PASS: score reversal changed ELO; original score restored ELO exactly; restart 3–4 retained 40 games; undo restored 80 games and exact ELO. Recovery changes rolled back.' as recovery_result;
