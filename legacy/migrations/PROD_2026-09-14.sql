-- Maplewood league release L22–L24 — PRODUCTION project (bwepvxelvwgwxrnaglrx), 14 September 2026. Run only after
-- PROD_2026-09-12.sql (L18–L21), with the organizer's approval and a verified backup. Built from TEST_2026-09-13.sql by
-- replacing only: this header, the three TEST-only assertions (now: this database must be marked production), and
-- the seeded regular capacity (26 → 27, the organizer's choice). One transaction: any failure rolls everything back.
-- L22–L24 are one transaction: any failure rolls the entire upgrade back.
begin;
do $$ begin if (select schema_version from public.environment where name='production') is distinct from 'L21' then raise exception 'Refusing: production must be at L21 (run PROD_2026-09-12.sql first) and not yet at L22'; end if; end $$;
-- L22_integrity.sql
-- Review remediation: atomic status/state writes, match identity, stable RSVPs and idempotent money entries.
-- Run after L21. This migration does not seed players, delete league data or contact a provider.
do $$ begin if not exists(select 1 from public.environment where name='production') then raise exception 'Refusing: this release is for the database marked production'; end if; end $$; -- PRODUCTION release (organizer-approved, 14 Sep 2026).

create or replace function public.validate_lineup(a jsonb) returns void language plpgsql security definer set search_path='' as $$
declare c text; ids jsonb; n int; seen bigint[]='{}'; pid bigint;
begin
 if jsonb_typeof(a) is distinct from 'object' then raise exception 'Assignments must be an object';end if;
 for c,ids in select * from jsonb_each(a) loop
  if c !~ '^[1-6]$' or jsonb_typeof(ids) is distinct from 'array' then raise exception 'Invalid court assignment';end if;
  n=jsonb_array_length(ids);
  if n=1 or n>5 then raise exception 'Court % must have zero or two to five players',c;end if;
  for pid in select (e#>>'{}')::bigint from jsonb_array_elements(ids) e loop
   if pid is null or pid=any(seen) or not exists(select 1 from public.players p where p.id=pid) then raise exception 'Unknown or duplicate player in assignments';end if;
   seen=array_append(seen,pid);
  end loop;
 end loop;
end $$;
revoke all on function public.validate_lineup(jsonb) from public,anon,authenticated,service_role;

create or replace function public.round_complete(cur jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare c text; ids jsonb; n int; cy text=cur->>'cycle'; games int; g int; prefix text; any_court boolean=false;
begin
 for c,ids in select * from jsonb_each(coalesce(cur->'assignments','{}'::jsonb)) loop
  n=jsonb_array_length(ids);if n=0 then continue;end if;if n<2 or n>5 then return false;end if;any_court=true;
  prefix='c'||c||'_y'||cy||'_g';games=case when n=5 then 5 else 3 end;
  if n=2 and cur#>>array['scores',prefix||'1','w'] is not null and (cur#>>array['scores',prefix||'1','w'])=(cur#>>array['scores',prefix||'2','w']) then games=2;end if;
  for g in 1..games loop if cur#>array['scores',prefix||g] is null then return false;end if;end loop;
 end loop;
 return any_court;
end $$;
revoke all on function public.round_complete(jsonb) from public,anon,authenticated,service_role;

create or replace function public.set_state(k text,v text,expected int) returns int language plpgsql security definer set search_path='' as $$
declare st public.app_state; data jsonb; old jsonb; c text; item record; capacity int=26;
begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 if k is null or length(k) not between 1 and 120 or v is null or k like 'snapshot\_%' and length(v)>4000000 then raise exception 'Invalid state write';end if;
 if k in ('admin_pin','pin','invite_code') then raise exception 'Retired key';end if;
 perform pg_advisory_xact_lock(7262026);
 select * into st from public.app_state where key=k for update;
 if st.key is null and coalesce(expected,0)<>0 or st.key is not null and expected is distinct from st.version then raise exception 'Stale state: refresh before saving' using errcode='40001';end if;
 data=v::jsonb;old=st.value::jsonb;
 if k='current_session' and data<>'null'::jsonb then
  perform public.validate_lineup(data->'assignments');
  if data->>'id' is null or data->>'number' is null or coalesce((data->>'cycle')::int,0)<1 then raise exception 'Invalid session identity';end if;
  if old is not null and old<>'null'::jsonb and data->>'id'=old->>'id' then
   if data->>'cycle'=old->>'cycle' and not (coalesce((data->>'completed')::boolean,false) and public.round_complete(old)) then
    for c in select generate_series(1,6)::text loop
     if data#>array['assignments',c] is distinct from old#>array['assignments',c]
        and exists(select 1 from jsonb_object_keys(coalesce(old->'scores','{}'::jsonb)) x where x like 'c'||c||'_y'||(old->>'cycle')||'_g%')
     then raise exception 'Court % already has scores; undo the round before changing its lineup',c;end if;
    end loop;
   elsif data->>'cycle' is distinct from old->>'cycle' and not public.round_complete(old) then raise exception 'Finish every court before advancing';end if;
  end if;
 end if;
 -- Keep the compatibility JSON and authoritative columns in the same transaction.
 if k='player_approvals' then
  if jsonb_typeof(data)<>'object' then raise exception 'Invalid approvals';end if;
  for item in select key,value from jsonb_each(data) loop
   update public.players p set approved=coalesce((item.value->>'approved')::boolean,p.approved),
    waitlisted=coalesce((item.value->>'waitlisted')::boolean,p.waitlisted),
    membership_type=coalesce(item.value->>'membershipType',p.membership_type),updated_at=now() where p.id=item.key::bigint;
  end loop;
 elsif k='membership_overrides' then
  for item in select key,value from jsonb_each_text(data) loop
   if item.value not in ('regular','spare') then raise exception 'Invalid membership type';end if;
   update public.players set membership_type=item.value,updated_at=now() where id=item.key::bigint;
  end loop;
 end if;
 if k in ('player_approvals','membership_overrides') then
  if exists(select 1 from public.players where membership_type not in ('regular','spare')) then raise exception 'Invalid membership type';end if;
  if (select count(*) from public.players where approved and not waitlisted and membership_type='regular')>capacity then raise exception 'Regular places are full; keep the player on the waitlist';end if;
 end if;
 insert into public.app_state(key,value,version,updated_at) values(k,v,coalesce(st.version,0)+1,now())
 on conflict(key) do update set value=excluded.value,version=excluded.version,updated_at=excluded.updated_at;
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'state.set',k,jsonb_build_object('version',coalesce(st.version,0)+1));
 return coalesce(st.version,0)+1;
end $$;

-- Pair order and side order are part of the scheduled game, not browser-supplied choices.
create or replace function public.game_pairing(a jsonb,g int) returns jsonb language plpgsql immutable set search_path='' as $$
declare n int=jsonb_array_length(a); ix int[];
begin
 if n=2 and g between 1 and 3 then ix=array[0,null,1,null];
 elsif n=3 then ix=case g when 1 then array[0,null,1,null] when 2 then array[0,null,2,null] when 3 then array[1,null,2,null] end;
 elsif n=4 then ix=case g when 1 then array[0,1,2,3] when 2 then array[0,2,1,3] when 3 then array[0,3,1,2] end;
 elsif n=5 then ix=case g when 1 then array[1,4,2,3] when 2 then array[2,0,3,4] when 3 then array[3,1,4,0] when 4 then array[4,2,0,1] when 5 then array[0,3,1,2] end;
 end if;
 if ix is null then raise exception 'Invalid game number';end if;
 return jsonb_build_object('a1',a->ix[1],'a2',a->ix[2],'b1',a->ix[3],'b2',a->ix[4]);
end $$;
revoke all on function public.game_pairing(jsonb,int) from public,anon,authenticated,service_role;
drop function if exists public.save_court_scores(int,int,jsonb,int);
create or replace function public.save_court_scores(p_court int,p_cycle int,p_scores jsonb,p_expected int,p_session text,p_lineup jsonb) returns int language plpgsql security definer set search_path='' as $$
declare st public.app_state; cur jsonb; assigned jsonb; n int; target int; k text; sc jsonb; sa int; sb int; me bigint; cnt int=0; g int; pair jsonb; prefix text;
begin
 perform pg_advisory_xact_lock(7262026);
 me=public.my_player_id();select * into st from public.app_state where key='current_session' for update;
 if st.key is null or st.value is null or st.value='null' then raise exception 'No active session';end if;cur=st.value::jsonb;
 if p_expected is distinct from st.version or p_session is distinct from cur->>'id' or p_cycle is distinct from (cur->>'cycle')::int then raise exception 'Stale state: this match changed; refresh before saving' using errcode='40001';end if;
 if coalesce((cur->>'completed')::boolean,false) then raise exception 'Session is complete; scores are locked';end if;
 if p_court is null or p_court not between 1 and 6 then raise exception 'Invalid court';end if;
 assigned=coalesce(cur->'assignments'->p_court::text,'[]'::jsonb);
 if p_lineup is distinct from assigned then raise exception 'Stale state: the court lineup changed' using errcode='40001';end if;
 if not public.is_admin() and (me is null or not assigned @> jsonb_build_array(me)) then raise exception 'Only players on this court (or the organizer) can enter its scores' using errcode='42501';end if;
 n=jsonb_array_length(assigned);if n<2 or n>5 then raise exception 'Court needs two to five players';end if;
 target=case when n=5 then 15 else 21 end;
 if jsonb_typeof(p_scores) is distinct from 'object' then raise exception 'Invalid scores';end if;
 for k,sc in select * from jsonb_each(p_scores) loop
  if k !~ ('^c'||p_court||'_y'||p_cycle||'_g[1-5]$') then raise exception 'Score key is not on this court and round';end if;
  g=substring(k from '_g([1-5])$')::int;pair=public.game_pairing(assigned,g);
  if jsonb_build_object('a1',sc->'a1','a2',sc->'a2','b1',sc->'b1','b2',sc->'b2') is distinct from pair then raise exception 'Game participants do not match the scheduled pairing';end if;
  sa=(sc->>'sA')::int;sb=(sc->>'sB')::int;
  if sa is null or sb is null or sa<0 or sb<0 or sa=sb or greatest(sa,sb)<>target or least(sa,sb)>=target then raise exception 'Game must finish at % with no tie',target;end if;
  if (sc->>'w') is distinct from (case when sa>sb then 'A' else 'B' end) then raise exception 'Winner flag does not match the score';end if;
  cur=jsonb_set(cur,array['scores',k],sc,true);cnt=cnt+1;
 end loop;
 if cnt=0 then raise exception 'No scores supplied';end if;
 prefix='c'||p_court||'_y'||p_cycle||'_g';
 if n=2 and cur#>>array['scores',prefix||'1','w'] is not null and (cur#>>array['scores',prefix||'1','w'])=(cur#>>array['scores',prefix||'2','w']) then
  if p_scores ? (prefix||'3') then raise exception 'Best of three: there is no Game 3 after one player wins the first two games';end if;
  cur=cur #- array['scores',prefix||'3'];
 end if;
 insert into public.undo_journal(actor,actor_email,label,snapshot) values(auth.uid(),public.my_email(),'Scores: Court '||p_court||', Round '||p_cycle,public.capture_state());
 update public.app_state set value=cur::text,version=version+1,updated_at=now() where key='current_session';
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'scores.saved','court '||p_court,jsonb_build_object('cycle',p_cycle,'games',cnt,'version',st.version+1));
 return st.version+1;
end $$;
revoke all on function public.save_court_scores(int,int,jsonb,int,text,jsonb) from public,anon,service_role;
grant execute on function public.save_court_scores(int,int,jsonb,int,text,jsonb) to authenticated;

create or replace function public.set_rsvp(p_session int,p_player bigint,p_response text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare me bigint; existing public.rsvps;
begin
 me=public.my_player_id();
 if not public.is_admin() and (me is null or p_player is distinct from me) then raise exception 'You can only answer for yourself' using errcode='42501';end if;
 if p_response is null or p_response not in ('coming','notcoming','maybe','late','need_spare') then raise exception 'Invalid response';end if;
 if not exists(select 1 from public.season_dates where session_number=p_session) then raise exception 'Invalid session';end if;
 perform pg_advisory_xact_lock(7262026);
 select * into existing from public.rsvps where session_number=p_session and player_id=p_player for update;
 -- Same answer is safe to retry even after voting closes; note edits do not reset the answer timestamp.
 if existing.response=p_response then
  if existing.note is distinct from coalesce(p_note,'') then update public.rsvps set note=coalesce(p_note,'') where session_number=p_session and player_id=p_player;end if;
  return;
 end if;
 if not public.is_admin() and exists(select 1 from public.players p where p.id=p_player and p.membership_type<>'spare')
  and exists(select 1 from public.season_dates d where d.session_number=p_session and now()>d.start_at-interval '46 hours')
 then raise exception 'Voting closed Sunday 10:00 PM. Message the admin in the group to change your answer.' using errcode='42501';end if;
 insert into public.rsvps(session_number,player_id,response,note) values(p_session,p_player,p_response,coalesce(p_note,''))
 on conflict(session_number,player_id) do update set response=excluded.response,note=excluded.note,updated_at=now();
end $$;

alter table public.payments add column if not exists request_id uuid;
create unique index if not exists payments_request_unique on public.payments(request_id) where request_id is not null;
create or replace function public.refresh_paid_flag(p_player bigint) returns void language sql security definer set search_path='' as $$
 update public.players p set paid=(case when p.membership_type='spare' then
  exists(select 1 from public.payments x where x.player_id=p.id and x.kind='spare' and x.session_number=coalesce(
    (select (nullif(value,'null')::jsonb->>'number')::int from public.app_state where key='current_session'),
    (select min(d.session_number) from public.season_dates d where d.start_at>now())) group by x.session_number having sum(x.amount)>=20)
  else coalesce((select sum(amount) from public.payments x where x.player_id=p.id and x.kind in ('season','adjustment')),0)>=400 end),updated_at=now()
 where p.id=p_player
$$;
drop function if exists public.record_payment(bigint,text,numeric,int,date,text);
create or replace function public.record_payment(p_player bigint,p_kind text,p_amount numeric,p_session int default null,p_received_on date default current_date,p_note text default '',p_request uuid default null) returns bigint language plpgsql security definer set search_path='' as $$
declare pid bigint; old public.payments;
begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 if p_request is null then raise exception 'Payment request ID required';end if;
 perform pg_advisory_xact_lock(7262026);
 select * into old from public.payments where request_id=p_request;
 if old.id is not null then
  if old.player_id is distinct from p_player or old.kind is distinct from p_kind or old.amount is distinct from p_amount or old.session_number is distinct from p_session or old.received_on is distinct from coalesce(p_received_on,current_date) or old.note is distinct from coalesce(p_note,'') then raise exception 'This request ID belongs to a different payment';end if;
  return old.id;
 end if;
 if not exists(select 1 from public.players where id=p_player) then raise exception 'Unknown player';end if;
 if p_kind is null or p_kind not in ('season','spare','refund','adjustment') or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Enter a positive amount in cents';end if;
 if p_kind in ('spare','refund') and not exists(select 1 from public.season_dates where session_number=p_session) then raise exception 'A valid session is required';end if;
 if p_kind in ('season','adjustment') and p_session is not null then raise exception 'Season payments do not have a session number';end if;
 insert into public.payments(player_id,kind,amount,session_number,received_on,note,created_by,request_id) values(p_player,p_kind,p_amount,p_session,coalesce(p_received_on,current_date),coalesce(p_note,''),auth.uid(),p_request) returning id into pid;
 perform public.refresh_paid_flag(p_player);
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'payment.recorded',p_player::text,jsonb_build_object('id',pid,'kind',p_kind,'amount',p_amount,'session',p_session));
 return pid;
end $$;
revoke all on function public.record_payment(bigint,text,numeric,int,date,text,uuid) from public,anon,service_role;
grant execute on function public.record_payment(bigint,text,numeric,int,date,text,uuid) to authenticated;

update public.environment set schema_version='L22' where true;

-- L23_recovery.sql
-- Atomic finalization and versioned operational snapshots. Immutable evidence and authentication are retained.
do $$ begin if not exists(select 1 from public.environment where name='production') then raise exception 'Refusing: this release is for the database marked production'; end if; end $$; -- PRODUCTION release (organizer-approved, 14 Sep 2026).
alter table public.players add column if not exists archived_at timestamptz;
alter table public.players add column if not exists legacy_paid boolean;
update public.players set legacy_paid=paid where legacy_paid is null;

create or replace function public.finalize_session(p_session text,p_expected int,p_finished jsonb,p_early boolean default false,p_reason text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare st public.app_state; cur jsonb; history jsonb; expected_scores jsonb; entry record; pid bigint; court int; final jsonb;
begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(7262026);
 select * into st from public.app_state where key='current_session' for update;cur=nullif(st.value,'null')::jsonb;
 if cur is null then raise exception 'No active session';end if;
 if p_session is distinct from cur->>'id' or p_expected is distinct from st.version then raise exception 'Stale state: refresh before ending the session' using errcode='40001';end if;
 if p_finished->>'id' is distinct from p_session or p_finished->>'number' is distinct from cur->>'number' then raise exception 'Session identity changed';end if;
 if p_early then
  if length(trim(coalesce(p_reason,''))) not between 3 and 300 then raise exception 'A reason for ending early is required';end if;
  if jsonb_array_length(coalesce(cur->'movements','[]'::jsonb))=0 then raise exception 'No finished rounds; discard or cancel this session instead';end if;
  select coalesce(jsonb_object_agg(k,v),'{}'::jsonb) into expected_scores from jsonb_each(cur->'scores') e(k,v)
   where substring(k from '_y([0-9]+)_')::int in (select (m->>'cycle')::int from jsonb_array_elements(cur->'movements') m);
 else
  if coalesce((cur->>'cycle')::int,0)<2 or not (coalesce((cur->>'completed')::boolean,false) or public.round_complete(cur)) then raise exception 'Finish both rounds and every court before ending the session';end if;
  expected_scores=cur->'scores';
 end if;
 if p_finished->'scores' is distinct from expected_scores then raise exception 'Scores changed while finishing; refresh and retry' using errcode='40001';end if;
 perform public.validate_lineup(p_finished->'finalAssignments');
 final=p_finished||jsonb_build_object('completed',true,'ended_at',now(),'ended_early',p_early,'end_reason',case when p_early then trim(p_reason) else '' end);
 select coalesce(nullif(value,'null')::jsonb,'[]'::jsonb) into history from public.app_state where key='completed_sessions' for update;
 history=coalesce(history,'[]'::jsonb);
 if exists(select 1 from jsonb_array_elements(history) s where s->>'id'=p_session or s->>'number'=cur->>'number') then raise exception 'This session is already in completed history';end if;
 for entry in select key,value from jsonb_each(final->'finalAssignments') loop
  court=entry.key::int;
  for pid in select (x#>>'{}')::bigint from jsonb_array_elements(entry.value) x loop
   if cur#>>array['attendance',pid::text]='absent' then continue;end if;
   update public.players set current_court=court,highest_court=least(coalesce(nullif(highest_court,0),court),court),updated_at=now() where players.id=pid;
  end loop;
 end loop;
 for entry in select key,value from jsonb_each_text(coalesce(cur->'attendance','{}'::jsonb)) where value='absent' loop
  update public.players set no_show_count=no_show_count+1,current_court=least(6,coalesce(nullif((cur#>>array['absentFrom',entry.key])::int,0),nullif(current_court,0),6)+1),updated_at=now() where players.id=entry.key::bigint;
 end loop;
 insert into public.app_state(key,value,version,updated_at) values('completed_sessions',(history||jsonb_build_array(final))::text,1,now())
 on conflict(key) do update set value=excluded.value,version=public.app_state.version+1,updated_at=now();
 delete from public.app_state where key in ('current_session','round_snapshots');
 perform public.rebuild_player_stats();
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'session.finished',p_session,jsonb_build_object('early',p_early,'reason',p_reason));
 return final;
end $$;
revoke all on function public.finalize_session(text,int,jsonb,boolean,text) from public,anon,service_role;
grant execute on function public.finalize_session(text,int,jsonb,boolean,text) to authenticated;

-- A snapshot stores operational tables. Delivery/audit logs, auth.users and provider credentials are never rewound.
create or replace function public.capture_league_snapshot(p_label text) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('format',2,'label',left(coalesce(nullif(trim(p_label),''),'League snapshot'),120),'ts',now(),
 'environment',(select name from public.environment),'tables',jsonb_build_object(
 'players',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.players t),
 'announcements',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.announcements t),
 'payments',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.payments t),
 'payments_archive',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.payments_archive t),
 'rsvps',(select coalesce(jsonb_agg(to_jsonb(t) order by session_number,player_id),'[]'::jsonb) from public.rsvps t),
 'invitations',(select coalesce(jsonb_agg(to_jsonb(t) order by email),'[]'::jsonb) from public.invitations t),
 'questions',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.questions t),
 'season_dates',(select coalesce(jsonb_agg(to_jsonb(t) order by session_number),'[]'::jsonb) from public.season_dates t),
 'past_players',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.past_players t),
 'waiver_versions',(select coalesce(jsonb_agg(to_jsonb(t) order by version),'[]'::jsonb) from public.waiver_versions t),
 'waiver_acceptances',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.waiver_acceptances t),
 'app_state',(select coalesce(jsonb_agg(to_jsonb(t) order by key),'[]'::jsonb) from public.app_state t
  where key not like 'snapshot\_%' and key not in ('pin','admin_pin','invite_code','reminder_request','reminder_last_run','vote_digest_last_id'))))
