-- L14: reminders leave on time and the Tools buttons send at once (September 11, 2026).
-- GitHub's own timer for the reminder job ("every 10 minutes") starts hours late, and the Tools buttons only queued a
-- request for it. Now the database starts the job directly through GitHub's API:
--   * public.dispatch_reminder_job() — the organizer's Tools buttons call it right after queuing their request;
--   * a Supabase timer (pg_cron) calls it every 10 minutes, so the timed reminders go out inside their windows.
-- The GitHub token lives in Supabase Vault as `github_dispatch_token` (fine-grained, this repository only, Actions:
-- read and write). The organizer adds it in the dashboard; it is never stored in code or chat.
-- Safe to run again. Where pg_net / pg_cron / Vault are missing (local rehearsal) the function reports why instead.

do $$ begin create extension if not exists pg_net; exception when others then raise notice 'pg_net not available: %', sqlerrm; end $$;
do $$ begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron not available: %', sqlerrm; end $$;

create or replace function public.dispatch_reminder_job(p_reason text default 'button')
returns jsonb language plpgsql security definer set search_path='' as $$
declare tok text; req bigint;
begin
  -- From the site only the verified organizer may start the job; the timer runs inside the database with no signed-in user.
  if auth.uid() is not null and not public.is_admin() then raise exception 'Organizer verification required'; end if;
  if auth.uid() is null and coalesce(auth.jwt()->>'role','') not in ('','service_role') then raise exception 'Organizer verification required'; end if;
  begin
    select decrypted_secret into tok from vault.decrypted_secrets where name='github_dispatch_token' limit 1;
  exception when others then return jsonb_build_object('dispatched',false,'reason','Vault is not available here');
  end;
  if tok is null or tok='' then return jsonb_build_object('dispatched',false,'reason','No GitHub token saved yet (Vault secret github_dispatch_token)'); end if;
  begin
    select net.http_post(
      url     := 'https://api.github.com/repos/Chriz93/dcbadmintonclub-test/actions/workflows/legacy-reminders.yml/dispatches',
      headers := jsonb_build_object('Authorization','Bearer '||tok,'Accept','application/vnd.github+json',
                                    'X-GitHub-Api-Version','2022-11-28','User-Agent','maplewood-league','Content-Type','application/json'),
      body    := jsonb_build_object('ref','upgrade/secure-platform')) into req;
  exception when others then return jsonb_build_object('dispatched',false,'reason','Could not reach GitHub from the database: '||sqlerrm);
  end;
  return jsonb_build_object('dispatched',true,'request_id',req,'reason',left(coalesce(p_reason,''),20));
end $$;
revoke all on function public.dispatch_reminder_job(text) from public, anon;
grant execute on function public.dispatch_reminder_job(text) to authenticated, service_role;

-- The timer: every 10 minutes, on time. Replaces any earlier schedule of the same name.
do $$ begin
  if to_regnamespace('cron') is null then raise notice 'pg_cron not available: reminders keep GitHub''s own timer'; return; end if;
  perform cron.unschedule(jobid) from cron.job where jobname='maplewood-reminders';
  perform cron.schedule('maplewood-reminders','*/10 * * * *',$job$select public.dispatch_reminder_job('timer')$job$);
end $$;
