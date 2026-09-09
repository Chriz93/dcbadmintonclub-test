-- Season statistics are derived, never incremented: rebuild from stored scores after every change.
-- Counts every completed session, plus rounds of the active session that have already rotated (movements).
-- Legacy tied games (w='T') count as played but neither won nor lost, as the old rebuild did.
begin;
create or replace function public.rebuild_player_stats() returns jsonb language plpgsql security definer set search_path='' as $$ declare sessions jsonb; cur jsonb; n int;begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 select nullif(value,'null')::jsonb into sessions from public.app_state where key='completed_sessions';
 select nullif(value,'null')::jsonb into cur from public.app_state where key='current_session';
 with games as (
  select e.value as sc from jsonb_array_elements(coalesce(sessions,'[]'::jsonb)) s cross join lateral jsonb_each(case when jsonb_typeof(s->'scores')='object' then s->'scores' else '{}'::jsonb end) e
  union all
  select e.value from jsonb_each(case when cur is not null and jsonb_typeof(cur->'scores')='object' then cur->'scores' else '{}'::jsonb end) e
   where (substring(e.key from '_y([0-9]+)_'))::int in (select (m->>'cycle')::int from jsonb_array_elements(case when cur is not null and jsonb_typeof(cur->'movements')='array' then cur->'movements' else '[]'::jsonb end) m)
 ), sides as (
  select (x#>>'{}')::bigint pid,(sc->>'w')='A' won,(sc->>'w')='B' lost from games cross join lateral jsonb_array_elements(jsonb_build_array(sc->'a1',sc->'a2')) x where jsonb_typeof(x)='number'
  union all
  select (x#>>'{}')::bigint,(sc->>'w')='B',(sc->>'w')='A' from games cross join lateral jsonb_array_elements(jsonb_build_array(sc->'b1',sc->'b2')) x where jsonb_typeof(x)='number'
 ), totals as (select pid,count(*)::int g,count(*) filter(where won)::int w,count(*) filter(where lost)::int l from sides group by pid)
 update public.players p set season_wins=coalesce(t.w,0),season_losses=coalesce(t.l,0),games_played=coalesce(t.g,0),updated_at=now()
 from public.players q left join totals t on t.pid=q.id
 where p.id=q.id and (p.season_wins<>coalesce(t.w,0) or p.season_losses<>coalesce(t.l,0) or p.games_played<>coalesce(t.g,0));
 get diagnostics n=row_count;
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'stats.rebuilt',null,jsonb_build_object('players_changed',n));
 return jsonb_build_object('players_changed',n);
end $$;
revoke all on function public.rebuild_player_stats() from public,anon;
grant execute on function public.rebuild_player_stats() to authenticated;
commit;
