# Master prompt — finish the Maplewood League 2026–27 rollout

Paste this whole file as the first message of a new session to continue the work with no other context.

## Workspaces

- **Legacy site (the one being shipped)**: `/Users/christygeorge/dcbadmintonclub-test`, branch
  `upgrade/secure-platform`. A single `index.html` (~9,600 lines, inline CSS and JS) plus `sw.js` and
  `manifest.json`. Published by GitHub Pages at https://chriz93.github.io/dcbadmintonclub-test/.
- **Production site**: repository `Chriz93/dcbadmintonclub`, served at
  https://chriz93.github.io/dcbadmintonclub/. **Untouched so far.** Still the old insecure build.
- **`platform/`** inside the test repository is a separate React rewrite that the organizer works on with another
  assistant. **Do not modify anything under `platform/`** except running its Playwright binary.

## How this codebase is changed

Never hand-edit `index.html` for a feature. Write a numbered, asserting patch script under `legacy/patches/`
(`pNN_name.py`) that fails loudly if an anchor is missing, then run it. Database changes are numbered migrations in
`legacy/migrations/` (`LNN_name.sql`), applied to TEST through the Supabase SQL editor and rehearsed locally first.
`legacy/scripts/build-prod-migration.sh` concatenates L01 and L03…L12 (never L02, which is TEST-only synthetic
players) into `legacy/migrations/PROD_2026-27.sql`.

## Verification, all three gates must pass before pushing

```bash
# 1. SQL rehearsal on a local PostgreSQL copy — expect RULES PASS … PHASE8 RULES PASS
export PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH LC_ALL=C
psql -h $HOME/.maplewood/pgsock -p 55433 -U rehearsal -d postgres -X -q -c "drop database if exists legacy" -c "create database legacy"
psql -h $HOME/.maplewood/pgsock -p 55433 -U rehearsal -d legacy -X -q -v ON_ERROR_STOP=1 -f legacy/tests/rules.sql
```

```bash
# 2. Reminder job unit tests — expect 11 pass, 0 fail
export PATH=~/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
cd legacy/automation && node --test
```

```bash
# 3. Browser suite (15 scenarios incl. a 10-session simulation) — expect all passed
export PATH=~/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:~/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH
cd platform && pnpm exec playwright test -c ../legacy/tests/e2e/playwright.config.ts --reporter=line
```

Also run `node --check` on the extracted inline script after any `index.html` patch. Bump `CACHE_NAME` in `sw.js`
on every deploy or phones keep the old build.

## The league rules the code enforces

28 approved Tuesdays 2026-09-15 to 2027-05-18, 8:00–10:00 PM, six courts, 25 regular places, $400 a season,
$20 a spare session, e-transfer to christygeorge993@gmail.com. Six school cancellations are already excluded; if
the school cancels an approved date there is no cash refund (regulars get two shuttlecocks, a paid spare gets $20
back). Everyone votes in the app by **Sunday 10:00 PM** (46 h before play); after that a regular's answer is final
and only the admin can change it. Declining by **Saturday 8:00 PM** (72 h) earns a **$14 refund**. Spares are asked
from Saturday 8:00 PM once a regular declines; seats go in the order spares answer. A vote is attendance: coming
seats you, not coming excuses you with no court penalty, only an unannounced no-show drops a court. Court 6 plays
five players over five games to 15 when all 25 attend; other courts play three games to 21. Winner up, loser down,
one court per session. Elo starts from the seeding court (Court 1 = 1500 … Court 6 = 1000), K = 32, team-average
expectation, mean change per round. Say "the admin", never the organizer's first name, in player-facing text.

## Hard constraints

- Production stays unchanged until the cutover gates in `docs/20-production-cutover.md` are met.
- Never print or commit a secret. Secrets live in GitHub repository secrets and `~/.maplewood/`.
- Do not email or message real players without the organizer's explicit say-so. `ALLOW_REAL_RECIPIENTS` stays
  `false` until they ask for it.
- Do not claim a test passed without running it; do not represent TEST as production.
- Preserve the `.claude` directory and all unrelated work.

## Done so far

Email one-time-code sign-in with an authenticator for the admin; every legacy anonymous grant removed; all writes
behind checked database functions; migrations L01–L12; derived statistics; corrected Elo; registration-first flow
with a payment declaration; invitations from the app; weekly voting with a hard 46-hour lock and an admin override;
automatic spare seats; attendance driven by votes; payment ledger with a refunds list and "Mark refunded";
vote-change log with an admin digest; push notifications; white-and-green light theme; weekly backup export with a
restore generator; hourly-plus reminder job with admin-triggered runs from Admin → Tools.

## What is left

1. **Organizer's own end-to-end test** on TEST, following `docs/23-organizer-test-script.md`. Fix whatever it finds.
2. **Reminder go-live**: set `LEGACY_DELIVERY_MODE=live` (mail goes to the league inbox only), review the messages,
   then `ALLOW_REAL_RECIPIENTS=true` when the organizer says so.
3. **Rotate and tidy credentials**: the old `service_role` JWT and the first Gmail app password were exposed in
   chat. On TEST, disable the legacy JWT keys in Supabase → API Keys → Legacy. Save the current Gmail app password
   in Supabase → Authentication → SMTP for both projects.
4. **Production cutover**: follow `docs/20-production-cutover.md` exactly — verified backup, run
   `legacy/migrations/PROD_2026-27.sql`, deploy with `legacy/scripts/build-production.py --key <publishable key>
   --out ../dcbadmintonclub`, organizer signs in, run `P00_organizer.sql` then `verify.sql` (every row OK), start
   the season, invite the players. Point the two workflows at the production project in the same commit.
5. **Supabase Free plan** once production is stable: `docs/19-supabase-free-plan.md`.
6. **Restore rehearsal**: `docs/21-backup-restore.md` step 3 has never been executed against a damaged table.

## Useful state

- TEST has 33 synthetic players (25 regular, 8 spare), no session history, statistics at zero, Session 1 upcoming.
- Snapshots of the cleared test data: `app_state` keys `snapshot_test_session2_20260910` and
  `snapshot_test_history_20260910`.
- GitHub secrets present: `GMAIL_APP_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`,
  `UNSUBSCRIBE_SIGNING_KEY`. Variables: `ALLOW_REAL_RECIPIENTS=false`, `LEGACY_DELIVERY_MODE` unset (dry run).
- Workflows: `legacy-reminders.yml` every 10 minutes, `legacy-backup.yml` Wednesdays.
