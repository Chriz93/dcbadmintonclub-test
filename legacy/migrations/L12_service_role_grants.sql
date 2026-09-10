-- The scheduled jobs (weekly backup, vote digest) run as service_role and read the league tables directly.
-- service_role bypasses row-level security but still needs table privileges; the tables added by L01 never got them.
-- Read-only everywhere except the three places a job must write: its own claim log and the two state keys it owns.
begin;
grant select on public.players,public.announcements,public.app_state,public.rsvps,public.questions,
  public.invitations,public.app_admins,public.audit_log,public.reminder_log,public.rsvp_log,
  public.payments,public.push_subscriptions,public.season_dates to service_role;
grant insert,update on public.app_state to service_role;    -- reminder_last_run, vote_digest_last_id
grant insert,delete on public.reminder_log to service_role; -- claim before sending, release on failure
grant delete on public.push_subscriptions to service_role;  -- drop endpoints the browser has discarded
commit;
