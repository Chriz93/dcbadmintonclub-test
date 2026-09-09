begin;
create table club_app.rating_history(club_id uuid not null,season_id uuid not null,session_id uuid not null,user_id uuid not null,round int not null, before_rating numeric not null,after_rating numeric not null,games int not null,primary key(club_id,session_id,round,user_id),foreign key(club_id,session_id) references club_app.sessions(club_id,id),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id));
create table club_app.final_placements(club_id uuid not null,session_id uuid not null,user_id uuid not null,court_id uuid not null,ordinal int not null,source_round int not null,primary key(club_id,session_id,user_id),foreign key(club_id,session_id) references club_app.sessions(club_id,id),foreign key(club_id,court_id) references club_app.courts(club_id,id),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id));
create table club_app.match_reviews(id uuid primary key default gen_random_uuid(),club_id uuid not null,match_id uuid not null,user_id uuid not null,match_revision int not null,requested_a int not null,requested_b int not null,message text not null,status text not null default 'open' check(status in ('open','accepted','declined')),resolution text,revision int not null default 1,created_at timestamptz not null default now(),foreign key(club_id,match_id) references club_app.matches(club_id,id) on delete cascade,foreign key(club_id,user_id) references club_app.memberships(club_id,user_id));
create unique index one_open_match_review on club_app.match_reviews(club_id,match_id,user_id) where status='open';
create table club_app.league_questions(id uuid primary key default gen_random_uuid(),club_id uuid not null,user_id uuid not null,question text not null,answer text,revision int not null default 1,created_at timestamptz not null default now(),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id));
alter table club_app.rating_history enable row level security;
alter table club_app.final_placements enable row level security;
alter table club_app.match_reviews enable row level security;
alter table club_app.league_questions enable row level security;
create policy history_read on club_app.rating_history for select to authenticated using(club_app.is_member(club_id));
create policy final_read on club_app.final_placements for select to authenticated using(club_app.is_member(club_id));
create policy review_read on club_app.match_reviews for select to authenticated using(user_id=auth.uid() or club_app.is_admin(club_id));
create policy question_read on club_app.league_questions for select to authenticated using(club_app.is_member(club_id) and (answer is not null or user_id=auth.uid() or club_app.is_admin(club_id)));
revoke all on club_app.rating_history,club_app.final_placements,club_app.match_reviews,club_app.league_questions from public,anon,authenticated,service_role;
grant select on club_app.rating_history,club_app.final_placements,club_app.match_reviews,club_app.league_questions to authenticated;
create or replace function club_app.rebuild_elo_all_members_impl(c uuid,se uuid) returns void language plpgsql security definer set search_path='' as $$ declare r record;begin
 perform 1 from club_app.seasons where club_id=c and id=se for update;
 delete from club_app.rating_history where club_id=c and season_id=se;
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
 ), updated as (update club_app.elo_ratings e set rating=e.rating+d.change,played=e.played+d.games from delta d where e.club_id=c and e.season_id=se and e.user_id=d.user_id returning e.user_id,e.rating-d.change before_rating,e.rating after_rating,d.games)
 insert into club_app.rating_history select c,se,r.session_id,user_id,r.round,before_rating,after_rating,games from updated;
 end loop;
end $$;
revoke all on function club_app.rebuild_elo_all_members_impl(uuid,uuid) from public,anon,authenticated,service_role;

