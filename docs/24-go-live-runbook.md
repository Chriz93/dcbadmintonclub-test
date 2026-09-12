# Go-live runbook — Friday 11 September 2026

Production: Supabase project `bwepvxelvwgwxrnaglrx`, site repository `Chriz93/dcbadmintonclub`,
https://chriz93.github.io/dcbadmintonclub/. Allow about an hour with the admin at the keyboard: steps marked **you**
need your sign-in, your authenticator, or a password only you hold.

Why today: Session 1 is Tuesday 15 September and its vote closes Sunday 13 September at 10:00 PM. Every player must
register, be approved and vote before then.

## A. Before touching anything (15 min, no player impact)

1. **you** Supabase → production project → Authentication → Emails → SMTP settings: enable custom SMTP with the
   league Gmail account and its current app password (the same values as TEST). Without this, sign-in codes are
   rate-limited to a handful per hour and 29 players cannot sign in.
2. **you** Authentication → Email templates → "Magic link": copy the TEST project's template exactly. It must contain
   `{{ .Token }}`, which is the code the site asks for (6 or 8 digits, per the project's setting; the site accepts both).
   Do the same for **"Confirm sign up"**: a player's first sign-in on a project is a sign-up and gets that email, so it
   must show the code too (Supabase's default only has a link, which the site cannot use). Done on production
   September 11.
3. **you** Authentication → Sign in / Providers: Email enabled, sign-ups allowed. Authentication → Multi-factor:
   TOTP enabled. Authentication → URL configuration: Site URL `https://chriz93.github.io/dcbadmintonclub/`.
   Authentication → Rate limits: raise "Rate limit for sending emails" from 30 to 100 per hour, so the whole league can
   get sign-in codes on the same evening (Gmail allows about 500 a day).
4. **you** Settings → API keys: copy the **publishable** key (starts `sb_publishable_`) for step C1, and create a
   **secret** key named `github-jobs` for step E. Never paste either into chat.

## B. Backup (5 min)

In the production SQL editor:

```sql
create schema if not exists backup_20260911;
create table backup_20260911.players as table public.players;
create table backup_20260911.app_state as table public.app_state;
create table backup_20260911.announcements as table public.announcements;
select (select count(*) from public.players) live_players, (select count(*) from backup_20260911.players) backed_up;
```

The two counts must match. Nothing to download: this project's backups cannot be downloaded, Supabase keeps its own
daily backups (Database → Backups, restorable from there), and this copy stays inside the database for the rollback.

## C. Switch over (10 min — the old site stops working at C2, so do C2 and C3 back to back)

1. Build the production site from the tested file (run in the test repository; paste the key at the prompt, not in
   the command history):

   ```bash
   cd /Users/christygeorge/dcbadmintonclub-test && python3 legacy/scripts/build-production.py --out ../dcbadmintonclub
   ```

2. Production SQL editor: paste the whole of `legacy/migrations/PROD_2026-27.sql` and run it. It never deletes
   players or results. It removes anonymous access, which is what stops the old site.
3. Publish the new site:

   ```bash
   cd /Users/christygeorge/dcbadmintonclub && git add index.html sw.js manifest.json .nojekyll && git commit -m "2026-27 season site" && git push
   ```

## D. First sign-in and season start (15 min)

1. **you** Open https://chriz93.github.io/dcbadmintonclub/, sign in with christygeorge993@gmail.com and the emailed code.
2. Production SQL editor: run `legacy/migrations/P00_organizer.sql` (must print `ORGANIZER OK`), then
   `legacy/migrations/verify.sql` (every row `OK`).
3. **you** Reload, open Admin, scan the QR code with your authenticator, enter the code.
4. **you** Last season's final night (Session 8, May 26) was never ended, so first Admin → Session → **End & Save
   Session**: it goes into History with its scores. Then Admin → Tools → Start new season, label `2025-26`. Last
   season's results move into History and every player is asked to register again.
5. **you** Admin → Registered → Invite a player, for anyone new this season. Returning players just sign in with the
   email already on file.
6. **you** As registrations arrive: approve them, then seed courts (Admin → Players).

## E. Reminders on production (10 min)

1. Point the two jobs at production, in the test repository:

   ```bash
   cd /Users/christygeorge/dcbadmintonclub-test && sed -i '' 's|wgolevihkvmosajumzvl.supabase.co|bwepvxelvwgwxrnaglrx.supabase.co|; s|chriz93.github.io/dcbadmintonclub-test/|chriz93.github.io/dcbadmintonclub/|' .github/workflows/legacy-reminders.yml .github/workflows/legacy-backup.yml && git commit -am "Jobs: point at production" && git push
   ```

2. **you** Replace the job key with the production secret key from A4 (paste at the prompt):

   ```bash
   gh secret set SUPABASE_SERVICE_ROLE_KEY
   ```

3. **you** Production project → Integrations → Vault → Add new secret: name `github_dispatch_token`, value = the same
   GitHub token as TEST. This is what lets the database start the email job at once (migration L14).
4. **you** Admin → Tools → "Send a test email to me". The page shows "✅ Done — 1 email sent" within about a minute.
5. **you** When you are ready for players to receive reminders, both switches:

   ```bash
   gh variable set LEGACY_DELIVERY_MODE --body live && gh variable set ALLOW_REAL_RECIPIENTS --body true
   ```

   Session 1's remaining windows: Saturday 8 AM to 8 PM (before the $14 refund cutoff) and Sunday 10 AM to 10 PM
   (before the vote closes).

## F. Smoke test with one real player (5 min)

Invite one of your own `+alias@gmail.com` addresses, sign in with it on a phone, register, approve it from your
account, vote. Confirm the vote shows on admin Home under "Vote changes".

## G. Backup copies on your Mac (once, 1 min)

The daily GitHub job (`legacy-backup.yml`, 7:30 AM) already exports every table; this copies each new file to
`~/MaplewoodBackups` every morning at 9:00 without touching Supabase (see `21-backup-restore.md`):

```bash
sh /Users/christygeorge/dcbadmintonclub-test/legacy/scripts/install-local-backups.sh
```

## Rollback (any time before players register)

1. `cd /Users/christygeorge/dcbadmintonclub && git revert --no-edit HEAD && git push` — the old site is back in a minute.
2. Production SQL editor: run `legacy/migrations/ROLLBACK_reopen_anon.sql` so the old site can read and write again.
3. Only if data must be discarded: restore rows from `backup_20260911`.

## Do not

- Run anything from this runbook against the TEST project by mistake: check the project name in the SQL editor header.
- Set `ALLOW_REAL_RECIPIENTS=true` before the smoke test passes.
- Paste keys or passwords into chat or into a command line; use the prompts shown.
