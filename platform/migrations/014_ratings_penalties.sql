begin;
create table club_app.initial_seeds(club_id uuid not null,season_id uuid not null,user_id uuid not null,seed int not null check(seed>0),rating numeric not null,primary key(club_id,season_id,user_id),unique(club_id,season_id,seed),foreign key(club_id,season_id) references club_app.seasons(club_id,id),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id));
create table club_app.elo_ratings(club_id uuid not null,season_id uuid not null,user_id uuid not null,rating numeric not null,played int not null default 0,primary key(club_id,season_id,user_id),foreign key(club_id,season_id) references club_app.seasons(club_id,id),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id));
create table club_app.no_show_penalties(club_id uuid not null,session_id uuid not null,user_id uuid not null,status text not null default 'pending' check(status in ('pending','applied','void')),applied_session uuid,revision int not null default 1,reason text not null,primary key(club_id,session_id,user_id),foreign key(club_id,session_id) references club_app.sessions(club_id,id),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id),foreign key(club_id,applied_session) references club_app.sessions(club_id,id));
alter table club_app.initial_seeds enable row level security;
alter table club_app.elo_ratings enable row level security;
alter table club_app.no_show_penalties enable row level security;
create policy seeds_read on club_app.initial_seeds for select to authenticated using(club_app.is_member(club_id) or club_app.is_admin(club_id));
create policy elo_read on club_app.elo_ratings for select to authenticated using(club_app.is_member(club_id) or club_app.is_admin(club_id));
create policy penalty_read on club_app.no_show_penalties for select to authenticated using(user_id=auth.uid() or club_app.is_admin(club_id));
revoke all on club_app.initial_seeds,club_app.elo_ratings,club_app.no_show_penalties from public,anon,authenticated;
grant select on club_app.initial_seeds,club_app.elo_ratings,club_app.no_show_penalties to authenticated;
create function club_app.rebuild_elo(c uuid,se uuid) returns void language plpgsql security definer set search_path='' as $$ declare r record;begin
 perform 1 from club_app.seasons where club_id=c and id=se for update;
 delete from club_app.elo_ratings where club_id=c and season_id=se;
 insert into club_app.elo_ratings select c,se,m.user_id,coalesce(i.rating,1000),0 from club_app.memberships m left join club_app.initial_seeds i on i.club_id=c and i.season_id=se and i.user_id=m.user_id where m.club_id=c;
 -- Frozen ratings per round; mean delta gives the same round weight to 3- and 4-game players.
 for r in select m.session_id,m.round from club_app.matches m join club_app.sessions s on s.id=m.session_id where m.club_id=c and s.season_id=se and s.status='completed' group by m.session_id,m.round,s.starts_at order by s.starts_at,m.session_id,m.round loop
 with games as (
 select m.*,1.0/(1+power(10::numeric,((select avg(e.rating) from club_app.elo_ratings e where e.club_id=c and e.season_id=se and e.user_id=any(m.side_b))-(select avg(e.rating) from club_app.elo_ratings e where e.club_id=c and e.season_id=se and e.user_id=any(m.side_a)))/400)) expected
 from club_app.matches m where m.club_id=c and m.session_id=r.session_id and m.round=r.round and m.score_a is not null
 ), delta as (
 select p.user_id,avg(case when p.on_a then (g.score_a>g.score_b)::int-g.expected else (g.score_b>g.score_a)::int-(1-g.expected) end)*32 change,count(*)::int games
 from games g cross join lateral(select unnest(g.side_a) user_id,true on_a union all select unnest(g.side_b),false) p group by p.user_id
 ) update club_app.elo_ratings e set rating=e.rating+d.change,played=e.played+d.games from delta d where e.club_id=c and e.season_id=se and e.user_id=d.user_id;
 end loop;
