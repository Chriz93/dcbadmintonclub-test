begin;
-- Correcting a live score invalidates any open assignment/closure preview for
-- that session. Completed-session corrections already preserve all played courts.
alter function club_app.correct_score(uuid,uuid,int,int,int,text) rename to correct_score_before_preview_guard;
revoke all on function club_app.correct_score_before_preview_guard(uuid,uuid,int,int,int,text) from public,anon,authenticated,service_role;
create function club_app.correct_score(c uuid,m uuid,a int,b int,expected_revision int,reason text) returns int language plpgsql security definer set search_path='' as $$
declare next_revision int;begin
 next_revision=club_app.correct_score_before_preview_guard(c,m,a,b,expected_revision,reason);
 -- The correction implementation holds the session lock until this transaction ends.
 update club_app.sessions set revision=revision+1 where club_id=c and status='active' and id=(select session_id from club_app.matches where club_id=c and id=m);
 return next_revision;
end $$;
revoke all on function club_app.correct_score(uuid,uuid,int,int,int,text) from public,anon,authenticated,service_role;
grant execute on function club_app.correct_score(uuid,uuid,int,int,int,text) to authenticated;
commit;