create function club_app.finalize_session(c uuid,s uuid,expected_revision int,plan jsonb,reason text) returns void language plpgsql security definer set search_path='' as $$
declare sess club_app.sessions; last_round int; old jsonb;begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 select * into sess from club_app.sessions where club_id=c and id=s for update;
 if not found or sess.status not in ('active','completed') then raise exception 'Session unavailable';end if;
 if expected_revision is null or expected_revision<>sess.revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if reason is null or length(trim(reason)) not between 5 and 500 or plan is null or jsonb_typeof(plan)<>'array' or jsonb_array_length(plan)>50 then raise exception 'Reviewed final plan and reason required';end if;
 select max(round) into last_round from club_app.assignments where club_id=c and session_id=s;
 perform club_app.assert_round_complete(c,s,last_round);
 if (select count(*) from jsonb_array_elements(plan))<>(select count(distinct value->>'court_id') from jsonb_array_elements(plan)) then raise exception 'Duplicate court';end if;
 if exists(select 1 from jsonb_array_elements(plan) p where not exists(select 1 from club_app.courts ct where ct.id=(p->>'court_id')::uuid and ct.club_id=c and ct.venue_id=sess.venue_id)) then raise exception 'Court outside venue';end if;
 if exists(select 1 from jsonb_array_elements(plan) p where jsonb_typeof(p->'players') is distinct from 'array' or jsonb_array_length(p->'players')=1 or jsonb_array_length(p->'players')>5) then raise exception 'Invalid final court size';end if;
 if (select count(*) from jsonb_array_elements(plan) p cross join lateral jsonb_array_elements_text(p->'players') u)<>(select count(distinct u.value) from jsonb_array_elements(plan) p cross join lateral jsonb_array_elements_text(p->'players') u) then raise exception 'Duplicate player';end if;
 if (select array_agg(u.value::uuid order by u.value::uuid) from jsonb_array_elements(plan) p cross join lateral jsonb_array_elements_text(p->'players') u) is distinct from (select array_agg(user_id order by user_id) from club_app.assignments where club_id=c and session_id=s and round=last_round) then raise exception 'Final placement must preserve every last-round player';end if;
 select jsonb_agg(to_jsonb(f)) into old from club_app.final_placements f where club_id=c and session_id=s;
 if sess.status='active' then perform club_app.complete_session(c,s,expected_revision);else update club_app.sessions set revision=revision+1 where id=s;end if;
 delete from club_app.final_placements where club_id=c and session_id=s;
 insert into club_app.final_placements select c,s,u.value::uuid,(p->>'court_id')::uuid,u.ordinality,last_round from jsonb_array_elements(plan) p cross join lateral jsonb_array_elements_text(p->'players') with ordinality u;
 insert into club_app.audit_events(club_id,actor,action,before_value,after_value) values(c,auth.uid(),'final_placements.published',old,jsonb_build_object('session',s,'source_round',last_round,'plan',plan,'reason',trim(reason)));
end $$;

-- Hide invalidated final positions immediately when a session is restarted. The audit
-- retains the prior published record; an undo restores it only for a completed session.
alter function club_app.restart_round(uuid,uuid,int,int,jsonb,text) rename to restart_round_before_final_history;
revoke all on function club_app.restart_round_before_final_history(uuid,uuid,int,int,jsonb,text) from public,anon,authenticated,service_role;
create function club_app.restart_round(c uuid,s uuid,from_round int,expected_revision int,expected_matches jsonb,reason text) returns void language plpgsql security definer set search_path='' as $$ declare finals jsonb; restart_id bigint;begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 perform 1 from club_app.sessions where club_id=c and id=s for update;
 select coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) into finals from club_app.final_placements f where club_id=c and session_id=s;
 perform club_app.restart_round_before_final_history(c,s,from_round,expected_revision,expected_matches,reason);
 select id into restart_id from club_app.audit_events where club_id=c and action='round.restarted' and after_value->>'session'=s::text order by id desc limit 1;
 update club_app.audit_events set before_value=before_value||jsonb_build_object('final_placements',finals) where id=restart_id;
 delete from club_app.final_placements where club_id=c and session_id=s;
end $$;
alter function club_app.undo_round_restart(uuid,bigint,int,text) rename to undo_round_restart_before_final_history;
revoke all on function club_app.undo_round_restart_before_final_history(uuid,bigint,int,text) from public,anon,authenticated,service_role;
create function club_app.undo_round_restart(c uuid,event_id bigint,expected_revision int,reason text) returns void language plpgsql security definer set search_path='' as $$ declare event club_app.audit_events; sid uuid;begin
 perform club_app.undo_round_restart_before_final_history(c,event_id,expected_revision,reason);
 select * into event from club_app.audit_events where club_id=c and id=event_id;
 sid=(event.after_value->>'session')::uuid;
 if event.before_value->'session'->>'status'='completed' then
  delete from club_app.final_placements where club_id=c and session_id=sid;
  insert into club_app.final_placements select * from jsonb_populate_recordset(null::club_app.final_placements,coalesce(event.before_value->'final_placements','[]'::jsonb));
 end if;
end $$;

