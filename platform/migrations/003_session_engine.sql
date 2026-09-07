begin;
-- Owner-reviewed initial assignment or override. Whole plan is one versioned transaction.
create function club_app.assign_courts(c uuid,s uuid,round_number int,plan jsonb,expected_revision int,reason text) returns void language plpgsql security definer set search_path='' as $$
declare sess club_app.sessions; item jsonb; players uuid[]; court uuid; pair int[]; templates int[][]; n int; g int; target_score int; u uuid; total int; distinct_total int; old_plan jsonb;
begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 if round_number<1 or round_number>50 or reason is null or length(reason) not between 5 and 500 or jsonb_typeof(plan)<>'array' or jsonb_array_length(plan)>50 then raise exception 'Invalid assignment plan or audit reason';end if;
 select * into sess from club_app.sessions where club_id=c and id=s for update;
 if not found or sess.status not in ('scheduled','active') then raise exception 'Session unavailable';end if;
 if sess.revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if exists(select 1 from club_app.matches where club_id=c and session_id=s and round=round_number and score_a is not null) then raise exception 'Scored round cannot be reassigned';end if;
 select count(*),count(distinct member.value) into total,distinct_total from jsonb_array_elements(plan) p cross join lateral jsonb_array_elements_text(p->'players') member;
 if total<>distinct_total or total>sess.capacity then raise exception 'Duplicate players or capacity exceeded';end if;
 if (select count(*) from jsonb_array_elements(plan))<>(select count(distinct value->>'court_id') from jsonb_array_elements(plan)) then raise exception 'Duplicate court';end if;
 select jsonb_agg(to_jsonb(a)) into old_plan from club_app.assignments a where club_id=c and session_id=s and round=round_number;
 delete from club_app.matches where club_id=c and session_id=s and round=round_number;
 delete from club_app.assignments where club_id=c and session_id=s and round=round_number;
 for item in select value from jsonb_array_elements(plan) loop
  court=(item->>'court_id')::uuid;
  if not exists(select 1 from club_app.courts where id=court and club_id=c and venue_id=sess.venue_id) then raise exception 'Court outside session venue';end if;
  select array_agg(value::uuid) into players from jsonb_array_elements_text(item->'players');n=coalesce(array_length(players,1),0);
  if n=0 then continue;end if;if n not between 2 and 5 then raise exception 'Court must have 2–5 players';end if;
  foreach u in array players loop
   if not exists(select 1 from club_app.memberships where club_id=c and user_id=u and status='active') then raise exception 'Player is not an active member of this club';end if;
   insert into club_app.assignments values(c,s,u,court,round_number);
   perform club_app.enqueue(c,u,'assignment:'||s||':'||(sess.revision+1)||':'||u,'assignment.changed',jsonb_build_object('session',s,'court',court,'round',round_number));
  end loop;
  if n=2 then templates=array[[1,0,2,0],[1,0,2,0],[1,0,2,0]];
  elsif n=3 then templates=array[[1,0,2,0],[1,0,3,0],[2,0,3,0]];
  elsif n=4 then templates=array[[1,2,3,4],[1,3,2,4],[1,4,2,3]];
  else templates=array[[2,5,3,4],[3,1,4,5],[4,2,5,1],[5,3,1,2],[1,4,2,3]];end if;
  select coalesce((rules->>case when n=5 then 'fiveTarget' else 'normalTarget' end)::int,case when n=5 then 15 else 21 end) into target_score from club_app.seasons where id=sess.season_id;
  g=0;foreach pair slice 1 in array templates loop g=g+1;
   insert into club_app.matches(club_id,session_id,court_id,round,game,target,side_a,side_b) values(c,s,court,round_number,g,target_score,array_remove(array[players[pair[1]],players[pair[2]]],null),array_remove(array[players[pair[3]],players[pair[4]]],null));
  end loop;
 end loop;
 update club_app.sessions set status='active',revision=revision+1 where id=s;
 insert into club_app.audit_events(club_id,actor,action,before_value,after_value) values(c,auth.uid(),'assignments.changed',old_plan,jsonb_build_object('session',s,'round',round_number,'plan',plan,'reason',reason));
