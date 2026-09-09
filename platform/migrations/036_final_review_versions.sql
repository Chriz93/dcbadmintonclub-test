begin;
-- Completed-session corrections preserve played assignments and need not change the
-- session version. Final placement review must therefore bind the exact score versions.
alter function club_app.finalize_session(uuid,uuid,int,jsonb,text) rename to finalize_session_before_match_guard;
revoke all on function club_app.finalize_session_before_match_guard(uuid,uuid,int,jsonb,text) from public,anon,authenticated,service_role;
create function club_app.finalize_session(c uuid,s uuid,expected_revision int,plan jsonb,reason text,expected_matches jsonb) returns void language plpgsql security definer set search_path='' as $$ declare actual jsonb;begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 perform 1 from club_app.sessions where club_id=c and id=s for update;
 select coalesce(jsonb_object_agg(id::text,revision),'{}'::jsonb) into actual from club_app.matches where club_id=c and session_id=s;
 if expected_matches is null or jsonb_typeof(expected_matches)<>'object' or expected_matches<>actual then raise exception 'Match revision conflict' using errcode='40001';end if;
 perform club_app.finalize_session_before_match_guard(c,s,expected_revision,plan,reason);
end $$;
revoke all on function club_app.finalize_session(uuid,uuid,int,jsonb,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function club_app.finalize_session(uuid,uuid,int,jsonb,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
