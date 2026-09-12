-- L19: two players play best of three. save_court_scores (L15) refuses a Game 3 on a court of two once one player
-- has won the first two games, whichever order the games are saved in. Everything else in the function is unchanged.
begin;
create or replace function public.save_court_scores(p_court int,p_cycle int,p_scores jsonb,p_expected int) returns int language plpgsql security definer set search_path='' as $$
declare st public.app_state; cur jsonb; assigned jsonb; n int; target int; games int; k text; sc jsonb; sa int; sb int; me bigint; cnt int=0; ids bigint[]; need int; g int;begin
 me=public.my_player_id();
 select * into st from public.app_state where key='current_session' for update;
 if st.key is null then raise exception 'No active session';end if;
 cur=st.value::jsonb;
 if p_expected is not null and p_expected<>st.version then raise exception 'Stale state: refresh before saving' using errcode='40001';end if;
 if coalesce((cur->>'cycle')::int,1)<>p_cycle then raise exception 'That round is over — refresh to see the current round' using errcode='40001';end if;
 if coalesce((cur->>'completed')::boolean,false) then raise exception 'Session is complete; scores are locked';end if;
 if p_court is null or p_court not between 1 and 6 then raise exception 'Invalid court';end if;
 assigned=coalesce(cur->'assignments'->(p_court::text),'[]'::jsonb);
 n=jsonb_array_length(assigned);
 if not public.is_admin() then
  if me is null or not exists(select 1 from jsonb_array_elements(assigned) e where (e#>>'{}')::bigint=me) then raise exception 'Only players on this court (or the organizer) can enter its scores' using errcode='42501';end if;
 end if;
 if n<2 then raise exception 'Court % needs at least two players',p_court;end if;
 target=case when n=5 then 15 else 21 end;
 games=case when n=5 then 5 else 3 end;
 need=case when n>=4 then 4 else 2 end;
 if jsonb_typeof(p_scores)<>'object' then raise exception 'Invalid scores';end if;
 for k,sc in select * from jsonb_each(p_scores) loop
  if k !~ ('^c'||p_court||'_y'||p_cycle||'_g[1-5]$') then raise exception 'Score key % is not on this court/round',k;end if;
  g=substring(k from '_g([1-5])$')::int;
  if g>games then raise exception 'Court % plays % games; % is not one of them',p_court,games,k;end if;
  sa=(sc->>'sA')::int;sb=(sc->>'sB')::int;
  if sa is null or sb is null or sa<0 or sb<0 or sa=sb or greatest(sa,sb)<>target or least(sa,sb)>=target then raise exception 'Game % must finish at % with no tie',k,target;end if;
  if (sc->>'w') is distinct from (case when sa>sb then 'A' else 'B' end) then raise exception 'Winner flag does not match the score for %',k;end if;
  select array_agg(v) into ids from (select (sc->>f)::bigint v from unnest(array['a1','a2','b1','b2']) f where jsonb_typeof(sc->f)='number') t;
  if coalesce(array_length(ids,1),0)<>need or (sc->'a1') is null or (sc->'b1') is null
     or (select count(distinct x) from unnest(ids) x)<>need
     or exists(select 1 from unnest(ids) x where not exists(select 1 from jsonb_array_elements(assigned) e where (e#>>'{}')::bigint=x))
  then raise exception 'Game % must be played by % different players from Court %',k,need,p_court;end if;
  cur=jsonb_set(cur,array['scores',k],sc,true);cnt=cnt+1;
 end loop;
 -- Two players play best of three: once one player has won the first two games there is no Game 3.
 if n=2 and (cur#>array['scores','c'||p_court||'_y'||p_cycle||'_g3']) is not null
    and (cur#>>array['scores','c'||p_court||'_y'||p_cycle||'_g1','w'])=(cur#>>array['scores','c'||p_court||'_y'||p_cycle||'_g2','w'])
 then raise exception 'Best of three: there is no Game 3 after one player wins the first two games';end if;
 if cnt=0 then raise exception 'No scores supplied';end if;
 insert into public.undo_journal(actor,actor_email,label,snapshot)
 values(auth.uid(),public.my_email(),'Scores: Court '||p_court||', Round '||p_cycle||coalesce(' · '||(select name from public.players where id=me),''),public.capture_state());
 update public.app_state set value=cur::text,version=version+1,updated_at=now() where key='current_session';
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'scores.saved','court '||p_court,jsonb_build_object('cycle',p_cycle,'games',cnt,'version',st.version+1));
 return st.version+1;
end $$;
commit;
