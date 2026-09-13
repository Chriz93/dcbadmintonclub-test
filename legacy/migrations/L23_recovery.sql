-- Atomic finalization and versioned operational snapshots. Immutable evidence and authentication are retained.
begin;
select public.assert_test_environment(); -- This release is authorized for TEST only.
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
commit;
