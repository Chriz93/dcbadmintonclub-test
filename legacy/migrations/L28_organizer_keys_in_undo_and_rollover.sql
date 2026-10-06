-- L28 (5 October 2026): the two keys the organizer's own decisions live in are part of undo, and are cleared at rollover.
--
-- p92 introduced app_state.admin_court_moves (the running total of courts the organizer moved a player by hand, added
-- back so a courtesy move is not recorded as a court drop) and p99 introduces app_state.player_seed_points (the starting
-- rating the organizer sets for a drop-in). Both were left out of two lists that already existed:
--
-- 1. UNDO. capture_state()/undo_last() snapshot and restore five app_state keys. A seat change (setPlayerCourt) is an
--    undoable action and writes admin_court_moves, so pressing Undo put the court back and left the adjustment behind:
--    the court-climb figure then counted a move that no longer existed. Same for a drop-in's starting points.
-- 2. SEASON ROLLOVER. rollover_season_internal archives and clears the season's app_state keys. These two were neither
--    archived nor cleared, so last season's hand-made court moves and starting points would have carried into the new
--    season and skewed the first night's figures and ratings.
--
-- Nothing else changes. The three bodies below are the current ones (all three from L24) with the two key names added to
-- each list. undo_last takes the league lock, so L26's bounds (lock_timeout 5s, statement_timeout 20s) are re-applied
-- afterwards: CREATE OR REPLACE replaces a function's SET clauses, and verify.sql refuses an unbounded lock-taker.
begin;

create or replace function public.capture_state() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'app_state',(select coalesce(jsonb_object_agg(key,to_jsonb(value)),'{}'::jsonb) from public.app_state
               where key in ('current_session','completed_sessions','player_approvals','membership_overrides','pre_session_attendance','admin_court_moves','player_seed_points')),
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
 perform 1 from public.app_state where key in ('current_session','completed_sessions','player_approvals','membership_overrides','pre_session_attendance','admin_court_moves','player_seed_points') for update;
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
 foreach k in array array['current_session','completed_sessions','player_approvals','membership_overrides','pre_session_attendance','admin_court_moves','player_seed_points'] loop
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
revoke all on function public.undo_last() from public,anon;
grant execute on function public.undo_last() to authenticated;

create or replace function public.rollover_season_internal(p_label text) returns jsonb language plpgsql security definer set search_path='' as $$ declare archive jsonb; sessions text; cur text; n int; np int;begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 if p_label is null or length(trim(p_label)) not between 3 and 40 or exists(select 1 from public.app_state where key='archive_'||trim(p_label)) then raise exception 'Unique archive label required';end if;
 select value into sessions from public.app_state where key='completed_sessions';
 select value into cur from public.app_state where key='current_session';
 if cur is not null and cur<>'null' then raise exception 'End the active session before starting a new season';end if;
 archive=jsonb_build_object('label',trim(p_label),'archived_at',now(),'completed_sessions',coalesce(sessions,'[]')::jsonb,
  'players',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'current_court',current_court,'highest_court',highest_court,'season_wins',season_wins,'season_losses',season_losses,'games_played',games_played,'no_show_count',no_show_count,'membership_type',membership_type,'registered_at',registered_at) order by id),'[]'::jsonb) from public.players),
  'state',(select coalesce(jsonb_object_agg(key,value::jsonb),'{}'::jsonb) from public.app_state where key in ('player_approvals','membership_overrides','pre_session_attendance','round_snapshots','admin_court_moves','player_seed_points') or key like 'votes_session_%' or key like 'rsvp_session_%'));
 insert into public.app_state(key,value,version,updated_at) values('archive_'||trim(p_label),archive::text,1,now());
 delete from public.app_state where key in ('completed_sessions','player_approvals','membership_overrides','pre_session_attendance','round_snapshots','admin_court_moves','player_seed_points') or key like 'votes_session_%' or key like 'rsvp_session_%';
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

-- L26 again, for whatever this migration replaced: a function that takes the league lock must be bounded.
do $$
declare r record; n int := 0;
begin
 for r in
   select p.oid::regprocedure as sig
   from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.prosrc like '%pg_advisory_xact_lock(7262026)%'
     and not (coalesce(array_to_string(p.proconfig,','),'') like '%lock_timeout%' and coalesce(array_to_string(p.proconfig,','),'') like '%statement_timeout%')
 loop
   execute format('alter function %s set lock_timeout = %L', r.sig, '5s');
   execute format('alter function %s set statement_timeout = %L', r.sig, '20s');
   n := n + 1;
 end loop;
 raise notice 'L28: re-bounded % lock-taking function(s)', n;
end $$;

commit;