create function club_app.request_match_review(c uuid,m uuid,expected_revision int,a int,b int,message text) returns uuid language plpgsql security definer set search_path='' as $$
declare g club_app.matches; saved uuid;begin
 if not club_app.is_member(c) then raise exception 'Forbidden' using errcode='42501';end if;
 perform club_app.throttle();
 select * into g from club_app.matches where club_id=c and id=m;
 if not found or not auth.uid()=any(g.side_a||g.side_b) then raise exception 'Request review only for your own game';end if;
 if expected_revision is null or g.revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if g.score_a is null or g.score_b is null or a is null or b is null or least(a,b)<0 or greatest(a,b)<>g.target or a=b or message is null or length(trim(message)) not between 5 and 500 then raise exception 'Completed proposed score and explanation required';end if;
 insert into club_app.match_reviews(club_id,match_id,user_id,match_revision,requested_a,requested_b,message) values(c,m,auth.uid(),expected_revision,a,b,trim(message)) on conflict do nothing returning id into saved;
 if saved is null then raise exception 'An open review already exists for this match';end if;
 return saved;
end $$;
create function club_app.resolve_match_review(c uuid,entry uuid,expected_revision int,accept boolean,reason text) returns void language plpgsql security definer set search_path='' as $$
declare req club_app.match_reviews; sid uuid;begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 select m.session_id into sid from club_app.match_reviews q join club_app.matches m on m.id=q.match_id where q.club_id=c and q.id=entry;
 perform 1 from club_app.sessions where club_id=c and id=sid for update;
 select * into req from club_app.match_reviews where club_id=c and id=entry for update;
 if not found or req.status<>'open' or expected_revision is null or expected_revision<>req.revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if accept is null or reason is null or length(trim(reason)) not between 5 and 500 then raise exception 'Explicit decision and reason required';end if;
 if accept then perform club_app.correct_score(c,req.match_id,req.requested_a,req.requested_b,req.match_revision,reason);end if;
 update club_app.match_reviews set status=case when accept then 'accepted' else 'declined' end,resolution=trim(reason),revision=revision+1 where id=entry;
 insert into club_app.audit_events(club_id,actor,subject,action,before_value,after_value) values(c,auth.uid(),req.user_id,'match_review.resolved',to_jsonb(req),jsonb_build_object('id',entry,'accepted',accept,'reason',trim(reason)));
end $$;
create function club_app.ask_league_question(c uuid,question text) returns uuid language plpgsql security definer set search_path='' as $$ declare saved uuid;begin
 if not club_app.is_member(c) then raise exception 'Forbidden' using errcode='42501';end if;perform club_app.throttle();
 if question is null or length(trim(question)) not between 10 and 1000 then raise exception 'Question must be 10–1000 characters';end if;
 insert into club_app.league_questions(club_id,user_id,question) values(c,auth.uid(),trim(question)) returning id into saved;return saved;
end $$;
create function club_app.answer_league_question(c uuid,entry uuid,expected_revision int,answer text) returns void language plpgsql security definer set search_path='' as $$ begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;perform club_app.throttle();
 if answer is null or length(trim(answer)) not between 5 and 3000 then raise exception 'Answer must be 5–3000 characters';end if;
 update club_app.league_questions set answer=trim(answer_league_question.answer),revision=revision+1 where club_id=c and id=entry and revision=expected_revision;
 if not found then raise exception 'Revision conflict' using errcode='40001';end if;
 insert into club_app.audit_events(club_id,actor,action,after_value) values(c,auth.uid(),'question.answered',jsonb_build_object('id',entry,'answer',trim(answer)));
end $$;

