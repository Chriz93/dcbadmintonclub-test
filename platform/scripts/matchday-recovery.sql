-- Run only after the synthetic fixture in approved TEST. Recovery mutations roll back.
begin;
do $$ declare c uuid='f0260907-0001-4000-8000-000000000001';s uuid='f0260907-0003-4000-8000-000000000001';a uuid='f0260907-0006-4000-8000-000000000001';rev int;event_id bigint;old_ratings jsonb;begin
 perform set_config('request.jwt.claim.sub',a::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'aal','aal2')::text,true);
 select jsonb_agg(to_jsonb(e) order by user_id) into old_ratings from club_app.elo_ratings e where club_id=c;
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
select 'PASS: 80-game match day, rewind rounds 3–4, undo, exact ELO restoration; all recovery mutations rolled back' as recovery_result;
