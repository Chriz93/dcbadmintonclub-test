begin;
-- Aggregate helper is deliberately inaccessible to browser roles.
create function club_app.rebuild_results(c uuid,se uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 perform 1 from club_app.seasons where club_id=c and id=se for update;
 delete from club_app.rankings where club_id=c and season_id=se;
 insert into club_app.rankings(club_id,season_id,user_id,played,wins,points,possible_points)
 select c,se,p.user_id,count(*)::int,sum(case when p.on_a then (m.score_a>m.score_b)::int else (m.score_b>m.score_a)::int end)::int,sum(case when p.on_a then m.score_a else m.score_b end)::int,sum(m.target)::int
 from club_app.matches m join club_app.sessions ss on ss.id=m.session_id and ss.club_id=m.club_id cross join lateral (select unnest(m.side_a) user_id,true on_a union all select unnest(m.side_b),false) p
 where m.club_id=c and ss.season_id=se and ss.status='completed' group by p.user_id;
end $$;
create function club_app.correct_score(c uuid,m uuid,a int,b int,expected_revision int,reason text) returns int language plpgsql security definer set search_path='' as $$
declare game club_app.matches; sess club_app.sessions; sid uuid;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 if expected_revision is null or expected_revision<0 or reason is null or length(trim(reason)) not between 5 and 500 then raise exception 'Revision and correction reason required';end if;
 select session_id into sid from club_app.matches where club_id=c and id=m;
 select * into sess from club_app.sessions where club_id=c and id=sid for update;
 if not found or sess.status not in ('active','completed') then raise exception 'Session unavailable';end if;
 perform 1 from club_app.seasons where id=sess.season_id for update;
 select * into game from club_app.matches where club_id=c and id=m for update;
 if not found then raise exception 'Match unavailable';end if;
 if game.revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if a is null or b is null or a<0 or b<0 or greatest(a,b)<>game.target or a=b then raise exception 'Invalid completed score';end if;
 update club_app.matches set score_a=a,score_b=b,revision=revision+1 where id=m;
 perform club_app.rebuild_results(c,sess.season_id);
 insert into club_app.audit_events(club_id,actor,action,before_value,after_value) values(c,auth.uid(),'score.corrected',to_jsonb(game),jsonb_build_object('match',m,'a',a,'b',b,'reason',trim(reason)));
 return game.revision+1;
end $$;
-- Serialize ordinary scoring with completion/recovery using the same lock order.
create or replace function club_app.submit_score(c uuid,m uuid,a int,b int,expected_revision int) returns int language plpgsql security definer set search_path='' as $$ declare sid uuid;begin
 if expected_revision is null or expected_revision<0 then raise exception 'Valid revision required';end if;
 if not club_app.is_scorekeeper(c) then raise exception 'Forbidden' using errcode='42501';end if;
 select session_id into sid from club_app.matches where club_id=c and id=m;
 perform 1 from club_app.sessions where club_id=c and id=sid for update;
 return club_app.submit_score_impl(c,m,a,b,expected_revision);
end $$;
-- The caller must review the exact match revisions, not merely the session version.
create function club_app.restart_round(c uuid,s uuid,from_round int,expected_revision int,expected_matches jsonb,reason text) returns void language plpgsql security definer set search_path='' as $$
declare sess club_app.sessions; snapshot jsonb; old_assignments jsonb; old_matches jsonb;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 if expected_revision is null or expected_revision<0 or from_round is null or from_round not between 1 and 50 or expected_matches is null or reason is null or length(trim(reason)) not between 5 and 500 then raise exception 'Reviewed round, revisions and reason required';end if;
 select * into sess from club_app.sessions where club_id=c and id=s for update;
 if not found or sess.status not in ('active','completed') then raise exception 'Session unavailable';end if;
 if sess.revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 perform 1 from club_app.seasons where id=sess.season_id for update;
 perform 1 from club_app.matches where club_id=c and session_id=s for update;
 select coalesce(jsonb_object_agg(id::text,revision),'{}'),jsonb_agg(to_jsonb(m)) into snapshot,old_matches from club_app.matches m where club_id=c and session_id=s and round>=from_round;
 if snapshot='{}'::jsonb then raise exception 'No rounds to restart';end if;
 if snapshot<>expected_matches then raise exception 'Match revision conflict' using errcode='40001';end if;
 select jsonb_agg(to_jsonb(a)) into old_assignments from club_app.assignments a where club_id=c and session_id=s and round>=from_round;
 insert into club_app.audit_events(club_id,actor,action,before_value,after_value) values(c,auth.uid(),'round.restarted',jsonb_build_object('session',to_jsonb(sess),'matches',old_matches,'assignments',old_assignments),jsonb_build_object('session',s,'from_round',from_round,'reason',trim(reason)));
 delete from club_app.matches where club_id=c and session_id=s and round>=from_round;
 delete from club_app.assignments where club_id=c and session_id=s and round>=from_round;
 update club_app.sessions set status='active',revision=revision+1 where id=s;
 perform club_app.rebuild_results(c,sess.season_id);
end $$;
create function club_app.league_standings(c uuid,se uuid) returns table(user_id uuid,display_name text,played int,wins int,points int,possible_points int,"position" bigint) language plpgsql stable security definer set search_path='' as $$ begin
 if not (club_app.is_member(c) or club_app.is_admin(c)) then raise exception 'Club membership required' using errcode='42501';end if;
 return query select r.user_id,m.display_name,r.played,r.wins,r.points,r.possible_points,
 dense_rank() over(order by r.wins::numeric/nullif(r.played,0) desc nulls last,r.points::numeric/nullif(r.possible_points,0) desc nulls last)
 from club_app.rankings r join club_app.members m on m.id=r.user_id where r.club_id=c and r.season_id=se
 order by 7,m.display_name,r.user_id;
end $$;
revoke all on function club_app.rebuild_results(uuid,uuid),club_app.correct_score(uuid,uuid,int,int,int,text),club_app.restart_round(uuid,uuid,int,int,jsonb,text),club_app.league_standings(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function club_app.correct_score(uuid,uuid,int,int,int,text),club_app.restart_round(uuid,uuid,int,int,jsonb,text),club_app.league_standings(uuid,uuid) to authenticated;
commit;