create function club_app.league_snapshot(c uuid,se uuid,known_version text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare payload jsonb; version text;begin
 if not club_app.is_member(c) then raise exception 'Forbidden' using errcode='42501';end if;
 if not exists(select 1 from club_app.seasons where club_id=c and id=se) then raise exception 'Season unavailable';end if;
 select jsonb_build_object(
 'season',(select jsonb_build_object('id',id,'name',name,'rules',jsonb_build_object('normalTarget',coalesce((rules->>'normalTarget')::int,21),'fiveTarget',coalesce((rules->>'fiveTarget')::int,15))) from club_app.seasons where club_id=c and id=se),
 'players',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.display_name,'seed',i.seed,'initialRating',coalesce(i.rating,1000),'rating',coalesce(e.rating,i.rating,1000),'played',coalesce(e.played,0)) order by m.display_name,m.id) from club_app.memberships ms join club_app.members m on m.id=ms.user_id left join club_app.initial_seeds i on i.club_id=c and i.season_id=se and i.user_id=m.id left join club_app.elo_ratings e on e.club_id=c and e.season_id=se and e.user_id=m.id where ms.club_id=c and (i.user_id is not null or e.played>0 or exists(select 1 from club_app.registrations reg where reg.club_id=c and reg.season_id=se and reg.user_id=m.id and reg.status='approved'))),'[]'::jsonb),
 'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'venue_id',venue_id,'starts_at',starts_at,'ends_at',ends_at,'status',status,'revision',revision) order by starts_at,id) from club_app.sessions where club_id=c and season_id=se),'[]'::jsonb),
 'courts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'number',number,'venue_id',venue_id) order by number,id) from club_app.courts where club_id=c),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'session_id',m.session_id,'court_id',m.court_id,'round',m.round,'game',m.game,'target',m.target,'a',m.side_a,'b',m.side_b,'scoreA',m.score_a,'scoreB',m.score_b,'revision',m.revision) order by s.starts_at,m.round,m.game,m.id) from club_app.matches m join club_app.sessions s on s.id=m.session_id where m.club_id=c and s.season_id=se and s.status in ('scheduled','active','completed')),'[]'::jsonb),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('session_id',a.session_id,'court_id',a.court_id,'round',a.round,'id',a.user_id,'ordinal',a.ordinal) order by a.session_id,a.round,a.court_id,a.ordinal,a.user_id) from club_app.assignments a join club_app.sessions s on s.id=a.session_id where a.club_id=c and s.season_id=se and s.status in ('scheduled','active','completed')),'[]'::jsonb),
 'finals',coalesce((select jsonb_agg(jsonb_build_object('session_id',f.session_id,'court_id',f.court_id,'round',f.source_round,'id',f.user_id,'ordinal',f.ordinal) order by f.session_id,f.court_id,f.ordinal) from club_app.final_placements f join club_app.sessions s on s.id=f.session_id where f.club_id=c and s.season_id=se and s.status='completed'),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(jsonb_build_object('session_id',h.session_id,'id',h.user_id,'round',h.round,'before',h.before_rating,'after',h.after_rating,'games',h.games) order by s.starts_at,h.session_id,h.round,h.user_id) from club_app.rating_history h join club_app.sessions s on s.id=h.session_id where h.club_id=c and h.season_id=se),'[]'::jsonb),
 'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'match_id',q.match_id,'user_id',q.user_id,'a',q.requested_a,'b',q.requested_b,'message',q.message,'status',q.status,'resolution',q.resolution,'revision',q.revision) order by q.created_at,q.id) from club_app.match_reviews q join club_app.matches m on m.id=q.match_id join club_app.sessions s on s.id=m.session_id where q.club_id=c and s.season_id=se and (q.user_id=auth.uid() or club_app.is_admin(c))),'[]'::jsonb),
 'questions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'question',q.question,'answer',q.answer,'revision',q.revision,'mine',q.user_id=auth.uid()) order by q.created_at,q.id) from club_app.league_questions q where q.club_id=c and (q.answer is not null or q.user_id=auth.uid() or club_app.is_admin(c))),'[]'::jsonb)
 ) into payload;
 version=md5(payload::text);
 if version=known_version then return jsonb_build_object('version',version,'unchanged',true);end if;
 return payload||jsonb_build_object('version',version,'unchanged',false);
end $$;
revoke all on function club_app.undo_round_restart(uuid,bigint,int,text),club_app.finalize_session(uuid,uuid,int,jsonb,text),club_app.restart_round(uuid,uuid,int,int,jsonb,text),club_app.request_match_review(uuid,uuid,int,int,int,text),club_app.resolve_match_review(uuid,uuid,int,boolean,text),club_app.ask_league_question(uuid,text),club_app.answer_league_question(uuid,uuid,int,text),club_app.league_snapshot(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function club_app.undo_round_restart(uuid,bigint,int,text),club_app.finalize_session(uuid,uuid,int,jsonb,text),club_app.restart_round(uuid,uuid,int,int,jsonb,text),club_app.request_match_review(uuid,uuid,int,int,int,text),club_app.resolve_match_review(uuid,uuid,int,boolean,text),club_app.ask_league_question(uuid,text),club_app.answer_league_question(uuid,uuid,int,text),club_app.league_snapshot(uuid,uuid,text) to authenticated;
-- Rebuild derived history only; never synthesize old final placements.
do $$ declare row record;begin for row in select club_id,id from club_app.seasons loop perform club_app.rebuild_elo(row.club_id,row.id);end loop;end $$;
commit;
