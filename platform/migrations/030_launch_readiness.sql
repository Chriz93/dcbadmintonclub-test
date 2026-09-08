begin;
-- 1. Closed registration: the shared link only completes onboarding for people Christy has confirmed.
create table club_app.season_invitations(
 club_id uuid not null,season_id uuid not null,email text not null check(email=lower(trim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
 kind text not null check(kind in ('regular','spare')),invited_by uuid not null references auth.users(id),reason text not null,created_at timestamptz not null default now(),
 primary key(club_id,season_id,email),foreign key(club_id,season_id) references club_app.seasons(club_id,id)
);
alter table club_app.season_invitations enable row level security;
create policy invitation_admin on club_app.season_invitations for select to authenticated using(club_app.is_admin(club_id));
revoke all on club_app.season_invitations from public,anon,authenticated,service_role;
grant select on club_app.season_invitations to authenticated;
create function club_app.invite_participants(c uuid,s uuid,emails text[],kind text,reason text) returns int language plpgsql security definer set search_path='' as $$ declare e text; n int=0;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 if kind is null or kind not in ('regular','spare') or reason is null or length(trim(reason)) not between 5 and 500 or emails is null or cardinality(emails) not between 1 and 300 then raise exception 'Confirmed player type, addresses and reason required';end if;
 perform 1 from club_app.seasons where club_id=c and id=s for update;if not found then raise exception 'Season unavailable';end if;
 foreach e in array emails loop
  e=lower(trim(e));
  if e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(e)>254 then raise exception 'Invalid email address in list';end if;
  insert into club_app.season_invitations(club_id,season_id,email,kind,invited_by,reason) values(c,s,e,kind,auth.uid(),trim(reason))
  on conflict(club_id,season_id,email) do update set kind=excluded.kind,invited_by=excluded.invited_by,reason=excluded.reason,created_at=now();
  n=n+1;
 end loop;
 insert into club_app.audit_events(club_id,actor,action,after_value) values(c,auth.uid(),'invitation.added',jsonb_build_object('season',s,'kind',kind,'count',n,'reason',trim(reason)));
 return n;
end $$;
create function club_app.revoke_invitation(c uuid,s uuid,email text,reason text) returns void language plpgsql security definer set search_path='' as $$ begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 if reason is null or length(trim(reason)) not between 5 and 500 then raise exception 'Reason required';end if;
 delete from club_app.season_invitations where club_id=c and season_id=s and club_app.season_invitations.email=lower(trim(revoke_invitation.email));
 if not found then raise exception 'Invitation unavailable';end if;
 insert into club_app.audit_events(club_id,actor,action,after_value) values(c,auth.uid(),'invitation.revoked',jsonb_build_object('season',s,'reason',trim(reason)));
end $$;
-- Tells the signed-in person whether their verified email is on the confirmed list; never lists others.
create function club_app.my_invitation(c uuid,s uuid) returns text language sql stable security definer set search_path='' as $$
 select case when coalesce((se.rules->>'registrationClosed')::boolean,false)=false then 'open' else coalesce((select i.kind from club_app.season_invitations i join auth.users u on u.id=auth.uid() and u.email_confirmed_at is not null where i.club_id=c and i.season_id=s and i.email=lower(trim(u.email))),'none') end
 from club_app.seasons se where se.club_id=c and se.id=s
$$;
alter function club_app.submit_intake(uuid,uuid,text,text,text,text,text,text,int,int) rename to submit_intake_open_impl;
revoke all on function club_app.submit_intake_open_impl(uuid,uuid,text,text,text,text,text,text,int,int) from public,anon,authenticated,service_role;
create function club_app.submit_intake(c uuid,s uuid,legal_name text,display_name text,phone text,emergency_contact text,kind text,payment_reference text,claimed_amount_cents int,expected_revision int) returns int language plpgsql security definer set search_path='' as $$ declare invited text;begin
 invited=club_app.my_invitation(c,s);
 if invited is null then raise exception 'Season unavailable';end if;
 if invited='none' then raise exception 'Registration is closed. This link completes onboarding only for players Christy has confirmed; contact the organizer if you were accepted.' using errcode='42501';end if;
 if invited<>'open' and invited<>kind then raise exception 'Choose the player type Christy confirmed for you';end if;
 return club_app.submit_intake_open_impl(c,s,legal_name,display_name,phone,emergency_contact,kind,payment_reference,claimed_amount_cents,expected_revision);
end $$;

-- 2. Court plans keep an explicit lineup ordinal so five-player rest order can rotate across rounds,
--    and a session only becomes active at the first recorded score or once the RSVP window has closed.
alter table club_app.assignments add column ordinal int;
create or replace function club_app.assign_courts_impl(c uuid,s uuid,round_number int,plan jsonb,expected_revision int,reason text) returns void language plpgsql security definer set search_path='' as $$
declare sess club_app.sessions; item jsonb; players uuid[]; court uuid; pair int[]; templates int[][]; n int; g int; i int; target_score int; u uuid; total int; distinct_total int; old_plan jsonb;
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
  for i in 1..n loop
   u=players[i];
   if not exists(select 1 from club_app.memberships where club_id=c and user_id=u and status='active') then raise exception 'Player is not an active member of this club';end if;
   insert into club_app.assignments(club_id,session_id,user_id,court_id,round,ordinal) values(c,s,u,court,round_number,i);
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
 update club_app.sessions set status=case when now()>=rsvp_deadline then 'active' else status end,revision=revision+1 where id=s;
 insert into club_app.audit_events(club_id,actor,action,before_value,after_value) values(c,auth.uid(),'assignments.changed',old_plan,jsonb_build_object('session',s,'round',round_number,'plan',plan,'reason',reason));
end $$;
create or replace function club_app.submit_score_impl(c uuid,m uuid,a int,b int,expected_revision int) returns int language plpgsql security definer set search_path='' as $$ declare game club_app.matches;begin
 perform club_app.throttle();if not club_app.is_scorekeeper(c) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into game from club_app.matches where club_id=c and id=m for update;if not found then raise exception 'Match unavailable';end if;
 if game.revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if not exists(select 1 from club_app.sessions where club_id=c and id=game.session_id and status in ('scheduled','active')) then raise exception 'Session is not active';end if;
 if a is null or b is null or a<0 or b<0 or greatest(a,b)<>game.target or a=b then raise exception 'Invalid completed score';end if;
 update club_app.matches set score_a=a,score_b=b,revision=revision+1 where id=m;
 -- The first recorded score opens play; spare voting closes at that point rather than at planning time.
 update club_app.sessions set status='active' where club_id=c and id=game.session_id and status='scheduled';
 insert into club_app.audit_events(club_id,actor,action,before_value,after_value) values(c,auth.uid(),'score.changed',jsonb_build_object('match',m,'a',game.score_a,'b',game.score_b),jsonb_build_object('match',m,'a',a,'b',b));
 return game.revision+1;
end $$;

create or replace function club_app.complete_session_impl(c uuid,s uuid,expected_revision int) returns void language plpgsql security definer set search_path='' as $$ declare sess club_app.sessions;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 select * into sess from club_app.sessions where club_id=c and id=s for update;if not found or sess.status not in ('scheduled','active') then raise exception 'Session not active';end if;
 if sess.revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 perform 1 from club_app.seasons where id=sess.season_id for update;
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

-- 3. Spares are told again when a new vacancy opens after an earlier notice, and never after it closes.
create or replace function club_app.queue_due_reminders() returns int language plpgsql security definer set search_path='' as $$ declare s record; u record; n int; epoch text;begin
 n=club_app.queue_due_reminders_impl();
 for s in select se.club_id,se.id,se.season_id from club_app.sessions se join club_app.seasons season on season.id=se.season_id where se.status='scheduled' and se.starts_at>now() and se.starts_at<now()+interval '7 days' and season.rules->>'operationsEnabled'='true' loop
 perform club_app.promote_paid_spares(s.club_id,s.id);
 if club_app.spare_vacancies(s.club_id,s.id)>0 then
 select coalesce(to_char(greatest(coalesce((select max(v.changed_at) from club_app.rsvps v where v.club_id=s.club_id and v.session_id=s.id and v.response in ('not_attending','need_spare')),'epoch'::timestamptz),coalesce((select max(a.created_at) from club_app.audit_events a where a.club_id=s.club_id and a.action='spare.withdrawn' and a.after_value->>'session'=s.id::text),'epoch'::timestamptz)),'YYYYMMDDHH24MISS'),'0') into epoch;
 for u in select m.user_id from club_app.memberships m join club_app.registrations r on r.club_id=m.club_id and r.user_id=m.user_id where m.club_id=s.club_id and m.kind='spare' and m.status='active' and r.season_id=s.season_id and r.status='approved' and not exists(select 1 from club_app.spare_requests q where q.club_id=s.club_id and q.session_id=s.id and q.user_id=m.user_id and q.status in ('payment_pending','confirmed','reconciliation')) loop
 perform club_app.enqueue(s.club_id,u.user_id,'spare-vacancy:'||s.id||':'||u.user_id||':'||epoch,'spare.available',jsonb_build_object('session',s.id));end loop;
 end if;end loop;return n;
end $$;
alter function club_app.delivery_target(uuid) rename to delivery_target_consent_impl;
revoke all on function club_app.delivery_target_consent_impl(uuid) from public,anon,authenticated,service_role;
create function club_app.delivery_target(delivery_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_set(t,'{enabled}',to_jsonb((t->>'enabled')::boolean and case when d.template='spare.available' then exists(select 1 from club_app.sessions s where s.club_id=d.club_id and s.id=(d.payload->>'session')::uuid and s.status='scheduled' and s.starts_at>now() and club_app.spare_vacancies(s.club_id,s.id)>0) else true end))
 from club_app.notification_deliveries d cross join lateral club_app.delivery_target_consent_impl(d.id) t where d.id=delivery_id
$$;

-- 4. RSVP: authorize before taking the session lock; refund eligibility follows the season's configured fee.
create or replace function club_app.submit_rsvp(c uuid,s uuid,u uuid,response text,note text,expected_revision int,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare se club_app.sessions; operations_active boolean; was_replay boolean; result jsonb; fee int;begin
 if expected_revision is null or expected_revision<0 or request_id is null then raise exception 'Revision and request ID required';end if;
 if not (club_app.is_member(c) or club_app.is_admin(c)) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into se from club_app.sessions where club_id=c and id=s for update;
 select coalesce((rules->>'operationsEnabled')::boolean,false),coalesce((rules->>'regularFeeCents')::int,40000) into operations_active,fee from club_app.seasons where id=se.season_id;
 if operations_active then
 if not exists(select 1 from club_app.registrations r join club_app.memberships m on m.club_id=r.club_id and m.user_id=r.user_id where r.club_id=c and r.season_id=se.season_id and r.user_id=u and r.status='approved' and m.kind='regular') then raise exception 'Regular registration required; spares use paid booking' using errcode='42501';end if;
 if response in ('attending','late') and exists(select 1 from club_app.session_accounts where club_id=c and session_id=s and user_id=u and kind='absence_refund' and status='settled') then raise exception 'Settled refund requires administrator reconciliation';end if;
 if response in ('attending','late') and exists(select 1 from club_app.rsvps where club_id=c and session_id=s and user_id=u and club_app.rsvps.response in ('not_attending','need_spare')) and club_app.spare_vacancies(c,s)<=0 then raise exception 'Place filled; administrator must reconcile attendance';end if;
 end if;
 was_replay=exists(select 1 from club_app.requests where club_id=c and actor=auth.uid() and key=request_id);
 result=club_app.submit_rsvp_impl(c,s,u,response,note,expected_revision,request_id);
 if was_replay then return result;end if;
 if operations_active and not exists(select 1 from club_app.session_accounts where club_id=c and session_id=s and user_id=u and kind='absence_refund' and status='settled') then
 if response in ('not_attending','need_spare') and now()<=se.starts_at-interval '72 hours' and exists(select 1 from club_app.member_intake where club_id=c and season_id=se.season_id and user_id=u and payment_status='verified' and claimed_amount_cents>=fee) then
 insert into club_app.session_accounts(club_id,session_id,user_id,kind,cents) values(c,s,u,'absence_refund',coalesce((select (rules->>'absenceRefundCents')::int from club_app.seasons where id=se.season_id),1400)) on conflict(club_id,session_id,user_id,kind) do update set status='pending',revision=club_app.session_accounts.revision+1,updated_at=now() where club_app.session_accounts.status='void';
 elsif response not in ('not_attending','need_spare') then
 update club_app.session_accounts set status='void',revision=revision+1,updated_at=now() where club_id=c and session_id=s and user_id=u and kind='absence_refund' and status='pending';
 end if;end if;
 return result;
end $$;

-- 5. SMTP failures that provably happened before message submission may retry with backoff.
create function club_app.abandon_smtp_delivery(delivery_id uuid,attempt int) returns void language plpgsql security definer set search_path='' as $$ begin
 update club_app.notification_deliveries set smtp_started_at=null where id=delivery_id and attempts=attempt and status='processing' and smtp_started_at is not null and lease_until>now();
 if not found then raise exception 'Delivery cannot be released for retry';end if;
end $$;

-- 6. One private queue for organizer identity review, so nothing is approved from memory.
create function club_app.eligibility_review_queue(c uuid) returns table(user_id uuid,season_id uuid,legal_name text,birth_date date,guardian_email text,revision int,reviewed_at timestamptz,reviewed_guardian text,review_current boolean,signed boolean,registration_status text) language plpgsql stable security definer set search_path='' as $$ begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 return query select e.user_id,e.season_id,coalesce(i.legal_name,'Participant'),e.birth_date,e.guardian_email,e.revision,r.reviewed_at,r.guardian_name,(r.eligibility_revision=e.revision),
 exists(select 1 from club_app.signature_receipts sr where sr.club_id=e.club_id and sr.season_id=e.season_id and sr.participant_id=e.user_id),coalesce(g.status,'none')
 from club_app.participant_eligibility e left join club_app.member_intake i on i.club_id=e.club_id and i.season_id=e.season_id and i.user_id=e.user_id
 left join club_app.eligibility_reviews r on r.club_id=e.club_id and r.season_id=e.season_id and r.user_id=e.user_id
 left join club_app.registrations g on g.club_id=e.club_id and g.season_id=e.season_id and g.user_id=e.user_id
 where e.club_id=c order by (r.eligibility_revision=e.revision) nulls first,e.acknowledged_at;
end $$;

-- 7. A player's next session, own RSVP and own court in one private read.
create function club_app.my_upcoming(c uuid) returns table(session_id uuid,starts_at timestamptz,ends_at timestamptz,status text,rsvp_deadline timestamptz,refund_cutoff timestamptz,response text,placement text,rsvp_revision int,kind text,spare_status text,courts jsonb) language plpgsql stable security definer set search_path='' as $$ begin
 if not (club_app.is_member(c) or club_app.is_admin(c)) then raise exception 'Club membership required' using errcode='42501';end if;
 return query select s.id,s.starts_at,s.ends_at,s.status,s.rsvp_deadline,s.starts_at-interval '72 hours',coalesce(v.response,'no_response'),coalesce(v.placement,'none'),coalesce(v.revision,0),m.kind,q.status,
 coalesce((select jsonb_agg(jsonb_build_object('round',a.round,'court',ct.number) order by a.round) from club_app.assignments a join club_app.courts ct on ct.id=a.court_id and ct.club_id=a.club_id where a.club_id=s.club_id and a.session_id=s.id and a.user_id=auth.uid()),'[]'::jsonb)
 from club_app.sessions s join club_app.memberships m on m.club_id=s.club_id and m.user_id=auth.uid()
 left join club_app.rsvps v on v.club_id=s.club_id and v.session_id=s.id and v.user_id=auth.uid()
 left join club_app.spare_requests q on q.club_id=s.club_id and q.session_id=s.id and q.user_id=auth.uid()
 where s.club_id=c and s.status<>'cancelled' and s.ends_at>now()-interval '6 hours' order by s.starts_at limit 3;
end $$;
revoke all on function club_app.invite_participants(uuid,uuid,text[],text,text),club_app.revoke_invitation(uuid,uuid,text,text),club_app.my_invitation(uuid,uuid),club_app.submit_intake(uuid,uuid,text,text,text,text,text,text,int,int),club_app.assign_courts_impl(uuid,uuid,int,jsonb,int,text),club_app.submit_score_impl(uuid,uuid,int,int,int),club_app.queue_due_reminders(),club_app.delivery_target(uuid),club_app.submit_rsvp(uuid,uuid,uuid,text,text,int,uuid),club_app.abandon_smtp_delivery(uuid,int),club_app.eligibility_review_queue(uuid),club_app.my_upcoming(uuid) from public,anon,authenticated,service_role;
grant execute on function club_app.invite_participants(uuid,uuid,text[],text,text),club_app.revoke_invitation(uuid,uuid,text,text),club_app.my_invitation(uuid,uuid),club_app.submit_intake(uuid,uuid,text,text,text,text,text,text,int,int),club_app.submit_rsvp(uuid,uuid,uuid,text,text,int,uuid),club_app.eligibility_review_queue(uuid),club_app.my_upcoming(uuid) to authenticated;
grant execute on function club_app.queue_due_reminders(),club_app.delivery_target(uuid),club_app.abandon_smtp_delivery(uuid,int) to service_role;
commit;
