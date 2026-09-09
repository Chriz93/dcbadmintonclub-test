-- Maplewood league site, Phase 2: court-scoped score entry for players, season rollover, re-registration.
begin;

-- Re-registering for a new season stamps a new registration date (drives "registered this season").
create or replace function public.register_me(p_name text,p_phone text,p_emergency text,p_medical text,p_sig text,p_membership text) returns bigint language plpgsql security definer set search_path='' as $$ declare em text; inv public.invitations; existing public.players; pid bigint;begin
 select lower(trim(email)) into em from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if em is null then raise exception 'Verified sign-in email required' using errcode='42501';end if;
 select * into inv from public.invitations where email=em;
 select * into existing from public.players where user_id=auth.uid() or (user_id is null and lower(email)=em) order by user_id is not null desc limit 1;
 if existing.id is null and inv.email is null then raise exception 'Registration is closed. This link is for players Christy has confirmed; contact the organizer if you were accepted.' using errcode='42501';end if;
 if p_name is null or length(trim(p_name)) not between 2 and 80 or coalesce(length(p_phone),0)>40 or coalesce(length(p_emergency),0)>200 or coalesce(length(p_medical),0)>500 or coalesce(length(p_sig),0)>200000 then raise exception 'Invalid registration details';end if;
 if existing.id is null then
  insert into public.players(name,email,phone,emergency,medical,sig,waiver_signed,paid,current_court,highest_court,season_wins,season_losses,games_played,membership_type,approved,waitlisted,registered_at,user_id)
  values(trim(p_name),em,coalesce(p_phone,''),coalesce(p_emergency,''),coalesce(p_medical,''),coalesce(p_sig,''),p_sig is not null and p_sig<>'',false,0,0,0,0,0,coalesce(inv.membership_type,p_membership,'regular'),false,false,now(),auth.uid()) returning id into pid;
 else
  update public.players set name=trim(p_name),phone=coalesce(p_phone,phone),emergency=coalesce(p_emergency,emergency),medical=coalesce(p_medical,medical),sig=case when p_sig is not null and p_sig<>'' then p_sig else sig end,waiver_signed=(p_sig is not null and p_sig<>'') or waiver_signed,membership_type=coalesce(inv.membership_type,membership_type),registered_at=now(),user_id=auth.uid(),updated_at=now() where id=existing.id returning id into pid;
 end if;
 insert into public.audit_log(actor,action,subject) values(auth.uid(),'player.registered',pid::text);
 return pid;
end $$;

-- Players on a court record that court's games for the current round; the organizer can record any court.
-- Each game must finish at the court's target (15 with five players, otherwise 21) with no tie.
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
 update public.app_state set value=cur::text,version=version+1,updated_at=now() where key='current_session';
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'scores.saved','court '||p_court,jsonb_build_object('cycle',p_cycle,'games',cnt,'version',st.version+1));
 return st.version+1;
end $$;

-- Season rollover: archive the finished season, zero the season statistics and require fresh registration.
create or replace function public.start_new_season(p_label text) returns jsonb language plpgsql security definer set search_path='' as $$ declare archive jsonb; sessions text; cur text; n int;begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 if p_label is null or length(trim(p_label)) not between 3 and 40 or exists(select 1 from public.app_state where key='archive_'||trim(p_label)) then raise exception 'Unique archive label required';end if;
 select value into sessions from public.app_state where key='completed_sessions';
 select value into cur from public.app_state where key='current_session';
 if cur is not null then raise exception 'End the active session before starting a new season';end if;
 archive=jsonb_build_object('label',trim(p_label),'archived_at',now(),'completed_sessions',coalesce(sessions,'[]')::jsonb,
  'players',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'current_court',current_court,'highest_court',highest_court,'season_wins',season_wins,'season_losses',season_losses,'games_played',games_played,'no_show_count',no_show_count,'membership_type',membership_type) order by id),'[]'::jsonb) from public.players),
  'state',(select coalesce(jsonb_object_agg(key,value::jsonb),'{}'::jsonb) from public.app_state where key in ('player_approvals','membership_overrides','pre_session_attendance','round_snapshots') or key like 'votes_session_%' or key like 'rsvp_session_%'));
 insert into public.app_state(key,value,version,updated_at) values('archive_'||trim(p_label),archive::text,1,now());
 delete from public.app_state where key in ('completed_sessions','player_approvals','membership_overrides','pre_session_attendance','round_snapshots') or key like 'votes_session_%' or key like 'rsvp_session_%';
 delete from public.rsvps;
 update public.players set season_wins=0,season_losses=0,games_played=0,no_show_count=0,paid=false,approved=false,waitlisted=false,updated_at=now();
 get diagnostics n=row_count;
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'season.started',trim(p_label),jsonb_build_object('players_reset',n));
 return jsonb_build_object('archived',trim(p_label),'players_reset',n);
end $$;
-- Archives are readable by members (results only, no contact details) so previous seasons can be shown.
create policy app_state_archive_read on public.app_state for select to authenticated using(key like 'archive\_%');
revoke all on function public.save_court_scores(int,int,jsonb,int),public.start_new_season(text) from public,anon;
grant execute on function public.save_court_scores(int,int,jsonb,int),public.start_new_season(text) to authenticated;
commit;
