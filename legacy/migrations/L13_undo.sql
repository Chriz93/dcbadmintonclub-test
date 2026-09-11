-- Universal undo for the admin. Before every match-night or roster action the app asks the database for a checkpoint:
-- a full snapshot of the night (session, history, approvals, attendance) and every player's court, approval and
-- statistics columns. Score saves are journaled by the database itself, so a player's save is undoable too.
-- undo_last() restores the latest snapshot exactly and removes it; pressing it again steps further back.
-- Money, announcements and invitations keep their own delete buttons and are not part of this journal.
begin;
create table if not exists public.undo_journal(id bigint generated always as identity primary key,created_at timestamptz not null default now(),actor uuid,actor_email text,label text not null,snapshot jsonb not null);
alter table public.undo_journal enable row level security;
revoke all on public.undo_journal from public,anon,authenticated;
drop policy if exists "admin reads undo journal" on public.undo_journal;
create policy "admin reads undo journal" on public.undo_journal for select to authenticated using(public.is_admin());
grant select on public.undo_journal to authenticated;
grant select on public.undo_journal to service_role;

create or replace function public.capture_state() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'app_state',(select coalesce(jsonb_object_agg(key,to_jsonb(value)),'{}'::jsonb) from public.app_state
               where key in ('current_session','completed_sessions','player_approvals','membership_overrides','pre_session_attendance')),
  'players',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'current_court',current_court,'highest_court',highest_court,'no_show_count',no_show_count,
               'approved',approved,'waitlisted',waitlisted,'membership_type',membership_type,'season_wins',season_wins,'season_losses',season_losses,
               'games_played',games_played) order by id),'[]'::jsonb) from public.players))
$$;
revoke all on function public.capture_state() from public,anon,authenticated;

create or replace function public.prune_undo_journal() returns trigger language plpgsql security definer set search_path='' as $$ begin
 delete from public.undo_journal where id not in (select id from public.undo_journal order by id desc limit 100);
 return null;
end $$;
drop trigger if exists undo_journal_prune on public.undo_journal;
create trigger undo_journal_prune after insert on public.undo_journal for each statement execute function public.prune_undo_journal();

create or replace function public.checkpoint(p_label text) returns bigint language plpgsql security definer set search_path='' as $$ declare i bigint; begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501'; end if;
 insert into public.undo_journal(actor,actor_email,label,snapshot)
 values(auth.uid(),public.my_email(),left(coalesce(nullif(trim(p_label),''),'Admin action'),120),public.capture_state()) returning id into i;
 return i;
end $$;

-- After the action: drop the checkpoint if nothing actually changed (a cancelled dialog, a refused step).
create or replace function public.checkpoint_settle(p_id bigint) returns boolean language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501'; end if;
 delete from public.undo_journal where id=p_id and snapshot=public.capture_state();
 return found;
end $$;

create or replace function public.undo_last() returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.undo_journal; k text; st jsonb;
begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501'; end if;
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
   approved=(x->>'approved')::boolean,waitlisted=(x->>'waitlisted')::boolean,membership_type=x->>'membership_type',
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

-- Score saves journal themselves (same rules as L03, plus the checkpoint just before the write).
create or replace function public.save_court_scores(p_court int,p_cycle int,p_scores jsonb,p_expected int) returns int language plpgsql security definer set search_path='' as $$
declare st public.app_state; cur jsonb; assigned jsonb; n int; target int; k text; sc jsonb; sa int; sb int; me bigint; cnt int=0;begin
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
 target=case when n=5 then 15 else 21 end;
 if jsonb_typeof(p_scores)<>'object' then raise exception 'Invalid scores';end if;
 for k,sc in select * from jsonb_each(p_scores) loop
  if k !~ ('^c'||p_court||'_y'||p_cycle||'_g[1-5]$') then raise exception 'Score key % is not on this court/round',k;end if;
  sa=(sc->>'sA')::int;sb=(sc->>'sB')::int;
  if sa is null or sb is null or sa<0 or sb<0 or sa=sb or greatest(sa,sb)<>target or least(sa,sb)>=target then raise exception 'Game % must finish at % with no tie',k,target;end if;
  if (sc->>'w') is distinct from (case when sa>sb then 'A' else 'B' end) then raise exception 'Winner flag does not match the score for %',k;end if;
  cur=jsonb_set(cur,array['scores',k],sc,true);cnt=cnt+1;
 end loop;
 if cnt=0 then raise exception 'No scores supplied';end if;
 insert into public.undo_journal(actor,actor_email,label,snapshot)
 values(auth.uid(),public.my_email(),'Scores: Court '||p_court||', Round '||p_cycle||coalesce(' · '||(select name from public.players where id=me),''),public.capture_state());
 update public.app_state set value=cur::text,version=version+1,updated_at=now() where key='current_session';
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'scores.saved','court '||p_court,jsonb_build_object('cycle',p_cycle,'games',cnt,'version',st.version+1));
 return st.version+1;
end $$;
commit;
