-- Review remediation: atomic status/state writes, match identity, stable RSVPs and idempotent money entries.
-- Run after L21. This migration does not seed players, delete league data or contact a provider.
begin;
select public.assert_test_environment(); -- This release is authorized for TEST only.

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
commit;
