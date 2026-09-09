# Connected product release — 9 September 2026

This is the current handover. It supersedes the pending-integration statements in documents 14–22. The connected product is deployed in the **Preview** environment of the existing Cloudflare TEST project. It is not a production launch.

- App: https://league-release.maplewood-league-test.pages.dev/
- Narrated, interactive practice session: https://league-release.maplewood-league-test.pages.dev/?demo=game-day
- Source: `platform/` on `upgrade/secure-platform`, in `Chriz93/dcbadmintonclub-test`.
- Backend: TEST Supabase `wgolevihkvmosajumzvl`. Production database `bwepvxelvwgwxrnaglrx` and the old public GitHub Pages site were not deployed to.

## Delivered player experience

| Where | What works |
|---|---|
| Sign in | Email code, then player details → season agreement → approval. Closed regular registration stays closed. Guardians have a separate signing path. |
| Home | Current court, next game/partner/opponents or rest, official ELO, season results, published movement, RSVP and previous matches. |
| Courts | Six-court gym and list views; all five players and rest turns on a five-player court; round completion counts; clear up/down/stayed movement history; large gym display; copy summary. |
| Scores | Players submit their own unscored matches. Saved results require a correction request; Christy can make an audited correction. Stale submissions cannot overwrite another result. |
| Standings | Leaders, ELO rankings, statistics, sessions, game history and court journey. Player search preserves actual rank. Every member can open every player's badminton profile. |
| Player profile | ELO chart and per-round changes, wins/losses, streaks, partners, complete recorded match history and final court journey. Contact/payment/consent information is excluded. |
| Help | Member questions, private pending questions, published answers and administrator resolution. |
| Administration | Players, Payments, Sessions & seeding, Setup, History & privacy. Separate match-day controls preserve check-in, assignment, correction, movement, restart/undo and audit functionality. |

Views refresh every 15 seconds and on return to the page. Refresh preserves unsaved scores and offers an explicit discard/reload action. Failed refreshes keep the last readable data while blocking changes. Small screens, keyboard use and light/dark contrast were checked. The home screen has one main title before its section headings.

## How a night runs

1. Christy reviews RSVP, confirms spare bank payments, and records actual attendance. No response by itself never becomes a no-show.
2. Publish the reviewed starting court plan. With 25 players and six courts the plan is 4/4/4/4/4/5. Initial seeding is only for approved, signed registrations; new ELO starts from that seeding.
3. Players open Home or Courts to see their court and next game. Four-player courts play three partner rotations to 21; a five-player court plays five games to 15, each player resting once. Scores are first-to-target with no extended deuce.
4. After games, participants enter results in Scores. A round is ready when **all scheduled games on all courts have valid saved scores**. The app shows a per-court count; there is no silent automatic advance.
5. Christy reviews and publishes the next movement. Up/down/stayed lists appear immediately after refresh. Wins percentage, then normalized points percentage, then stable player ID resolve placement ties. Adjacent exchanges preserve every player and court capacity.
6. At the final round, use **Review final placements**, make any justified adjustments, enter a reason and publish. Final placements are stored separately from the courts where games were played. Publication checks the session revision AND every reviewed score revision, so a concurrent correction forces a new review.
7. Closing the session makes its ELO official. ELO uses team-average expected scores, a 400-point scale and K=32, frozen at each round's start; each player's average game delta determines their round change. Correcting an older completed game replays later ratings chronologically. Restart and undo preserve final-placement evidence.

The four-round rehearsal is an illustration, not a fixed requirement to play four rounds. The permit requires play to finish by 22:05 and departure by 22:15, Toronto time.

## Confirmed operating policy

- 25 regulars; $400 season; $20 spare. Spare priority follows completion of both RSVP and verified payment, subject to space. A typed reference does not prove receipt of funds.
- At least 72 elapsed hours' absence notice qualifies for $14. Confirmed no-show means one court down, with administrator correction available.
- School/facility cancellation: eligible regulars receive **two physical shuttlecocks, no cash**. Confirmed paid spares receive **a full $20 refund**. The ledger records a pending refund for administrator reconciliation; it does not transfer money automatically.
- Organizer: **Christy**, personally. No minimum participant age. Every under-18 participant needs the separate verified guardian process. Agreement acceptance is season-specific.

Migration 037 updates future agreement terms. In remote TEST, hashes of all published waiver rows and signature receipts were compared before/after and remained identical. No real legal agreement was signed or silently rewritten in this release. Reviewed liability text still needs to be published before real participant signing.

## Verification evidence

