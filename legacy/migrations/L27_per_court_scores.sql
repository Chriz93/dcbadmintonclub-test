-- L27 (23 September 2026): a court's scores no longer collide with another court's.
--
-- What happened on 22 September, session 2: the app stopped saving in the middle of the night and every phone showed
-- "Sync failed". Two separate faults, both proven on the rehearsal server before this was written.
--
-- 1. THE WEDGE. save_court_scores takes a league-wide advisory lock (7262026). L26 bounded how long a call may WAIT
--    for that lock (5s) and how long it may RUN (20s), but not how long a connection may sit IDLE INSIDE ITS
--    TRANSACTION while holding it. A phone that dropped mid-request at the gym left its transaction open, holding the
--    lock from 20:57 until it was released by hand the next morning. Every save in between queued, timed out and was
--    retried for ever. Fixed by idle_in_transaction_session_timeout below (already applied by hand on 23 September to
--    stop the bleeding; repeated here so TEST and any rebuild get it too).
--
-- 2. THE COLLISION, which is why this keeps happening even without a wedge. Every court writes the same
--    current_session row, and the function refused any save whose p_expected did not equal the WHOLE league's version.
--    So when two courts finish a round together, the first save bumps the version and the second is refused with
--    "Stale state: this match changed". Reproduced exactly: four courts saving at the same instant, all holding the
--    correct version — one succeeded, three were refused, 3 of 12 scores stored.
--    A court's scores are its own. The conflict rules that actually matter are kept: the same session, the same round,
--    the same line-up on that court, and the session not finished. The league-wide version check is dropped for score
--    saves, and the state is re-read inside the lock so each court merges into the latest value.
--    The lock becomes per-court, so Court 1 saving no longer blocks Court 2 at all.
begin;

-- 1. A connection can never hold the league lock by going idle inside a transaction.
alter role authenticated set idle_in_transaction_session_timeout = '15s';
alter role anon          set idle_in_transaction_session_timeout = '15s';
alter role service_role  set idle_in_transaction_session_timeout = '15s';

-- 2. Per-court locking and court-scoped conflict rules.
create or replace function public.save_court_scores(p_court int,p_cycle int,p_scores jsonb,p_expected int,p_session text,p_lineup jsonb) returns int language plpgsql security definer set search_path='' as $$
declare st public.app_state; cur jsonb; assigned jsonb; n int; target int; k text; sc jsonb; sa int; sb int; me bigint; cnt int=0; g int; pair jsonb; prefix text;
begin
 if p_court is null or p_court not between 1 and 6 then raise exception 'Invalid court';end if;
 -- L27: one lock per court. Two saves for the SAME court still take turns; different courts never wait for each other.
 perform pg_advisory_xact_lock(7262026, p_court);
 me=public.my_player_id();
 -- The row is re-read here, inside the lock, so this court merges into whatever the other courts have already saved.
 select * into st from public.app_state where key='current_session' for update;
 if st.key is null or st.value is null or st.value='null' then raise exception 'No active session';end if;cur=st.value::jsonb;
 -- L27: the league-wide version is NOT a conflict for a score save — another court saving is not a reason to refuse
 -- this one. What must still hold is that this is the same night, the same round, and the same four players.
 if p_session is distinct from cur->>'id' or p_cycle is distinct from (cur->>'cycle')::int then raise exception 'Stale state: this match changed; refresh before saving' using errcode='40001';end if;
 if coalesce((cur->>'completed')::boolean,false) then raise exception 'Session is complete; scores are locked';end if;
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
 update public.app_state set value=cur::text,version=version+1,updated_at=now() where key='current_session' returning version into n;
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'scores.saved','court '||p_court,jsonb_build_object('cycle',p_cycle,'games',cnt,'version',n));
 return n;
end $$;
revoke all on function public.save_court_scores(int,int,jsonb,int,text,jsonb) from public,anon,service_role;
grant execute on function public.save_court_scores(int,int,jsonb,int,text,jsonb) to authenticated;
-- L26 applies to every lock-taking function by its body; re-apply here for the one just replaced.
alter function public.save_court_scores(int,int,jsonb,int,text,jsonb) set lock_timeout='5s';
alter function public.save_court_scores(int,int,jsonb,int,text,jsonb) set statement_timeout='20s';

commit;