end $$;
-- Existing completion/recovery/correction paths call rebuild_results; extend it atomically.
alter function club_app.rebuild_results(uuid,uuid) rename to rebuild_results_stats_impl;
revoke all on function club_app.rebuild_results_stats_impl(uuid,uuid) from public,anon,authenticated,service_role;
create function club_app.rebuild_results(c uuid,se uuid) returns void language plpgsql security definer set search_path='' as $$ begin perform club_app.rebuild_results_stats_impl(c,se);perform club_app.rebuild_elo(c,se);end $$;
create or replace function club_app.complete_session(c uuid,s uuid,expected_revision int) returns void language plpgsql security definer set search_path='' as $$ declare se uuid;begin
 if expected_revision is null or expected_revision<0 then raise exception 'Valid revision required';end if;
 perform club_app.complete_session_impl(c,s,expected_revision);
 select season_id into se from club_app.sessions where club_id=c and id=s;
 perform club_app.rebuild_elo(c,se);
end $$;
create function club_app.set_seeding(c uuid,se uuid,ordered uuid[],expected_revision int,reason text) returns int language plpgsql security definer set search_path='' as $$ declare v int; old jsonb;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 select coalesce((rules->>'seedingRevision')::int,0) into v from club_app.seasons where club_id=c and id=se for update;
 if not found or expected_revision is null or v<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if ordered is null or cardinality(ordered) not between 1 and 200 or cardinality(ordered)<>(select count(distinct x) from unnest(ordered) x) or reason is null or length(trim(reason)) not between 5 and 500 then raise exception 'Unique ordered members and reason required';end if;
 if exists(select 1 from unnest(ordered) x where not exists(select 1 from club_app.memberships where club_id=c and user_id=x and status='active')) then raise exception 'Active members required';end if;
 select jsonb_agg(to_jsonb(i)) into old from club_app.initial_seeds i where club_id=c and season_id=se;
 delete from club_app.initial_seeds where club_id=c and season_id=se;
 insert into club_app.initial_seeds select c,se,u,n,1000+(cardinality(ordered)-n)*15 from unnest(ordered) with ordinality p(u,n);
 update club_app.seasons set rules=rules||jsonb_build_object('seedingRevision',v+1) where id=se;
 perform club_app.rebuild_elo(c,se);
 insert into club_app.audit_events(club_id,actor,action,before_value,after_value) values(c,auth.uid(),'seeding.changed',old,jsonb_build_object('season',se,'ordered',ordered,'reason',reason));return v+1;
end $$;
create function club_app.record_no_show(c uuid,s uuid,u uuid,expected_revision int,void_penalty boolean,reason text) returns void language plpgsql security definer set search_path='' as $$ declare old club_app.no_show_penalties;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 perform 1 from club_app.sessions where club_id=c and id=s and status in ('scheduled','active','completed') and starts_at<=now() for update;
 if not found then raise exception 'Session has not started or is cancelled';end if;
 if reason is null or length(trim(reason)) not between 5 and 500 or void_penalty is null then raise exception 'Explicit decision and reason required';end if;
 select * into old from club_app.no_show_penalties where club_id=c and session_id=s and user_id=u for update;
 if expected_revision is null or coalesce(old.revision,0)<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if not void_penalty and (not exists(select 1 from club_app.attendance where club_id=c and session_id=s and user_id=u and status='absent') or not exists(select 1 from club_app.rsvps where club_id=c and session_id=s and user_id=u and response in ('attending','late') and placement='confirmed')) then raise exception 'Confirmed attendance commitment and verified absence required';end if;
 insert into club_app.no_show_penalties(club_id,session_id,user_id,status,revision,reason) values(c,s,u,case when void_penalty then 'void' else 'pending' end,coalesce(old.revision,0)+1,reason)
 on conflict(club_id,session_id,user_id) do update set status=excluded.status,revision=excluded.revision,reason=excluded.reason;
 insert into club_app.audit_events(club_id,actor,subject,action,before_value,after_value) values(c,auth.uid(),u,'no_show.reviewed',to_jsonb(old),jsonb_build_object('session',s,'void',void_penalty,'reason',reason));