- **1,190 tests in 22 files passed** on patched Vitest 4.1.11, including the requested 500 movement scenarios, 145 round/database cases and 53 new connected-experience cases.
- **78/78 desktop/mobile browser cases passed** in one full run. The final home-heading/accessibility refinement passed again on both device projects. These browser cases use mocked API responses; they are not independent real Auth tests.
- TypeScript, ESLint and the compiled TEST build passed. Startup payload is approximately **199.2 KiB gzip**, within the 220 KiB limit. The build checks for server-secret markers.
- The development-only Vitest advisory [GHSA-82fw-gwwq-j7x9](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9) was patched by upgrading Vitest and coverage-v8 together. The subsequent dependency audit reported **no known vulnerabilities**.
- Vitest 4's coverage report: 96.98% statements, 93.64% branches, 97.92% lines, **for the configured domain/config scope only**, not the whole application. Its instrumentation differs from earlier reports.
- Separate real local PostgreSQL connections: one winner/one stale score conflict; last-spare-place race safely reconciled; concurrent import/correction without deadlock; 90 unique email leases across six workers.
- Encrypted synthetic backup restored into a separate local database: **48 table hashes matched**, anonymous private reads denied. Artifact `/tmp/maplewood-pg-X2U65T`; encrypted archive SHA-256 `739262927d70202b817e93fbb6fb019139f92bda43a90f42ea93a25dae27c744`. This does **not** establish recovery of the actual remote database.
- Remote TEST migrations **032–037** were applied and checked. The existing September 8 synthetic club has **25 players, 80 scored games, 100 rating events and 25 final placements**. No player notices were sent.
- Real first-time and returning-account login codes were delivered to the league inbox and successfully verified. Both TEST Auth templates now use Maplewood branding; the template is preserved in `platform/scripts/auth-email-template.html`. The uninvited account first saw closed onboarding, with no privileged navigation. A normal-member viewer membership was then added **only** to the synthetic rehearsal club; it creates no real player registration, payment, seeding or signature. Hosted court/profile reads succeeded with that actual Auth session; admin controls were absent.
- Hosted final movement counts: 5 up, 5 down, 15 stayed. TEST Player 20's real profile showed 12 games, 8–4, ELO 1075.0 → 1107.1, and final Court 1, while preserving the court of each played match.

## Deployment evidence

Cloudflare project `maplewood-league-test`, Preview branch `league-release`. Final upload contains only 26 compiled public files, including demo narration; no environment files, source database records or private credentials.

- Bundle SHA-256: `a00c1ce451e21f24562924aa52a230a98f5e65a95e95ac26dae60211399659a1`
- Entry asset: `index-kum_EBKT.js`; app asset: `App-BpwicT68.js`. A fresh hosted demo reported that exact entry filename, and a rebuild after the dependency update matched every public ZIP file byte-for-byte.
- The TEST main deployment and legacy production were not replaced. The earlier automatic approval rejection concerned Cloudflare's Production selection; the successful upload used Preview.
- Future automation is explicitly opt-in using `ENABLE_TEST_DEPLOY=true`; it targets `--branch league-release` and Preview secrets. See [Cloudflare Pages CLI reference](https://developers.cloudflare.com/workers/wrangler/commands/pages/). Private configuration remains deferred.

## Deferred or still required for production

1. **Free reminders:** Christy explicitly deferred private Gmail setup on September 9. GitHub has `UNSUBSCRIBE_SIGNING_KEY`, but Gmail worker/service-role and Cloudflare deployment credentials are not configured. `ALLOW_REAL_RECIPIENTS=false`. Static direct upload does not deploy the unsubscribe function. Configure the worker, Preview function bindings and scheduler, verify a reminder plus unsubscribe, then explicitly enable intended recipients. No SMS subscription, paid mail service or personal Messenger polling was activated.
2. **Actual remote recovery:** the TEST dashboard shows physical daily backups, latest checked `2026-09-09 05:27:39 UTC`; the displayed controls restore the existing project. No download control was offered. Do not use an in-place restore for acceptance. Use a privately configured database connection for an encrypted logical backup and isolated restore; verify Storage objects separately.
3. **Final account acceptance:** the new live member-read/login check supplements the earlier organizer checks. The complete independent real member/guardian/admin signing, scoring, expiry and concurrent-client acceptance matrix still needs controlled accounts; SQL synthetic claims and mocked browser tests do not prove those flows end to end.
4. **Reviewed agreement:** publish the reviewed liability body with its review reference. Operational policy confirmation is complete; legal review/publication is not inferred from it.
5. **Production cutover:** complete those gates and reconcile the real roster/legacy identity mapping before using the earlier conditional launch approval. Initial seeds follow registration and signing.

New email allowance: at most four messages to `maplewoodbadmintonleague@gmail.com` only. **Two used** for successful first-time and returning-account login checks; no reminder or unsubscribe emails sent. Do not send to players or the personal inbox under that allowance.

## Sensible later enhancements

Keep registration and game-night screens short. The delivered stats/profile screens already contain the most useful legacy features. Optional later work: a coloured court-history heatmap, device push notifications with consent, easier season rollover, and printable courtside summaries. These are not launch prerequisites or promised free SMS.

## Reproduce locally

From `platform/`, using Node 24 and pnpm 11.19.0:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm test:coverage
pnpm exec tsc -b
pnpm exec vite build --mode test
node --experimental-strip-types scripts/check-build.ts
```

The TEST build reads `.env.test.local` with publishable values only. `pnpm build --mode test` does not pass the mode flag to Vite in the chained package script; use the explicit command above. For browser tests, run the default dev server on 5173, the TEST-mode dev server on 5174 and the default compiled preview on 4173, then `pnpm test:e2e`. CI configures these servers itself. Run `node --experimental-strip-types scripts/postgres-rehearsal.ts` for the disposable local database exercise.

Concurrent edits to the repository-root legacy client and `legacy/` were observed during this release. They are not part of the platform release or its deployment and were left intact.
