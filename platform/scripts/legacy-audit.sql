-- Metadata-only audit. Run in the approved project; exports no names, contacts or signatures.
create or replace function pg_temp.legacy_json(v text) returns jsonb language plpgsql immutable strict as $$ begin return v::jsonb; exception when invalid_text_representation then return null;end $$;
with kv as(select key,pg_temp.legacy_json(value) data from public.app_state),
completed as(select x from kv cross join lateral jsonb_array_elements(case when jsonb_typeof(data)='array' then data else '[]'::jsonb end) x where key='completed_sessions'),
games as(select v from completed cross join lateral jsonb_each(case when jsonb_typeof(x->'scores')='object' then x->'scores' else '{}'::jsonb end) g(k,v))
select jsonb_build_object(
'players',(select count(*) from public.players),
'announcements',(select count(*) from public.announcements),
'state_rows',(select count(*) from kv),
'invalid_state_json',(select count(*) from kv where data is null),
'completed_sessions',(select count(*) from completed),
'completed_games',(select count(*) from games),
'legacy_tied_games',(select count(*) from games where v->>'sA'=v->>'sB'),
'current_session_present',exists(select 1 from kv where key='current_session' and jsonb_typeof(data)='object'),
'snapshots',(select count(*) from kv where key like 'snapshot_%'),
'missing_completed_ids',(select count(*) from completed where x->>'id' is null),
'duplicate_completed_ids',(select count(x->>'id')-count(distinct x->>'id') from completed),
'import_performed',false) as legacy_inventory;