end $$;
create function club_app.check_in(c uuid,s uuid,u uuid,attendance_status text) returns void language plpgsql security definer set search_path='' as $$ begin
 perform club_app.throttle();if not club_app.is_scorekeeper(c) then raise exception 'Forbidden' using errcode='42501';end if;
 perform 1 from club_app.sessions where club_id=c and id=s and status in ('scheduled','active') for update;if not found then raise exception 'Session unavailable';end if;
 if not exists(select 1 from club_app.memberships where club_id=c and user_id=u and status='active') then raise exception 'Invalid member';end if;
 insert into club_app.attendance values(c,s,u,attendance_status) on conflict(club_id,session_id,user_id) do update set status=excluded.status;
 insert into club_app.audit_events(club_id,actor,subject,action,after_value) values(c,auth.uid(),u,'attendance.changed',jsonb_build_object('session',s,'status',attendance_status));
end $$;
create function club_app.complete_session(c uuid,s uuid,expected_revision int) returns void language plpgsql security definer set search_path='' as $$ declare sess club_app.sessions;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 select * into sess from club_app.sessions where club_id=c and id=s for update;if not found or sess.status<>'active' then raise exception 'Session not active';end if;
 if sess.revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 perform 1 from club_app.seasons where id=sess.season_id for update;
 -- Season lock serializes aggregate rebuilds across simultaneous sessions.
 -- Match locks serialize score edits with finalization.
 perform 1 from club_app.matches where club_id=c and session_id=s for update;
 if not exists(select 1 from club_app.matches where club_id=c and session_id=s) or exists(select 1 from club_app.matches where club_id=c and session_id=s and score_a is null) then raise exception 'All scheduled games must be completed';end if;
 update club_app.sessions set status='completed',revision=revision+1 where id=s;
 delete from club_app.rankings where club_id=c and season_id=sess.season_id;
 insert into club_app.rankings(club_id,season_id,user_id,played,wins,points,possible_points)
 select c,sess.season_id,p.user_id,count(*)::int,sum(case when p.on_a then (m.score_a>m.score_b)::int else (m.score_b>m.score_a)::int end)::int,sum(case when p.on_a then m.score_a else m.score_b end)::int,sum(m.target)::int
 from club_app.matches m join club_app.sessions se on se.id=m.session_id and se.club_id=m.club_id cross join lateral (select unnest(m.side_a) user_id,true on_a union all select unnest(m.side_b),false) p
 where m.club_id=c and se.season_id=sess.season_id and se.status='completed' group by p.user_id;
 insert into club_app.audit_events(club_id,actor,action,after_value) values(c,auth.uid(),'session.completed',jsonb_build_object('session',s));
end $$;
drop function club_app.approve_member(uuid,uuid);
create function club_app.approve_member(c uuid,s uuid,u uuid) returns text language plpgsql security definer set search_path='' as $$ declare cap int; used int; outcome text;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 select regular_capacity into cap from club_app.seasons where club_id=c and id=s for update;if not found then raise exception 'Season unavailable';end if;
 if not exists(select 1 from club_app.registrations where club_id=c and season_id=s and user_id=u and status='pending') then raise exception 'Pending registration unavailable';end if;
 if not exists(select 1 from club_app.waiver_acceptances where club_id=c and user_id=u) then raise exception 'Waiver acceptance required';end if;
 select count(*) into used from club_app.registrations where club_id=c and season_id=s and status='approved';outcome=case when used<cap then 'approved' else 'waitlisted' end;
 update club_app.registrations set status=outcome where club_id=c and season_id=s and user_id=u;
 update club_app.memberships set status=case when outcome='approved' then 'active' else 'waitlisted' end where club_id=c and user_id=u and status<>'active';
 insert into club_app.audit_events(club_id,actor,subject,action,after_value) values(c,auth.uid(),u,'membership.reviewed',jsonb_build_object('season',s,'status',outcome));return outcome;
end $$;
revoke all on all functions in schema club_app from public;
grant execute on function club_app.assign_courts(uuid,uuid,int,jsonb,int,text),club_app.check_in(uuid,uuid,uuid,text),club_app.complete_session(uuid,uuid,int),club_app.approve_member(uuid,uuid,uuid) to authenticated;
commit;
