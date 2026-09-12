-- R01: fresh start for the 2026-27 season (September 11, 2026). Run the SAME file on TEST and on production so both
-- start identical. Nothing from earlier seasons is kept: no sessions, scores, standings, attendance, votes, snapshots,
-- approvals, payments, questions, announcements or logs. The player list (names and contact details) stays so
-- returning players are recognised when they sign in; every player's season statistics are zeroed and everyone
-- registers again. The organizer account, invitations, season dates and all settings stay.
-- The old production data remains in schema backup_20260911 and in Supabase's daily backups.
begin;
delete from public.app_state
 where key in ('current_session','completed_sessions','player_approvals','membership_overrides','pre_session_attendance',
               'round_snapshots','qa_questions','reminder_request','reminder_last_run','vote_digest_last_id',
               '_test_arr','_test_key','_test_str','admin_pin','pin','invite_code')
    or key like 'snapshot\_%' or key like 'votes\_session\_%' or key like 'rsvp\_session\_%' or key like 'archive\_%';
delete from public.rsvps where true;
delete from public.rsvp_log where true;
delete from public.reminder_log where true;
delete from public.payments where true;
delete from public.payments_archive where true;
delete from public.undo_journal where true;
delete from public.questions where true;
delete from public.announcements where true;
delete from public.push_subscriptions where true;
delete from public.audit_log where true;
update public.players set season_wins=0,season_losses=0,games_played=0,no_show_count=0,paid=false,approved=false,
  waitlisted=false,registered_at=null,declared_payment='',highest_court=current_court,admin_note='',updated_at=now() where true;
commit;
select (select count(*) from public.players) players_kept,
       (select count(*) from public.app_state) state_keys_left,
       (select count(*) from public.players where season_wins+season_losses+games_played+no_show_count>0 or approved or registered_at is not null) players_not_reset,
       (select count(*) from public.rsvps)+(select count(*) from public.payments)+(select count(*) from public.questions)+(select count(*) from public.announcements) other_rows_left,
       (select count(*) from public.app_admins) organizers;
