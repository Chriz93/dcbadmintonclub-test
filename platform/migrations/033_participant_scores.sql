begin;
-- A signed-in active participant may submit a first result for their own game.
-- Recorded results remain administrator-only corrections, with audit and revision checks.
create or replace function club_app.submit_score(c uuid,m uuid,a int,b int,expected_revision int) returns int language plpgsql security definer set search_path='' as $$
declare sid uuid; game club_app.matches;begin
 if expected_revision is null or expected_revision<0 then raise exception 'Valid revision required';end if;
 select session_id into sid from club_app.matches where club_id=c and id=m;
 perform 1 from club_app.sessions where club_id=c and id=sid for update;
 select * into game from club_app.matches where club_id=c and id=m for update;
 if not found then raise exception 'Match unavailable';end if;
 if not club_app.is_scorekeeper(c) and not (club_app.is_member(c) and auth.uid()=any(game.side_a||game.side_b)) then raise exception 'Forbidden: submit only your own matches' using errcode='42501';end if;
 perform club_app.throttle();
 if game.revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if game.score_a is not null or game.score_b is not null then raise exception 'Recorded scores require administrator correction with a reason';end if;
 if not exists(select 1 from club_app.sessions where club_id=c and id=sid and status in ('scheduled','active')) then raise exception 'Session is not active';end if;
 if a is null or b is null or a<0 or b<0 or greatest(a,b)<>game.target or a=b then raise exception 'Invalid completed score';end if;
 update club_app.matches set score_a=a,score_b=b,revision=revision+1 where id=m;
 update club_app.sessions set status='active' where club_id=c and id=sid and status='scheduled';
 insert into club_app.audit_events(club_id,actor,action,before_value,after_value) values(c,auth.uid(),'score.changed',jsonb_build_object('match',m,'a',game.score_a,'b',game.score_b),jsonb_build_object('match',m,'a',a,'b',b));
 return game.revision+1;
end $$;
revoke all on function club_app.submit_score(uuid,uuid,int,int,int) from public,anon,authenticated,service_role;
grant execute on function club_app.submit_score(uuid,uuid,int,int,int) to authenticated;
commit;
