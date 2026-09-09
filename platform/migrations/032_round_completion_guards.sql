begin;
-- A complete rotation is derived from the assignments, not just the surviving scores.
create function club_app.assert_round_complete(c uuid,s uuid,r int) returns void language plpgsql security definer set search_path='' as $$
declare ct record; g record; n int; expected int; target_score int; pair_count int; se uuid;
begin
 select season_id into se from club_app.sessions where club_id=c and id=s;
 if not exists(select 1 from club_app.assignments where club_id=c and session_id=s and round=r) then raise exception 'Previous round has no assignments';end if;
 if exists(select 1 from club_app.matches m where m.club_id=c and m.session_id=s and m.round=r and not exists(select 1 from club_app.assignments a where a.club_id=c and a.session_id=s and a.round=r and a.court_id=m.court_id)) then raise exception 'Game outside assigned courts';end if;
 for ct in select court_id,array_agg(user_id) ids from club_app.assignments where club_id=c and session_id=s and round=r group by court_id loop
  n=cardinality(ct.ids);expected=case when n=5 then 5 else 3 end;
  if n not between 2 and 5 then raise exception 'Invalid court size';end if;
  select coalesce((rules->>case when n=5 then 'fiveTarget' else 'normalTarget' end)::int,case when n=5 then 15 else 21 end) into target_score from club_app.seasons where id=se;
  if (select count(*) from club_app.matches where club_id=c and session_id=s and round=r and court_id=ct.court_id)<>expected then raise exception 'All scheduled games must be complete before moving or closing';end if;
  for g in select * from club_app.matches where club_id=c and session_id=s and round=r and court_id=ct.court_id loop
   if g.score_a is null or g.score_b is null then raise exception 'All scheduled games must be complete before moving or closing';end if;
   if g.game not between 1 and expected or g.target<>target_score or greatest(g.score_a,g.score_b)<>g.target or least(g.score_a,g.score_b)<0 or g.score_a=g.score_b then raise exception 'Invalid round score or game number';end if;
   if cardinality(g.side_a)<>(case when n<4 then 1 else 2 end) or cardinality(g.side_b)<>cardinality(g.side_a) or not (g.side_a||g.side_b)<@ct.ids or cardinality(g.side_a||g.side_b)<>(select count(distinct u) from unnest(g.side_a||g.side_b) u) then raise exception 'Invalid round participants';end if;
  end loop;
  if exists(select 1 from unnest(ct.ids) u where (select count(*) from club_app.matches m where m.club_id=c and m.session_id=s and m.round=r and m.court_id=ct.court_id and u=any(m.side_a||m.side_b))<>(case when n=2 then 3 when n=3 then 2 when n=4 then 3 else 4 end)) then raise exception 'Incomplete player rotation or rest coverage';end if;
  if n>2 then
   select count(distinct pair) into pair_count from (
    select array(select unnest(case when n=3 then m.side_a||m.side_b else m.side_a end) order by 1) pair from club_app.matches m where m.club_id=c and m.session_id=s and m.round=r and m.court_id=ct.court_id
    union all
    select array(select unnest(m.side_b) order by 1) from club_app.matches m where m.club_id=c and m.session_id=s and m.round=r and m.court_id=ct.court_id and n>=4
   ) p;
   if pair_count<>n*(n-1)/2 then raise exception 'Duplicate or missing partner rotation';end if;
  end if;
 end loop;
end $$;
revoke all on function club_app.assert_round_complete(uuid,uuid,int) from public,anon,authenticated,service_role;

alter function club_app.assign_courts(uuid,uuid,int,jsonb,int,text) rename to assign_courts_before_round_guard;
revoke all on function club_app.assign_courts_before_round_guard(uuid,uuid,int,jsonb,int,text) from public,anon,authenticated,service_role;
create function club_app.assign_courts(c uuid,s uuid,round_number int,plan jsonb,expected_revision int,reason text) returns void language plpgsql security definer set search_path='' as $$
declare latest int; actual_revision int;begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 select revision into actual_revision from club_app.sessions where club_id=c and id=s for update;
 if expected_revision is null or expected_revision<0 then raise exception 'Valid revision required';end if;
 if actual_revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 select coalesce(max(r),0) into latest from (select round r from club_app.assignments where club_id=c and session_id=s union all select round from club_app.matches where club_id=c and session_id=s) q;
 if round_number>latest+1 then raise exception 'Cannot skip a round';end if;
 if round_number<latest then raise exception 'Later rounds exist; use reviewed restart first';end if;
 if round_number>1 then perform club_app.assert_round_complete(c,s,round_number-1);end if;
 perform club_app.assign_courts_before_round_guard(c,s,round_number,plan,expected_revision,reason);
end $$;
revoke all on function club_app.assign_courts(uuid,uuid,int,jsonb,int,text) from public,anon,authenticated,service_role;
grant execute on function club_app.assign_courts(uuid,uuid,int,jsonb,int,text) to authenticated;

alter function club_app.complete_session(uuid,uuid,int) rename to complete_session_before_round_guard;
revoke all on function club_app.complete_session_before_round_guard(uuid,uuid,int) from public,anon,authenticated,service_role;
create function club_app.complete_session(c uuid,s uuid,expected_revision int) returns void language plpgsql security definer set search_path='' as $$
declare last_round int; r int; actual_revision int;begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 select revision into actual_revision from club_app.sessions where club_id=c and id=s for update;
 if expected_revision is null or expected_revision<0 then raise exception 'Valid revision required';end if;
 if actual_revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 select max(round) into last_round from club_app.matches where club_id=c and session_id=s;
 if last_round is null then raise exception 'No matches to complete';end if;
 for r in 1..last_round loop perform club_app.assert_round_complete(c,s,r);end loop;
 perform club_app.complete_session_before_round_guard(c,s,expected_revision);
end $$;
revoke all on function club_app.complete_session(uuid,uuid,int) from public,anon,authenticated,service_role;
grant execute on function club_app.complete_session(uuid,uuid,int) to authenticated;
commit;