end $$;
create or replace function club_app.assign_courts(c uuid,s uuid,round_number int,plan jsonb,expected_revision int,reason text) returns void language plpgsql security definer set search_path='' as $$ declare se uuid;begin
 if expected_revision is null or expected_revision<0 then raise exception 'Valid revision required';end if;
 if round_number is null or plan is null then raise exception 'Valid assignment plan required';end if;
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 select season_id into se from club_app.sessions where club_id=c and id=s for update;
 if exists(select 1 from club_app.seasons where id=se and rules->>'operationsEnabled'='true') then
 if exists(select 1 from jsonb_array_elements(plan) p cross join lateral jsonb_array_elements_text(p->'players') u where not exists(select 1 from club_app.registrations r join club_app.memberships m on m.club_id=r.club_id and m.user_id=r.user_id where r.club_id=c and r.season_id=se and r.user_id=u.value::uuid and r.status='approved' and (m.kind='regular' or exists(select 1 from club_app.spare_requests q where q.club_id=c and q.session_id=s and q.user_id=m.user_id and q.status='confirmed')))) then raise exception 'Approved registration and verified spare booking required';end if;
 end if;
 perform club_app.assign_courts_impl(c,s,round_number,plan,expected_revision,reason);
end $$;
-- Only explicitly reviewed penalties are consumed. Unresolved bottom-court cases remain pending.
create function club_app.assign_reviewed_courts(c uuid,s uuid,round_number int,plan jsonb,expected_revision int,reason text,penalties_applied uuid[]) returns void language plpgsql security definer set search_path='' as $$ begin
 if penalties_applied is null then raise exception 'Explicit reviewed penalties required';end if;
 if exists(select 1 from unnest(penalties_applied) u where not exists(select 1 from jsonb_array_elements(plan) p cross join lateral jsonb_array_elements_text(p->'players') x where x.value::uuid=u)) then raise exception 'Penalty player must be assigned';end if;
 perform club_app.assign_courts(c,s,round_number,plan,expected_revision,reason);
 if round_number=1 then
 update club_app.no_show_penalties n set status='applied',applied_session=s,revision=revision+1 where n.club_id=c and n.status='pending' and n.user_id=any(penalties_applied) and n.session_id<>s and n.session_id=(select q.session_id from club_app.no_show_penalties q join club_app.sessions qs on qs.id=q.session_id where q.club_id=c and q.user_id=n.user_id and q.status='pending' and q.session_id<>s order by qs.starts_at,q.session_id limit 1) and exists(select 1 from club_app.assignments a where a.club_id=c and a.session_id=s and a.round=1 and a.user_id=n.user_id);
 end if;
end $$;
revoke all on function club_app.assign_reviewed_courts(uuid,uuid,int,jsonb,int,text,uuid[]) from public,anon;
grant execute on function club_app.assign_reviewed_courts(uuid,uuid,int,jsonb,int,text,uuid[]) to authenticated;
alter function club_app.restart_round(uuid,uuid,int,int,jsonb,text) rename to restart_round_impl;
revoke all on function club_app.restart_round_impl(uuid,uuid,int,int,jsonb,text) from public,anon,authenticated,service_role;
create function club_app.restart_round(c uuid,s uuid,from_round int,expected_revision int,expected_matches jsonb,reason text) returns void language plpgsql security definer set search_path='' as $$ begin
 perform club_app.restart_round_impl(c,s,from_round,expected_revision,expected_matches,reason);
 if from_round=1 then update club_app.no_show_penalties set status='pending',revision=revision+1 where club_id=c and applied_session=s and status='applied';end if;
end $$;
revoke all on function club_app.restart_round(uuid,uuid,int,int,jsonb,text) from public,anon;
grant execute on function club_app.restart_round(uuid,uuid,int,int,jsonb,text) to authenticated;
revoke all on function club_app.rebuild_elo(uuid,uuid),club_app.rebuild_results(uuid,uuid),club_app.set_seeding(uuid,uuid,uuid[],int,text),club_app.record_no_show(uuid,uuid,uuid,int,boolean,text) from public,anon,authenticated,service_role;
grant execute on function club_app.set_seeding(uuid,uuid,uuid[],int,text),club_app.record_no_show(uuid,uuid,uuid,int,boolean,text) to authenticated;
commit;
