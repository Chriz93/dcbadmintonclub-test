# Production cutover — legacy site, 2026–27 season

Everything below has been rehearsed on TEST and on a local PostgreSQL copy. Nothing here has been run on production.
Production stays unchanged until every gate is green. Estimated hands-on time: 45 minutes, on a quiet day (not a Tuesday).

## Gates before touching production

1. Organizer has signed in on the TEST site with the email code and the authenticator, and confirmed the vote card,
   registration, and a scored round work on a phone.
2. The Gmail app password pasted into chat has been rotated (Google Account → Security → App passwords) and the new
   one saved in Supabase → Auth → SMTP for BOTH projects. The Supabase secret key seen in chat has been rotated.
3. A verified backup of production exists (step 1 below) and a restore has been rehearsed on TEST (docs/21 once done).
4. Announce a maintenance window to players (the old site keeps working until step 4).

## Steps

1. **Backup production.** Supabase → Database → Backups → download the latest, AND in the SQL editor:
   `create schema backup_20260915; create table backup_20260915.players as table public.players;`
   `create table backup_20260915.app_state as table public.app_state; create table backup_20260915.announcements as table public.announcements;`
   Confirm row counts match `public`.
2. **Run the migration** in the production SQL editor: paste `legacy/migrations/PROD_2026-27.sql` in one go.
   It is additive: it never deletes players, sessions or scores. It removes anonymous access, so the OLD site stops
   working the moment it runs — do step 3 immediately after.
3. **Deploy the new site** to the production repository `Chriz93/dcbadmintonclub`:
   `python3 legacy/scripts/build-production.py --key <production publishable key> --out ../dcbadmintonclub`
   (the key is in Supabase → Project Settings → API Keys, "publishable"; the old anon JWT also works). Commit and push
   `index.html`, `sw.js`, `manifest.json`, `.nojekyll`. GitHub Pages publishes within a minute.
4. **First sign-in.** Open https://chriz93.github.io/dcbadmintonclub/, sign in with the organizer email and code.
   Then run `legacy/migrations/P00_organizer.sql` in production (it must print ORGANIZER OK), then
   `legacy/migrations/verify.sql` (every row OK). Reload the site, open Admin, enrol the authenticator.
5. **Start the season.** Admin → Tools → "Start new season" with label `2025-26`. This archives last season's results
   (still visible under History), zeroes statistics, withdraws approvals and asks everyone to register again.
   Then mark the seeding courts for the 25 regulars (Admin → Players) and confirm the Home page shows Session 1 —
   Sep 15, 2026.
6. **Invite players.** Players sign in with the email already on their record; no invitation rows are needed for
   returning players. New players need a row in `public.invitations` (Admin → Registrations → Invite).
7. **Reminders.** In the TEST repository settings add secrets `SUPABASE_SERVICE_ROLE_KEY` (production project) and
   `GMAIL_APP_PASSWORD`, set variable `LEGACY_DELIVERY_MODE=live`, watch one run in test mode (emails land in the
   league inbox), then set `ALLOW_REAL_RECIPIENTS=true`. Change `SUPABASE_URL` and `SITE_URL` in
   `.github/workflows/legacy-reminders.yml` to the production values in the same commit.

## Rollback (any time before players have registered for 2026–27)

1. In the production repository: `git revert` the deploy commit (or restore the previous `index.html`, `sw.js`,
   `manifest.json`) and push. The old site is back in a minute.
2. Run `legacy/migrations/ROLLBACK_reopen_anon.sql` in the production SQL editor. This re-opens the anonymous access
   the old site needs. The new columns, tables and functions stay; the old site ignores them.
3. If data was changed after the migration and must be discarded, restore `public.players` / `public.app_state`
   from `backup_20260915` (row-level copies are safer than dropping tables: `update … from backup_20260915.…`).

## What the migration changes (for the record)

- Adds columns to `players` (approval, waitlist, registration date, organizer note, sign-in user, reminders opt-out)
  and a version to `app_state`; adds `app_admins`, `invitations`, `rsvps`, `questions`, `audit_log`, `reminder_log`.
- Removes every anonymous policy and grant. Members read through `players_public` (no phone, email, medical, signature).
- Replaces PIN/invite-code secrets with email codes and the organizer's authenticator.
- All writes go through checked functions: `set_state` (versioned), `save_court_scores`, `register_me`, `set_rsvp`,
  `start_new_season`, `rebuild_player_stats`, `set_email_reminders`.
