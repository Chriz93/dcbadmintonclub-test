-- L15: database hardening found by the database test design and the final deep check (September 11, 2026). Safe to run again.
-- 1. set_rsvp: a signed-in account with no player record could answer for ANY player. The check compared the target
--    with an empty (null) player id, which is never "different", so the refusal was skipped. Now: only your own
--    record, unless you are the verified organizer.
-- 2. save_court_scores: each game's players must be on that court, all different, the right number (two a side on a
--    court of four or five, one a side for singles), and the game number within the court's games (5 on a court of
--    five, 3 otherwise). A player could otherwise record games naming players from other courts.
-- 3. Trigger functions are not callable by anyone directly.
-- 4. Votes are written only through set_rsvp. The table itself still let a signed-in player insert or change their own
--    vote directly (the site never does), which skipped the Sunday 10:00 PM lock.
-- 5. A question shows the asker's own name from their player record; the browser used to supply it.
-- 6. Season rollover also closes last season's money ledger and reminder log. Otherwise next season's fee status (in
--    the database and on the Pay tab) would count last season's payments, and the reminder job would skip session N
--    because last season's session N was already reminded. Old payments move to payments_archive (organizer only).
--    The rollover's bulk statements carry an explicit WHERE so Supabase's safe-update guard can never refuse them.
-- 7. Every league table gets exactly the privileges the site and the scheduled jobs use. Supabase's defaults give
--    signed-in users and the service role every privilege on new tables, including TRUNCATE, which row rules do not cover.
-- 8. my_email() has a fixed search path (Security Advisor warning).
-- 9. pg_net moves to the extensions schema (Security Advisor warning); only queued web requests are lost.
begin;
create or replace function public.set_rsvp(p_session int,p_player bigint,p_response text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$ declare me bigint; begin
 me=public.my_player_id();
 if not public.is_admin() and (me is null or p_player is distinct from me) then raise exception 'You can only answer for yourself' using errcode='42501';end if;
 if p_response not in ('coming','notcoming','maybe','late','need_spare') then raise exception 'Invalid response';end if;
 if not public.is_admin()
    and exists(select 1 from public.players p where p.id=p_player and coalesce(p.membership_type,'regular')<>'spare')
    and exists(select 1 from public.season_dates d where d.session_number=p_session and now()>d.start_at-interval '46 hours')
 then raise exception 'Voting closed Sunday 10:00 PM. Message the admin in the group to change your answer.' using errcode='42501';end if;
 insert into public.rsvps(session_number,player_id,response,note) values(p_session,p_player,p_response,coalesce(p_note,''))
 on conflict(session_number,player_id) do update set response=excluded.response,note=excluded.note,updated_at=now();
end $$;

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
 if cnt=0 then raise exception 'No scores supplied';end if;
 insert into public.undo_journal(actor,actor_email,label,snapshot)
 values(auth.uid(),public.my_email(),'Scores: Court '||p_court||', Round '||p_cycle||coalesce(' · '||(select name from public.players where id=me),''),public.capture_state());
 update public.app_state set value=cur::text,version=version+1,updated_at=now() where key='current_session';
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'scores.saved','court '||p_court,jsonb_build_object('cycle',p_cycle,'games',cnt,'version',st.version+1));
 return st.version+1;
end $$;

revoke all on function public.log_rsvp_change() from public,anon,authenticated;
revoke all on function public.prune_undo_journal() from public,anon,authenticated;

-- 4. Votes only through set_rsvp.
drop policy if exists rsvps_own_insert on public.rsvps;
drop policy if exists rsvps_own_update on public.rsvps;

-- 5. The asker's name comes from their own record.
create or replace function public.set_question_asker() returns trigger language plpgsql security definer set search_path='' as $$ begin
 new.asker=coalesce((select p.name from public.players p where p.id=new.player_id),left(coalesce(new.asker,''),80));
 return new;
end $$;
revoke all on function public.set_question_asker() from public,anon,authenticated;
drop trigger if exists questions_asker on public.questions;
create trigger questions_asker before insert on public.questions for each row execute function public.set_question_asker();

-- 6. Season rollover closes last season's money ledger and reminder log.
create table if not exists public.payments_archive(id bigint primary key,season_label text not null,archived_at timestamptz not null default now(),player_id bigint,player_name text,kind text not null,amount numeric(8,2) not null,session_number int,method text,received_on date,note text,created_by uuid,created_at timestamptz);
alter table public.payments_archive enable row level security;
drop policy if exists "admin reads payment archive" on public.payments_archive;
create policy "admin reads payment archive" on public.payments_archive for select to authenticated using(public.is_admin());
create or replace function public.start_new_season(p_label text) returns jsonb language plpgsql security definer set search_path='' as $$ declare archive jsonb; sessions text; cur text; n int; np int;begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 if p_label is null or length(trim(p_label)) not between 3 and 40 or exists(select 1 from public.app_state where key='archive_'||trim(p_label)) then raise exception 'Unique archive label required';end if;
 select value into sessions from public.app_state where key='completed_sessions';
 select value into cur from public.app_state where key='current_session';
 if cur is not null then raise exception 'End the active session before starting a new season';end if;
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

-- 7. Exact table privileges (nothing for anonymous visitors; row rules still decide which rows).
revoke all on public.players,public.players_public,public.announcements,public.app_state,public.rsvps,public.questions,public.invitations,public.app_admins,public.audit_log,
  public.payments,public.payments_archive,public.push_subscriptions,public.reminder_log,public.rsvp_log,public.season_dates,public.undo_journal from public,anon,authenticated,service_role;
grant select on public.players,public.players_public,public.announcements,public.app_state,public.rsvps,public.questions,public.invitations,public.app_admins,public.audit_log,
  public.payments,public.payments_archive,public.push_subscriptions,public.reminder_log,public.rsvp_log,public.season_dates,public.undo_journal to authenticated;
grant insert,update,delete on public.players,public.announcements,public.questions,public.invitations to authenticated;
-- The scheduled jobs (backup, reminders, vote digest): read everything; write only their claim log, their two state keys and dead push endpoints.
grant select on public.players,public.announcements,public.app_state,public.rsvps,public.questions,public.invitations,public.app_admins,public.audit_log,
  public.payments,public.payments_archive,public.push_subscriptions,public.reminder_log,public.rsvp_log,public.season_dates,public.undo_journal to service_role;
grant insert,update on public.app_state to service_role;
grant insert,delete on public.reminder_log to service_role;
grant delete on public.push_subscriptions to service_role;

-- 8. Fixed search path.
create or replace function public.my_email() returns text language sql stable set search_path='' as $$ select lower(trim(coalesce(auth.jwt()->>'email',''))) $$;
commit;

-- 9. pg_net into the extensions schema (outside the transaction, so a refusal here cannot undo the steps above).
do $$ begin
 if exists(select 1 from pg_extension e join pg_namespace s on s.oid=e.extnamespace where e.extname='pg_net' and s.nspname='public') then
  drop extension pg_net;
  create extension pg_net with schema extensions;
 end if;
exception when others then raise notice 'pg_net left where it is: %', sqlerrm;
end $$;
