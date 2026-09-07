-- Authorized TEST only. Requires the protected snapshot created in this project.
-- Archive preserves historic evidence; no Auth users, registrations, signatures or ratings are created.
begin;
do $$ declare c uuid='10000000-0000-0000-0000-000000000001';owner_id uuid='014c9535-bc71-4221-95ea-80ea604abf0e';source text;begin
 if to_regnamespace('upgrade_backup_20260906') is null or not exists(select 1 from club_app.memberships where club_id=c and user_id=owner_id and role='club_owner') then raise exception 'Approved TEST snapshot and owner guards required';end if;
 source=jsonb_build_object('players',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb) from public.players p),'announcements',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from public.announcements a),'kv',(select coalesce(jsonb_object_agg(key,value::jsonb),'{}'::jsonb) from public.app_state where key not in ('admin_pin','pin','invite_code') and key not like 'snapshot_%'),'archive_note','Preserved TEST legacy source; authentication codes and recursive backup copies remain only in protected original tables. Missing historic session IDs use immutable archive position in the history viewer.')::text;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'aal','aal2')::text,true);
 perform club_app.archive_legacy_history(c,'Legacy TEST league history — 2026',source,encode(sha256(convert_to(source,'UTF8')),'hex'));
end $$;
commit;
select jsonb_build_object('archives',count(*),'legacy_players',sum(jsonb_array_length(source_text::jsonb->'players')),'completed_sessions',sum(jsonb_array_length(source_text::jsonb#>'{kv,completed_sessions}')),'identity_links',(select count(*) from club_app.legacy_identity_links),'current_season_signatures',(select count(*) from club_app.signature_receipts where club_id='10000000-0000-0000-0000-000000000001')) as archive_verification from club_app.legacy_archives where club_id='10000000-0000-0000-0000-000000000001';