$$;
revoke all on function public.capture_league_snapshot(text) from public,anon,authenticated,service_role;

create or replace function public.save_league_snapshot(p_label text default 'League snapshot') returns text language plpgsql security definer set search_path='' as $$
declare key text='snapshot_'||gen_random_uuid()::text; data jsonb;
begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(7262026);
 data=public.capture_league_snapshot(p_label);
 insert into public.app_state(key,value,version) values(key,data::text,1);
 insert into public.audit_log(actor,action,subject) values(auth.uid(),'snapshot.created',key);
 return key;
end $$;
revoke all on function public.save_league_snapshot(text) from public,anon,service_role;
grant execute on function public.save_league_snapshot(text) to authenticated;

create or replace function public.list_league_snapshots() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'format',coalesce((d->>'format')::int,1),'label',d->>'label','ts',d->>'ts',
  'player_count',jsonb_array_length(coalesce(d#>'{tables,players}',d->'players','[]'::jsonb)),
  'completed_count',coalesce((select jsonb_array_length(nullif(x->>'value','null')::jsonb) from jsonb_array_elements(coalesce(d#>'{tables,app_state}','[]'::jsonb)) x where x->>'key'='completed_sessions'),0),
  'active_session',exists(select 1 from jsonb_array_elements(coalesce(d#>'{tables,app_state}','[]'::jsonb)) x where x->>'key'='current_session' and x->>'value'<>'null')) order by d->>'ts' desc),'[]'::jsonb)
 into result from (select key,value::jsonb d from public.app_state where key like 'snapshot\_%') s where coalesce((d->>'_deleted')::boolean,false)=false;
 return result;
end $$;
revoke all on function public.list_league_snapshots() from public,anon,service_role;
grant execute on function public.list_league_snapshots() to authenticated;

-- Identifier/table choices are fixed by the caller; this helper is never executable by API roles.
create or replace function public.restore_snapshot_table(t text,data jsonb,pk text,mode text default 'replace') returns void language plpgsql security definer set search_path='' as $$
declare cols text; updates text; identity boolean; seq text; maximum bigint;
begin
 if t not in ('players','announcements','payments','payments_archive','rsvps','invitations','questions','season_dates','past_players','waiver_versions','waiver_acceptances') then raise exception 'Unsupported snapshot table';end if;
 if jsonb_typeof(data) is distinct from 'array' then raise exception 'Snapshot is missing table %',t;end if;
 select string_agg(quote_ident(a.attname),',' order by a.attnum),string_agg(format('%I=excluded.%I',a.attname,a.attname),',' order by a.attnum) filter(where a.attname<>all(string_to_array(pk,','))),bool_or(a.attidentity<>'')
 into cols,updates,identity from pg_attribute a where a.attrelid=('public.'||t)::regclass and a.attnum>0 and not a.attisdropped and a.attgenerated='';
 if mode='replace' then execute format('delete from public.%I where true',t);end if;
 execute format('insert into public.%I(%s) %s select %s from jsonb_populate_recordset(null::public.%I,$1) on conflict(%s) do %s',
  t,cols,case when identity then 'overriding system value' else '' end,cols,t,pk,case when mode='keep' then 'nothing' else 'update set '||updates end) using data;
 if identity then
  seq=pg_get_serial_sequence('public.'||t,'id');execute format('select max(id) from public.%I',t) into maximum;
  if maximum is not null then perform setval(seq::regclass,maximum,true);end if;
 end if;
end $$;
revoke all on function public.restore_snapshot_table(text,jsonb,text,text) from public,anon,authenticated,service_role;

create or replace function public.restore_league_snapshot(p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare snap jsonb; before_key text; t text; data jsonb; st jsonb; row jsonb; versions jsonb; wanted_version text;
begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(7262026);
 lock table public.players,public.announcements,public.payments,public.payments_archive,public.rsvps,public.invitations,public.questions,public.season_dates,public.past_players,public.waiver_versions,public.waiver_acceptances,public.app_state in share row exclusive mode;
 select value::jsonb into snap from public.app_state where key=p_key and key like 'snapshot\_%';
 if snap is null or snap->>'format'<>'2' then raise exception 'This is an incomplete legacy snapshot; only format 2 league snapshots can be restored';end if;
 if snap->>'environment' is distinct from (select name from public.environment) then raise exception 'Snapshot belongs to a different environment';end if;
 foreach t in array array['players','announcements','payments','payments_archive','rsvps','invitations','questions','season_dates','past_players','waiver_versions','waiver_acceptances','app_state'] loop
  if jsonb_typeof(snap#>array['tables',t]) is distinct from 'array' then raise exception 'Snapshot is missing table %',t;end if;
 end loop;
 perform set_config('dcbc.restoring','true',true);
 before_key=public.save_league_snapshot('Before restoring '||coalesce(snap->>'label',p_key));
 -- Keep post-snapshot player identities and evidence, but remove them from active league views.
 update public.players set archived_at=now(),approved=false,current_court=0,waitlisted=false
 where id not in (select (p->>'id')::bigint from jsonb_array_elements(snap#>'{tables,players}') p);
 perform public.restore_snapshot_table('players',snap#>'{tables,players}','id','upsert');
 foreach t in array array['announcements','payments','rsvps','invitations','questions','season_dates','past_players'] loop
  perform public.restore_snapshot_table(t,snap#>array['tables',t],case t when 'rsvps' then 'session_number,player_id' when 'invitations' then 'email' when 'season_dates' then 'session_number' else 'id' end);
 end loop;
 -- History is append-only: restoring an old snapshot never erases newer archives or acceptance evidence.
 perform public.restore_snapshot_table('payments_archive',snap#>'{tables,payments_archive}','id','keep');
 versions=snap#>'{tables,waiver_versions}';
 select x->>'version' into wanted_version from jsonb_array_elements(versions) x where (x->>'is_current')::boolean;
 select jsonb_agg(x||jsonb_build_object('is_current',false)) into versions from jsonb_array_elements(versions) x;
 perform public.restore_snapshot_table('waiver_versions',coalesce(versions,'[]'::jsonb),'version','keep');
 if wanted_version is not null then update public.waiver_versions set is_current=false where is_current;update public.waiver_versions set is_current=true where version=wanted_version;end if;
 perform public.restore_snapshot_table('waiver_acceptances',snap#>'{tables,waiver_acceptances}','id','keep');
 delete from public.app_state where key not like 'snapshot\_%' and key not like 'archive\_%' and key not in ('reminder_request','reminder_last_run','vote_digest_last_id','pin','admin_pin','invite_code');
 for row in select * from jsonb_array_elements(snap#>'{tables,app_state}') loop
  if row->>'key' in ('pin','admin_pin','invite_code') or row->>'key' like 'snapshot\_%' then raise exception 'Invalid key in snapshot';end if;
  insert into public.app_state(key,value,version,updated_at) values(row->>'key',row->>'value',coalesce((row->>'version')::int,0)+1,now())
  on conflict(key) do update set value=excluded.value,version=greatest(public.app_state.version,excluded.version)+1,updated_at=now();
 end loop;
 delete from public.undo_journal where true;
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'snapshot.restored',p_key,jsonb_build_object('before_snapshot',before_key));
 perform set_config('dcbc.restoring','false',true);
 return jsonb_build_object('restored',p_key,'before_snapshot',before_key);
end $$;
revoke all on function public.restore_league_snapshot(text) from public,anon,service_role;
grant execute on function public.restore_league_snapshot(text) to authenticated;

create or replace function public.archive_player(p_player bigint) returns void language plpgsql security definer set search_path='' as $$
declare cur jsonb;
begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(7262026);
 select nullif(value,'null')::jsonb into cur from public.app_state where key='current_session' for update;
 if exists(select 1 from jsonb_each(coalesce(cur->'assignments','{}'::jsonb)) c where c.value @> jsonb_build_array(p_player)) then raise exception 'Remove the player from tonight with Adjust courts before archiving';end if;
 update public.players set archived_at=now(),approved=false,current_court=0,waitlisted=false where id=p_player;
 insert into public.audit_log(actor,action,subject) values(auth.uid(),'player.archived',p_player::text);
end $$;
revoke all on function public.archive_player(bigint) from public,anon,service_role;
grant execute on function public.archive_player(bigint) to authenticated;

create or replace view public.players_public with (security_barrier=true) as
 select id,name,paid,current_court,highest_court,season_wins,season_losses,games_played,no_show_count,membership_type,approved,waitlisted,registered_at,created_at,
 exists(select 1 from public.waiver_acceptances a join public.waiver_versions v on v.version=a.waiver_version and v.is_current
  where a.player_id=p.id or (p.user_id is not null and a.user_id=p.user_id)) as waiver_ok,(user_id is not null) as has_account
 from public.players p where archived_at is null;

update public.environment set schema_version='L23' where true;

-- L24_season_operations.sql
-- Shared season configuration, recorded cancellations and reserved/paid spare seats.
do $$ begin if not exists(select 1 from public.environment where name='production') then raise exception 'Refusing: this release is for the database marked production'; end if; end $$; -- PRODUCTION release (organizer-approved, 14 Sep 2026).
alter table public.season_dates add column if not exists cancelled boolean not null default false;
alter table public.season_dates add column if not exists cancellation_reason text not null default '';
insert into public.app_state(key,value,version) values('season_config','{"season": "2026-27", "start_time_local": "20:00", "time_zone": "America/Toronto", "approved_dates": ["2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27", "2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24", "2026-12-15", "2027-01-05", "2027-01-19", "2027-01-26", "2027-02-02", "2027-02-09", "2027-02-16", "2027-02-23", "2027-03-02", "2027-03-09", "2027-03-23", "2027-03-30", "2027-04-13", "2027-04-20", "2027-05-04", "2027-05-11", "2027-05-18"], "cancelled_dates": ["2026-12-01", "2026-12-08", "2027-01-12", "2027-04-06", "2027-04-27", "2027-05-25"], "fees": {"regular_season": 400, "spare_session": 20, "absence_refund": 14, "absence_notice_hours": 72, "vote_deadline_hours": 46, "spare_ask_hours": 72}, "registration_start": "2026-09-01", "regular_capacity": 27, "end_time_local": "22:00"}',1) on conflict(key) do nothing;
create or replace function public.season_setting(k text,fallback numeric) returns numeric language sql stable security definer set search_path='' as $$
 select coalesce((select coalesce(value::jsonb->>k,value::jsonb#>>array['fees',k])::numeric from public.app_state where key='season_config'),fallback)
$$;
revoke all on function public.season_setting(text,numeric) from public,anon,authenticated,service_role;
create or replace function public.rollover_season_internal(p_label text) returns jsonb language plpgsql security definer set search_path='' as $$ declare archive jsonb; sessions text; cur text; n int; np int;begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 if p_label is null or length(trim(p_label)) not between 3 and 40 or exists(select 1 from public.app_state where key='archive_'||trim(p_label)) then raise exception 'Unique archive label required';end if;
 select value into sessions from public.app_state where key='completed_sessions';
 select value into cur from public.app_state where key='current_session';
 if cur is not null and cur<>'null' then raise exception 'End the active session before starting a new season';end if;
 archive=jsonb_build_object('label',trim(p_label),'archived_at',now(),'completed_sessions',coalesce(sessions,'[]')::jsonb,
  'players',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'current_court',current_court,'highest_court',highest_court,'season_wins',season_wins,'season_losses',season_losses,'games_played',games_played,'no_show_count',no_show_count,'membership_type',membership_type,'registered_at',registered_at) order by id),'[]'::jsonb) from public.players),
  'state',(select coalesce(jsonb_object_agg(key,value::jsonb),'{}'::jsonb) from public.app_state where key in ('player_approvals','membership_overrides','pre_session_attendance','round_snapshots') or key like 'votes_session_%' or key like 'rsvp_session_%'));
 insert into public.app_state(key,value,version,updated_at) values('archive_'||trim(p_label),archive::text,1,now());
 delete from public.app_state where key in ('completed_sessions','player_approvals','membership_overrides','pre_session_attendance','round_snapshots') or key like 'votes_session_%' or key like 'rsvp_session_%';
 insert into public.payments_archive(id,season_label,player_id,player_name,kind,amount,session_number,method,received_on,note,created_by,created_at)
  select x.id,trim(p_label),x.player_id,p.name,x.kind,x.amount,x.session_number,x.method,x.received_on,x.note,x.created_by,x.created_at
  from public.payments x left join public.players p on p.id=x.player_id on conflict(id) do nothing;
 delete from public.payments where true;
 get diagnostics np=row_count;
 delete from public.reminder_log where true;
 delete from public.rsvps where true;
 update public.players set season_wins=0,season_losses=0,games_played=0,no_show_count=0,paid=false,approved=false,waitlisted=false,registered_at=null,updated_at=now() where true;
 get diagnostics n=row_count;
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'season.started',trim(p_label),jsonb_build_object('players_reset',n,'payments_archived',np));
 return jsonb_build_object('archived',trim(p_label),'players_reset',n,'payments_archived',np);
end $$;
revoke all on function public.rollover_season_internal(text) from public,anon,authenticated,service_role;
drop function if exists public.start_new_season(text);
create or replace function public.start_new_season(p_label text,p_config jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d text; prev date; n int=0; result jsonb; backup text; zone text; start_time time;
begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(7262026);
 if p_label is null or length(trim(p_label)) not between 3 and 40 or exists(select 1 from public.app_state where key='archive_'||trim(p_label)) then raise exception 'Unique archive label required';end if;
 if length(trim(coalesce(p_config->>'season','')))<3 or p_config->>'season'=(select value::jsonb->>'season' from public.app_state where key='season_config') then raise exception 'Choose a new season label';end if;
 if jsonb_typeof(p_config->'approved_dates') is distinct from 'array' or jsonb_array_length(p_config->'approved_dates') not between 1 and 100 then raise exception 'Enter 1 to 100 approved dates';end if;
 zone=p_config->>'time_zone';
 if not exists(select 1 from pg_timezone_names where name=zone) then raise exception 'Choose a valid league time zone';end if;
 start_time=(p_config->>'start_time_local')::time;
 if start_time is null or (p_config->>'end_time_local')::time is null or (p_config->>'end_time_local')::time<=start_time then raise exception 'Session end must be after its start';end if;
 if (p_config->>'registration_start')::date is null or coalesce((p_config->>'regular_capacity')::int,0) not between 2 and 30 then raise exception 'Enter registration date and capacity from 2 to 30';end if;
 foreach d in array array['regular_season','spare_session','absence_refund','absence_notice_hours','vote_deadline_hours','spare_ask_hours'] loop
  if coalesce((p_config#>>array['fees',d])::numeric,-1)<0 or (p_config#>>array['fees',d])::numeric>10000 then raise exception 'Invalid fee or timing: %',d;end if;
  if d in ('regular_season','spare_session','absence_refund') and (p_config#>>array['fees',d])::numeric<>round((p_config#>>array['fees',d])::numeric,2) then raise exception 'Fees must use whole cents';end if;
 end loop;
 for d in select jsonb_array_elements_text(p_config->'approved_dates') loop
  if d!~ '^\d{4}-\d{2}-\d{2}$' or d::date<(p_config->>'registration_start')::date or prev is not null and d::date<=prev then raise exception 'Dates must be valid, unique and in ascending order after registration opens';end if;
  prev=d::date;
 end loop;
 if p_config ? 'cancelled_dates' then
  if jsonb_typeof(p_config->'cancelled_dates') is distinct from 'array' or jsonb_array_length(p_config->'cancelled_dates')>100 then raise exception 'Enter a list of no-play dates';end if;
  for d in select jsonb_array_elements_text(p_config->'cancelled_dates') loop
   if d is null or d!~ '^\d{4}-\d{2}-\d{2}$' or d::date<(p_config->>'registration_start')::date or p_config->'approved_dates' ? d then raise exception 'No-play dates must be valid and separate from approved play dates';end if;
  end loop;
  if (select count(*)<>count(distinct x) from jsonb_array_elements_text(p_config->'cancelled_dates') x) then raise exception 'No-play dates must be unique';end if;
 end if;
 backup=public.save_league_snapshot('Before season rollover: '||p_label);
 result=public.rollover_season_internal(p_label);
 delete from public.season_dates where true;
 for d in select jsonb_array_elements_text(p_config->'approved_dates') loop
  n=n+1;insert into public.season_dates(session_number,play_on,start_at) values(n,d::date,(d::date+start_time) at time zone zone);
 end loop;
 insert into public.app_state(key,value,version) values('season_config',p_config::text,1) on conflict(key) do update set value=excluded.value,version=public.app_state.version+1;
 delete from public.app_state where key in ('reminder_request','reminder_last_run');
 insert into public.app_state(key,value,version) values('vote_digest_last_id',(select coalesce(max(id),0)::text from public.rsvp_log),1) on conflict(key) do update set value=excluded.value,version=public.app_state.version+1;
 delete from public.undo_journal where true;
 return result||jsonb_build_object('season',p_config->>'season','sessions',n,'before_snapshot',backup);
end $$;
revoke all on function public.start_new_season(text,jsonb) from public,anon,service_role;
grant execute on function public.start_new_season(text,jsonb) to authenticated;

create or replace function public.cancel_league_session(p_session int,p_expected int,p_reason text,p_resolution text,p_amount numeric default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare st public.app_state; cur jsonb; history jsonb; finished jsonb; d public.season_dates; obligations jsonb;
begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(7262026);
 select * into d from public.season_dates where session_number=p_session for update;
 if d.session_number is null or d.cancelled then raise exception 'Session is missing or already cancelled';end if;
 if length(trim(coalesce(p_reason,''))) not between 3 and 300 or p_resolution is null or p_resolution not in ('shuttles','refund','makeup','none') or p_amount is null or p_amount<0 or p_amount>10000 or p_amount<>round(p_amount,2) then raise exception 'Enter a reason and valid compensation plan';end if;
 select * into st from public.app_state where key='current_session' for update;cur=nullif(st.value,'null')::jsonb;
 if coalesce(st.version,0) is distinct from p_expected or cur is not null and (cur->>'number')::int<>p_session then raise exception 'Session changed; refresh first' using errcode='40001';end if;
 select coalesce(nullif(value,'null')::jsonb,'[]'::jsonb) into history from public.app_state where key='completed_sessions' for update;history=coalesce(history,'[]'::jsonb);
 if exists(select 1 from jsonb_array_elements(history) s where (s->>'number')::int=p_session) then raise exception 'Session already has a result';end if;
 select coalesce(jsonb_agg(jsonb_build_object('player_id',p.id,'amount',case when p.membership_type='spare' then coalesce((select sum(amount) from public.payments where player_id=p.id and kind='spare' and session_number=p_session),0) when p_resolution='shuttles' then 2 else p_amount end,'unit',case when p.membership_type='spare' or p_resolution='refund' then 'CAD' when p_resolution='shuttles' then 'shuttles' else 'plan' end,'resolution',p_resolution,'status',case when p_resolution='none' then 'fulfilled' else 'pending' end)),'[]'::jsonb) into obligations
 from public.players p where p.archived_at is null and p.approved and not p.waitlisted and (p.membership_type<>'spare' or exists(select 1 from public.payments where player_id=p.id and kind='spare' and session_number=p_session));
 perform public.save_league_snapshot('Before cancelling session '||p_session);
 delete from public.undo_journal where true;
 finished=jsonb_build_object('id',coalesce(cur->>'id','cancelled-'||p_session),'number',p_session,'date',d.play_on,'status','cancelled','completed',true,'reason',trim(p_reason),'cancelled_at',now(),'resolution',p_resolution,'compensation',obligations,'scores','{}'::jsonb,'assignments','{}'::jsonb,'movements','[]'::jsonb);
 update public.season_dates set cancelled=true,cancellation_reason=trim(p_reason) where session_number=p_session;
 insert into public.app_state(key,value,version) values('completed_sessions',(history||jsonb_build_array(finished))::text,1) on conflict(key) do update set value=excluded.value,version=public.app_state.version+1;
 if cur is not null then delete from public.app_state where key in ('current_session','round_snapshots');end if;
 perform public.rebuild_player_stats();
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'session.cancelled',p_session::text,finished);
 return finished;
end $$;
revoke all on function public.cancel_league_session(int,int,text,text,numeric) from public,anon,service_role;
grant execute on function public.cancel_league_session(int,int,text,text,numeric) to authenticated;
create or replace function public.settle_cancellation(p_session int,p_player bigint) returns void language plpgsql security definer set search_path='' as $$
declare st public.app_state; history jsonb; sess jsonb; item jsonb; idx int; ci int; paid numeric; req uuid;
begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(7262026);
 select * into st from public.app_state where key='completed_sessions' for update;history=st.value::jsonb;
 select value,ordinality::int-1 into sess,idx from jsonb_array_elements(history) with ordinality where (value->>'number')::int=p_session and value->>'status'='cancelled';
 select value,ordinality::int-1 into item,ci from jsonb_array_elements(sess->'compensation') with ordinality where (value->>'player_id')::bigint=p_player;
 if item is null then raise exception 'No compensation record';end if;
 if item->>'status'='fulfilled' then return;end if;
 if item->>'unit'='CAD' then
  select coalesce(sum(amount),0) into paid from public.payments where kind='refund' and session_number=p_session and player_id=p_player;
  if (item->>'amount')::numeric>paid then
   req=gen_random_uuid();perform public.record_payment(p_player,'refund',(item->>'amount')::numeric-paid,p_session,current_date,'Cancellation compensation',req);
  end if;
 end if;
 history=jsonb_set(history,array[idx::text,'compensation',ci::text],item||jsonb_build_object('status','fulfilled','fulfilled_at',now()));
 update public.app_state set value=history::text,version=version+1 where key='completed_sessions';
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'cancellation.fulfilled',p_session::text,item);
end $$;
revoke all on function public.settle_cancellation(int,bigint) from public,anon,service_role;
grant execute on function public.settle_cancellation(int,bigint) to authenticated;

create or replace function public.refresh_paid_flag(p_player bigint) returns void language sql security definer set search_path='' as $$
 update public.players p set paid=(case when p.membership_type='spare' then
  exists(select 1 from public.payments x where x.player_id=p.id and x.kind='spare' and x.session_number=coalesce(
    (select (nullif(value,'null')::jsonb->>'number')::int from public.app_state where key='current_session'),
    (select min(d.session_number) from public.season_dates d where not d.cancelled and not exists(select 1 from public.app_state s cross join lateral jsonb_array_elements(nullif(s.value,'null')::jsonb) e where s.key='completed_sessions' and (e->>'number')::int=d.session_number))) group by x.session_number having sum(x.amount)>=public.season_setting('spare_session',20))
  else coalesce((select sum(amount) from public.payments x where x.player_id=p.id and x.kind in ('season','adjustment')),0)>=public.season_setting('regular_season',400) end),updated_at=now()
 where p.id=p_player
$$;
create or replace function public.spare_seat_status(p_session int) returns table(player_id bigint,rank int,reserved boolean,paid boolean,confirmed boolean,open_seats int) language sql stable security definer set search_path='' as $$
 with declined as (select count(*)::int n from public.rsvps r join public.players p on p.id=r.player_id where r.session_number=p_session and r.response='notcoming' and p.approved and not p.waitlisted and p.archived_at is null and p.membership_type<>'spare'),
 claims as (select r.player_id,row_number() over(order by r.updated_at,r.player_id)::int rk,coalesce((select sum(amount) from public.payments x where x.player_id=p.id and x.kind='spare' and x.session_number=p_session),0)>=public.season_setting('spare_session',20) pd from public.rsvps r join public.players p on p.id=r.player_id where r.session_number=p_session and r.response='coming' and p.approved and not p.waitlisted and p.archived_at is null and p.membership_type='spare')
 select c.player_id,c.rk,c.rk<=d.n,c.pd,c.rk<=d.n and c.pd,greatest(d.n-(select count(*)::int from claims),0) from claims c cross join declined d
$$;
revoke all on function public.spare_seat_status(int) from public,anon;
grant execute on function public.spare_seat_status(int) to authenticated,service_role;
create or replace function public.spare_seats(p_session int) returns table(player_id bigint,rank int,confirmed boolean,open_seats int) language sql stable security definer set search_path='' as $$
 select player_id,rank,confirmed,open_seats from public.spare_seat_status(p_session)
$$;
-- Reservation messages are distinct from initial availability invitations, deduplicated in reminder_log by the worker.
create or replace function public.spare_reservation_targets(p_session int) returns table(player_id bigint,name text,email text,membership_type text,kind text,open_seats int) language sql stable security definer set search_path='' as $$
 select p.id,p.name,lower(p.email),p.membership_type,case when s.confirmed then 'spare-confirmed' else 'spare-reserved' end,s.open_seats from public.spare_seat_status(p_session) s join public.players p on p.id=s.player_id where s.reserved and p.email_reminders and position('@' in p.email)>1
$$;
revoke all on function public.spare_reservation_targets(int) from public,anon,authenticated;
grant execute on function public.spare_reservation_targets(int) to service_role;
create or replace function public.set_state(k text,v text,expected int) returns int language plpgsql security definer set search_path='' as $$
declare st public.app_state; data jsonb; old jsonb; c text; item record; prior_regular int; capacity int=public.season_setting('regular_capacity',26);
begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 if k is null or length(k) not between 1 and 120 or v is null or k like 'snapshot\_%' and length(v)>4000000 then raise exception 'Invalid state write';end if;
 if k in ('admin_pin','pin','invite_code','season_config') then raise exception 'Retired key';end if;
 perform pg_advisory_xact_lock(7262026);
 select count(*) into prior_regular from public.players where archived_at is null and approved and not waitlisted and membership_type='regular';
 select * into st from public.app_state where key=k for update;
 if st.key is null and coalesce(expected,0)<>0 or st.key is not null and expected is distinct from st.version then raise exception 'Stale state: refresh before saving' using errcode='40001';end if;
 data=v::jsonb;old=st.value::jsonb;
 if k='current_session' and data<>'null'::jsonb then
  perform public.validate_lineup(data->'assignments');
  if data->>'id' is null or data->>'number' is null or coalesce((data->>'cycle')::int,0)<1 then raise exception 'Invalid session identity';end if;
  if coalesce((data->>'completed')::boolean,false) and not coalesce((old->>'completed')::boolean,false) and not public.round_complete(old) then raise exception 'Finish every court before completing a round';end if;
  if old is not null and old<>'null'::jsonb and data->>'id'=old->>'id' then
   if data->>'cycle'=old->>'cycle' and not (coalesce((data->>'completed')::boolean,false) and public.round_complete(old)) then
    for c in select generate_series(1,6)::text loop
     if data#>array['assignments',c] is distinct from old#>array['assignments',c]
        and exists(select 1 from jsonb_object_keys(coalesce(old->'scores','{}'::jsonb)) x where x like 'c'||c||'_y'||(old->>'cycle')||'_g%')
     then raise exception 'Court % already has scores; undo the round before changing its lineup',c;end if;
    end loop;
   elsif data->>'cycle' is distinct from old->>'cycle' and not public.round_complete(old) then raise exception 'Finish every court before advancing';end if;
  end if;
 end if;
 -- Keep the compatibility JSON and authoritative columns in the same transaction.
 if k='player_approvals' then
  if jsonb_typeof(data)<>'object' then raise exception 'Invalid approvals';end if;
  for item in select key,value from jsonb_each(data) loop
   update public.players p set approved=coalesce((item.value->>'approved')::boolean,p.approved),
    waitlisted=coalesce((item.value->>'waitlisted')::boolean,p.waitlisted),
    membership_type=coalesce(item.value->>'membershipType',p.membership_type),updated_at=now() where p.id=item.key::bigint;
  end loop;
 elsif k='membership_overrides' then
  for item in select key,value from jsonb_each_text(data) loop
   if item.value not in ('regular','spare') then raise exception 'Invalid membership type';end if;
   update public.players set membership_type=item.value,updated_at=now() where id=item.key::bigint;
  end loop;
 end if;
 if k in ('player_approvals','membership_overrides') then
  if exists(select 1 from public.players where membership_type not in ('regular','spare')) then raise exception 'Invalid membership type';end if;
  if (select count(*) from public.players where archived_at is null and approved and not waitlisted and membership_type='regular')>greatest(capacity,prior_regular) then raise exception 'Regular places are full; keep the player on the waitlist';end if;
 end if;
 insert into public.app_state(key,value,version,updated_at) values(k,v,coalesce(st.version,0)+1,now())
 on conflict(key) do update set value=excluded.value,version=excluded.version,updated_at=excluded.updated_at;
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'state.set',k,jsonb_build_object('version',coalesce(st.version,0)+1));
 return coalesce(st.version,0)+1;
end $$;
-- Refresh compatibility flags whenever the relevant ledger/session/type changes.
create or replace function public.refresh_all_paid_flags() returns trigger language plpgsql security definer set search_path='' as $$
declare pid bigint;
begin
 if TG_TABLE_NAME='app_state' then
  if coalesce(NEW.key,OLD.key) not in ('current_session','completed_sessions','season_config') then return null;end if;
 end if;
 for pid in select id from public.players loop perform public.refresh_paid_flag(pid);end loop;
 return null;
end $$;
revoke all on function public.refresh_all_paid_flags() from public,anon,authenticated,service_role;
drop trigger if exists refresh_session_paid on public.app_state;
create trigger refresh_session_paid after insert or update or delete on public.app_state for each row execute function public.refresh_all_paid_flags();
drop trigger if exists refresh_membership_paid on public.players;
create trigger refresh_membership_paid after update of membership_type on public.players for each statement execute function public.refresh_all_paid_flags();
do $$ declare pid bigint;begin for pid in select id from public.players loop perform public.refresh_paid_flag(pid);end loop;end $$;
create or replace function public.log_rsvp_change() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if current_setting('dcbc.restoring',true)='true' and public.is_admin() then return new;end if;
 if tg_op='UPDATE' and old.response=new.response then return new; end if;
 insert into public.rsvp_log(session_number,player_id,old_response,new_response,changed_by,by_admin)
 values(new.session_number,new.player_id,case when tg_op='UPDATE' then old.response end,new.response,auth.uid(),coalesce(auth.jwt()->>'aal','')='aal2' and exists(select 1 from public.app_admins a where a.user_id=auth.uid()));
 return new;
end $$;
create or replace function public.add_league_player(p_name text,p_court int,p_membership text) returns bigint language plpgsql security definer set search_path='' as $$
declare pid bigint;
begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(7262026);
 if exists(select 1 from public.app_state where key='current_session' and value<>'null') then p_court=0;end if;
 if length(trim(coalesce(p_name,''))) not between 2 and 80 or p_court is null or p_court not between 0 and 6 or p_membership is null or p_membership not in ('regular','spare') then raise exception 'Invalid name, court or membership';end if;
 if exists(select 1 from public.players where archived_at is null and lower(name)=lower(trim(p_name))) then raise exception 'Player is already on file';end if;
 if p_membership='regular' and (select count(*) from public.players where archived_at is null and approved and not waitlisted and membership_type='regular')>=public.season_setting('regular_capacity',26) then raise exception 'Regular places are full';end if;
 insert into public.players(name,email,sig,waiver_signed,paid,current_court,highest_court,membership_type,approved,waitlisted) values(trim(p_name),'','admin',false,false,p_court,p_court,p_membership,true,false) returning id into pid;
 insert into public.audit_log(actor,action,subject) values(auth.uid(),'player.added',pid::text);return pid;
end $$;
revoke all on function public.add_league_player(text,int,text) from public,anon,service_role;
grant execute on function public.add_league_player(text,int,text) to authenticated;
create or replace function public.start_league_session(p_session jsonb) returns int language plpgsql security definer set search_path='' as $$
declare n int=(p_session->>'number')::int; v int;c record;pid bigint;
begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(7262026);
 if exists(select 1 from public.app_state where key='current_session' and value<>'null') then raise exception 'Session already active';end if;
 if not exists(select 1 from public.season_dates where session_number=n and not cancelled) or exists(select 1 from public.app_state s cross join lateral jsonb_array_elements(nullif(s.value,'null')::jsonb) x where s.key='completed_sessions' and (x->>'number')::int=n) then raise exception 'Choose an unplayed, scheduled session';end if;
 if coalesce((p_session->>'cycle')::int,0)<>1 or coalesce((p_session->>'completed')::boolean,false) or coalesce(p_session->'scores','{}')<>'{}'::jsonb then raise exception 'A new session begins in round one without scores';end if;
 perform public.validate_lineup(p_session->'assignments');
 for c in select key,value from jsonb_each(p_session->'assignments') loop
  for pid in select (x#>>'{}')::bigint from jsonb_array_elements(c.value) x loop
   if not exists(select 1 from public.players where id=pid and approved and not waitlisted and archived_at is null) then raise exception 'Only approved players can start';end if;
   update public.players set current_court=c.key::int,highest_court=coalesce(nullif(highest_court,0),c.key::int) where id=pid and membership_type='spare';
  end loop;
 end loop;
 delete from public.app_state where key='current_session' and value='null';
 v=public.set_state('current_session',p_session::text,0);
 delete from public.app_state where key='pre_session_attendance';return v;
end $$;
revoke all on function public.start_league_session(jsonb) from public,anon,service_role;
grant execute on function public.start_league_session(jsonb) to authenticated;
create or replace function public.set_rsvp(p_session int,p_player bigint,p_response text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare me bigint; existing public.rsvps;
begin
 me=public.my_player_id();
 if not public.is_admin() and (me is null or p_player is distinct from me) then raise exception 'You can only answer for yourself' using errcode='42501';end if;
 if p_response is null or p_response not in ('coming','notcoming','maybe','late','need_spare') then raise exception 'Invalid response';end if;
 if not exists(select 1 from public.season_dates where session_number=p_session and not cancelled) then raise exception 'Invalid or cancelled session';end if;
 perform pg_advisory_xact_lock(7262026);
 select * into existing from public.rsvps where session_number=p_session and player_id=p_player for update;
 -- Same answer is safe to retry even after voting closes; note edits do not reset the answer timestamp.
 if existing.response=p_response then
  if existing.note is distinct from coalesce(p_note,'') then update public.rsvps set note=coalesce(p_note,'') where session_number=p_session and player_id=p_player;end if;
  return;
 end if;
 if not public.is_admin() and exists(select 1 from public.players p where p.id=p_player and p.membership_type<>'spare')
  and exists(select 1 from public.season_dates d where d.session_number=p_session and now()>d.start_at-public.season_setting('vote_deadline_hours',46)*interval '1 hour')
 then raise exception 'Voting closed for this session. Message the admin in the group to change your answer.' using errcode='42501';end if;
 insert into public.rsvps(session_number,player_id,response,note) values(p_session,p_player,p_response,coalesce(p_note,''))
 on conflict(session_number,player_id) do update set response=excluded.response,note=excluded.note,updated_at=now();
end $$;
-- A returning archived identity signs its own current waiver; evidence stays attached to the same ID.
create or replace function public.register_me(p_name text,p_phone text,p_emergency text,p_medical text,p_sig text,p_membership text,p_payment text default '',
  p_waiver_version text default '',p_waiver_sha text default '',p_waiver_sig text default '',p_tz text default '',p_offset int default null,p_age text default 'adult',p_minor text default '',p_media boolean default null,p_ua text default '')
returns bigint language plpgsql security definer set search_path='' as $$ declare em text; inv public.invitations; existing public.players; pid bigint; pay text; begin
 select lower(trim(email)) into em from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if em is null then raise exception 'Verified sign-in email required' using errcode='42501';end if;
 select * into inv from public.invitations where email=em;
 select * into existing from public.players where user_id=auth.uid() or (user_id is null and lower(email)=em) order by user_id is not null desc limit 1;
 if (existing.id is null or existing.archived_at is not null) and inv.email is null and not public.is_admin_any_factor() then raise exception 'Registration is closed. This link is for players Christy has confirmed; contact the organizer if you were accepted.' using errcode='42501';end if;
 if p_name is null or length(trim(p_name)) not between 2 and 80 or coalesce(length(p_phone),0)>40 or coalesce(length(p_emergency),0)>200 or coalesce(length(p_medical),0)>500 or coalesce(length(p_sig),0)>200000 then raise exception 'Invalid registration details';end if;
 pay=case when p_payment in ('paid_full','will_pay','per_session') then p_payment else '' end;
 if existing.id is null then
  insert into public.players(name,email,phone,emergency,medical,sig,waiver_signed,paid,current_court,highest_court,season_wins,season_losses,games_played,membership_type,approved,waitlisted,registered_at,user_id,declared_payment)
  values(trim(p_name),em,coalesce(p_phone,''),coalesce(p_emergency,''),coalesce(p_medical,''),coalesce(p_sig,''),p_sig is not null and p_sig<>'',false,0,0,0,0,0,coalesce(inv.membership_type,p_membership,'regular'),false,false,now(),auth.uid(),pay) returning id into pid;
 else
  update public.players set archived_at=null,approved=case when archived_at is not null then false else approved end,waitlisted=case when archived_at is not null then false else waitlisted end,name=trim(p_name),phone=coalesce(p_phone,phone),emergency=coalesce(p_emergency,emergency),medical=coalesce(p_medical,medical),sig=case when p_sig is not null and p_sig<>'' then p_sig else sig end,waiver_signed=(p_sig is not null and p_sig<>'') or waiver_signed,membership_type=coalesce(inv.membership_type,membership_type),registered_at=now(),user_id=auth.uid(),declared_payment=case when pay<>'' then pay else declared_payment end,updated_at=now() where id=existing.id returning id into pid;
 end if;
 perform public.record_waiver_acceptance(pid,em,p_name,p_waiver_version,p_waiver_sha,p_waiver_sig,p_tz,p_offset,'registration',p_age,p_minor,p_media,p_ua);
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'player.registered',pid::text,jsonb_build_object('payment',pay,'waiver',p_waiver_version));
 return pid;
end $$;
revoke all on function public.register_me(text,text,text,text,text,text,text,text,text,text,text,int,text,text,boolean,text) from public,anon;
grant execute on function public.register_me(text,text,text,text,text,text,text,text,text,text,text,int,text,text,boolean,text) to authenticated;

create or replace function public.capture_state() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'app_state',(select coalesce(jsonb_object_agg(key,to_jsonb(value)),'{}'::jsonb) from public.app_state
               where key in ('current_session','completed_sessions','player_approvals','membership_overrides','pre_session_attendance')),
  'players',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'current_court',current_court,'highest_court',highest_court,'no_show_count',no_show_count,
               'approved',approved,'waitlisted',waitlisted,'membership_type',membership_type,'season_wins',season_wins,'season_losses',season_losses,
               'games_played',games_played,'archived_at',archived_at) order by id),'[]'::jsonb) from public.players))
$$;
revoke all on function public.capture_state() from public,anon,authenticated;

create or replace function public.undo_last() returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.undo_journal; k text; st jsonb;
begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(7262026);
 perform 1 from public.app_state where key in ('current_session','completed_sessions','player_approvals','membership_overrides','pre_session_attendance') for update;
 select * into e from public.undo_journal order by id desc limit 1 for update;
 if e.id is null then raise exception 'Nothing to undo'; end if;
 if exists(select 1 from public.audit_log a where a.action='season.started' and a.created_at>e.created_at) then
  raise exception 'Nothing to undo since the new season started';
 end if;
 if e.snapshot=public.capture_state() then -- that step changed nothing (e.g. a dialog was cancelled): drop it, undo nothing else
  delete from public.undo_journal where id=e.id;
  return jsonb_build_object('undone',null,'skipped',e.label,'taken_at',e.created_at,'remaining',(select count(*) from public.undo_journal));
 end if;
 st=e.snapshot->'app_state';
 foreach k in array array['current_session','completed_sessions','player_approvals','membership_overrides','pre_session_attendance'] loop
  if st ? k then
   insert into public.app_state(key,value,version,updated_at) values(k,st->>k,1,now())
   on conflict(key) do update set value=excluded.value,version=public.app_state.version+1,updated_at=now();
  else
   delete from public.app_state where key=k;
  end if;
 end loop;
 update public.players p set current_court=(x->>'current_court')::int,highest_court=(x->>'highest_court')::int,no_show_count=(x->>'no_show_count')::int,
   archived_at=case when x?'archived_at' then (x->>'archived_at')::timestamptz else p.archived_at end,approved=(x->>'approved')::boolean,waitlisted=(x->>'waitlisted')::boolean,membership_type=x->>'membership_type',
   season_wins=(x->>'season_wins')::int,season_losses=(x->>'season_losses')::int,games_played=(x->>'games_played')::int,updated_at=now()
 from jsonb_array_elements(e.snapshot->'players') x where p.id=(x->>'id')::bigint;
 delete from public.undo_journal where id=e.id;
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'undo',e.label,jsonb_build_object('journal_id',e.id,'taken_at',e.created_at));
 return jsonb_build_object('undone',e.label,'taken_at',e.created_at,'remaining',(select count(*) from public.undo_journal));
end $$;
revoke all on function public.checkpoint(text) from public,anon;
revoke all on function public.checkpoint_settle(bigint) from public,anon;
revoke all on function public.undo_last() from public,anon;
grant execute on function public.checkpoint(text),public.checkpoint_settle(bigint),public.undo_last() to authenticated;

update public.environment set schema_version='L24' where true;
commit;
