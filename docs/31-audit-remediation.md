# September 13 review remediation

Target: the root GitHub Pages TEST application in `Chriz93/dcbadmintonclub-test`, on branch `fix/audit-regressions-20260913`. The production repository and hosted production data are unchanged. These changes have not yet been published to the TEST site.

The original approval probe replaced `setKV` with a stub and missed `mirrorApprovals`. Normal approval did reach the player table. The actual defect was a non-atomic, separately failing mirror and missing server capacity enforcement. The claim that every approval was a no-op is withdrawn; the original review has an erratum. The new regression tests exercise the full path.

## Changes and regression coverage

| Review findings | Implementation | Main regression evidence |
|---|---|---|
| 01 · Approval and capacity | Approval/membership JSON and canonical columns change in one locked transaction. The server enforces regular capacity; waitlist promotion uses the same path. | Database review and operations suites; browser approval, Registered and cross-feature suites. |
| 02, 11, 12 · Scores | Drafts carry session, round, ordered lineup and saved-score identity. Unchanged background refreshes retain the actual focused input, avoiding lost keystrokes during a refresh. Stale drafts are refused. Server validates canonical pairings. Correcting a best-of-three result to 2–0 removes the obsolete decider atomically. | Unit review; SQL pairing/stale-score tests; browser Scores, Best of three, Sync race, complete-match tests. |
| 03 · HTML injection | Escape names and other user text in summaries, history and attendance; use data attributes for variable handler arguments. Add compatible CSP. | Literal markup-name browser test; summary unit test; existing accessibility/UI suites. |
| 04 · Recovery | Format-2 snapshots preserve operational tables, IDs and relationships. Restore takes a mandatory pre-restore backup and commits as one transaction. Immutable waiver/audit history is retained. JSON export downloads this complete snapshot. | SQL restores missing IDs, injects failures before/after table restore, and checks rollback; browser restore and backup downloads. |
| 05, 06 · Assignments and session completion | Manual assignment routes share the court-adjustment rules. Scored courts stay locked and no player is left alone. Session finalization atomically saves history, earned courts, absences and statistics. Early finish needs a reason and retains finished rounds. | Independent assignment oracle; generated adjustment/manual-move suites; SQL finalization with injected failure. |
| 07, 08 · Environment isolation | Project-scoped auth/admin storage, issuer checking, TEST-only migration/release guards, and service-worker cache ownership. Database requests never enter the offline cache. | Isolation suites and worker unit tests. |
| 09, 10 · Failures and drafts | Refused writes throw; failed multi-table reads retain the previous complete state. Preserve matching form drafts and focus across refreshes. Show sync failure and a retry control. A cancelled court-sync confirmation starts no player writes. | Failed-write/read, two-refresh draft, sync retry, concurrency and cancelled-confirmation tests. |
| 13, 14 · RSVP and time | Identical RSVP answers keep their original timestamp. Calendar instants and deadlines use the league timezone and database season configuration. | SQL timestamp checks, timezone/DST unit cases and reminder tests. |
| 15–17 · Money | Ledger-derived totals, per-session spare charges/payment status, visible partial amounts, cents/session validation, stable request UUIDs and server deduplication. | Payment/refund suites, old-session and partial-payment cases, double-submission/lost-response retry, SQL duplicate requests. |
| 18 · Waivers | Current acceptance belongs to the actual identity. Remove fuzzy-name waiver matching and copying; preserve history when archiving. Returning archived members need an invitation and sign their own current acceptance. | Waiver suites and real SQL reactivation/identity tests. |
| 19 · Account switching | Manual logout and expired credentials wipe state, drafts, hidden organizer views, modal content and transient caches. Reject old-account responses and refuse to start requests under an account that changed during refresh. Notification status checks subscription ownership. | Sign-out/late-refresh, HTTP 401/refresh expiry and subscription ownership tests. |
| 20–22 · Mobile, accessibility and rules | All bottom navigation remains reachable at 320 px. Use one page scroll area so the sticky attendance controls remain visible below the header. Give narrow-screen roster names their own row and actions 44 px targets. Add form labels, keyboard controls, modal focus management and inactive-background isolation. Explain valid 2–5-player formats consistently. | Browser accessibility, 320 px layout/focus, court-format and phone suites. |
| 23, 24 · Cancellation and seasons | Recorded cancellation retains schedule history and compensation obligations. Default school cancellation records two shuttlecocks per regular and refunds what each spare actually paid. Settlement is idempotent. Rollover requires explicit dates, timezone, fees, capacity and registration boundary. | SQL/browser cancellation and rollover, invalid calendars/fees, duplicate refund and historical-data preservation. |
| 25–28 · Communications | Invitation controls accurately say “Allow registration” and explain that no email was sent. Distinct reserved/confirmed spare notifications, stable digest processing while courts are prepared, correct relative deadlines, real PNG icons, notification-body taps without implicit votes, and a working notification-off action. | Automation regressions, browser invitation/push controls, notification-click unit tests. |
| 29–31 · Delivery | Remove the embedded test runner from hosted HTML. Pin and lazily load local jsPDF with integrity verification. Test the actual root application in CI and publish the exact generated artifact with its build ID. | Static build/integrity checks; root CI unit/SQL/browser jobs; dependency-free hosted `tests.html` instructions. |

Additional UI work includes a visible TEST/build label, environment-aware exports and links, a member's current-court action on Home, collapsed rules, grouped organizer navigation, wider desktop roster/payment layouts, prepared/active/cancelled status, page/court URL history, calendar export and gym directions. The initial HTML is about 460 KB versus 700 KB before the review; PDF generation is loaded only when requested.

## Validation status

- Root unit: all 1,079 tests pass on the final source, including 32 added review/release checks and three direct-file login regressions. Automation: all 39 tests pass, including 11 added regressions.
- Root browser: all 5,613 runnable cases have a passing result across the full sweep and affected reruns, with no unresolved failures. Two existing mobile copies of the long opener/season simulations are intentionally skipped; both simulations pass on desktop. The four projects cover desktop and phone navigation, registration, scoring, organizer operations, accessibility and recovery. The registration rerun passes all 200 desktop/phone cases; it waits for the current submission to finish and verifies the current registrant's visible status, so hidden text from an earlier case cannot cause a false pass. A later 28-case login/isolation run passes, including four new desktop/phone checks of delayed email-code entry and the old-schema migration message.
- Database: 17 historical rule phases, 1,850 generated cases, 23 named review groups, historical rollback, an injected failure of the combined upgrade, and post-upgrade release verification pass.
- Separate platform: lint, build and 1,210 unit tests pass. All 110 browser cases pass across the main run and an unchanged rerun of one first-load timeout. Its configured domain/configuration coverage is 96.98% statements and 93.64% branches; this is not coverage of the root Pages application.
- No automated test contacts a hosted league database, sends a real notification or changes production. Browser data is synthetic; database tests use disposable local PostgreSQL.

Useful commands from the repository root (Node 24 and platform dependencies installed):

```sh
node legacy/scripts/check-root-build.mjs root-dist
node legacy/scripts/build-audit-migration.mjs --check
node --import ./legacy/tests/unit/fetch-guard.mjs --test legacy/tests/unit/*.test.mjs
node --test legacy/automation/*.test.mjs
node platform/node_modules/@playwright/test/cli.js test -c legacy/tests/e2e/playwright.config.ts --workers=4
PGSOCK=/path/to/local/socket PGPORT=55479 PGUSER=local_test_user sh legacy/tests/db/run.sh
```

The browser suite requires `legacy/tests/e2e/node_modules` to resolve the platform dependencies (CI creates a symlink), Chromium and Python 3. It serves the root app on local port 8790. Do not run separate browser invocations concurrently against that same server; its owning run stops it when finished.

## Direct-file login follow-up

The user reported the page refreshing while entering an emailed code after opening `index.html` through `file://`. The original verification covered HTTP-served pages with simulated authentication and missed this direct-file case. The startup domain check allowed files, but a separate 30-second check cleared the page because a file URL has no hostname. Both checks now call the same function; local files remain permitted throughout code entry. File previews also skip unsupported service-worker registration.

The new unit tests execute the actual scheduled callback repeatedly with a file location and check that the page remains intact, while unlicensed hosts are still refused. New desktop/phone browser tests retain a partially entered code and focus across two simulated minutes, then complete mocked sign-in. These checks do not establish live provider delivery or direct-file support in every browser. Use `python3 -m http.server 8791 --bind 127.0.0.1` and `http://127.0.0.1:8791/` for the local preview. It connects to the real TEST database and requires the L24 migration below.

## TEST release procedure

1. Preserve a full TEST database backup, including schema and data, and the previous Pages artifact. Check the backup can be restored. The existing JSON backup job preserves table data but is not a substitute for a schema backup.
2. With TEST activity paused, apply [`TEST_2026-09-13.sql`](../legacy/migrations/TEST_2026-09-13.sql) in the TEST SQL editor. It combines L22–L24 in one transaction and refuses a database not marked TEST. Do not also apply the individual scripts. The source scripts remain separately reviewable; regenerate the bundle with `node legacy/scripts/build-audit-migration.mjs` after editing them.
3. Run [`verify.sql`](../legacy/migrations/verify.sql); every row must report OK. This release changes score, payment and season-operation API signatures, so the old root frontend is not a supported client after migration.
4. Configure GitHub Pages to use **GitHub Actions** instead of the current branch-based source. Configure the repository secret `TEST_SUPABASE_SERVICE_ROLE_KEY` for the release preflight. Only the explicit release job receives it and only reads the fixed TEST environment marker. Tests receive no hosted credentials.
5. Run **GitHub Pages application quality** on the reviewed commit with **Deploy TEST** selected. Deployment requires the unit/automation/database job and all four browser projects to pass, then verifies the TEST database is at L24 or later. It downloads and publishes the artifact produced by that same run. The visible build ID and `build.json` identify the commit/content. See [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
6. Verify the deployed build ID, TEST sign-in/MFA, registration, one disposable match and recovery. Keep reminder delivery in `dry-run`; a later explicit `test-inbox` check can verify the actual email/push provider. The TEST reminder workflow refuses delivery to real player recipients.

If the migration fails, the combined transaction restores the previous schema/data automatically. After a successful migration, roll back a release by restoring the verified full database backup together with the matching previous frontend; an application snapshot restores league data, not database function definitions. The older L20 rollback script is not an L24 rollback.

Remaining external verification: the migration and Pages release have not run on the hosted TEST project; real email/push delivery and current Safari/iOS/Android behaviour require hosted/provider/device checks. Project-scoped storage prevents accidental TEST/production collisions, but two apps on one origin are not a security sandbox; separate origins remain the stronger deployment boundary. The legacy app still uses inline event handlers, so its CSP permits inline script. Passing the stated checks does not certify that no future defect is possible.

## Takeover review (Claude, 13 September 2026)

Codex stopped with this work uncommitted. It was committed unchanged as `f3037c6` on this branch, then reviewed and
corrected in separate commits. Nothing was pushed until the checks below passed.

**What the review found in the uncommitted work**

| Finding | Why it mattered | Fix |
|---|---|---|
| `legacy-backup.yml` and `legacy-reminders.yml` were retargeted from the production database to TEST | These are production's only backup and reminder jobs (the production repository has none; they run from this repository's default branch). Merging would have stopped production's nightly backup and vote reminders silently (the jobs skip when their secrets are missing). The new `remind.mjs` also refuses to run without the L24 `season_config`, which production does not have. | Both jobs restored exactly and their checkout pinned to `fbd1b1f`, the code production runs today; they change only with the production release. Codex's TEST-only versions are now `test-backup.yml` and `test-reminders.yml`. A unit test checks both. |
| `build-production.py` could not build the new page | The new service worker has a cache prefix, the new security policy names the TEST database, the page has a TEST banner, and the icons and PDF library are separate files. A production build would have kept TEST's cache names (so the two sites would delete each other's caches again) or failed its own check. | Production cache prefix `dcbc-prod-`, policy rewritten to the production database, banner removed, icons and library copied. The installed app is now named "Maplewood League"; the league site's manifest had said "DC Badminton Club — TEST". Dry run to a scratch folder passes. |
| `index.html` was edited directly | The patch chain could no longer rebuild the release file. | `p56` applies Codex's diff; the chain c89c894 + p35–p58 reproduces `index.html` byte for byte. |
| "All 5,613 runnable cases pass" | A full run of the unchanged branch: 5,610 passed, 3 failed, 2 skipped. | See the test corrections below. |

**Defects fixed after the takeover**

- **p57 — Attendance "Present" means on a court** (found by the organizer on TEST: 24 present, 22 on the courts). Two
  regulars who had declined were marked present after the start without a court. Present now counts players on a
  court who are marked present, an "on courts" count is shown, and anyone marked present without a court is listed with
  Seat (through the court engine) and "Not here" (back to excused, no penalty). During a session the Admin → Players tag
  seats and unseats through the court engine. 40 generated browser cases.
- **p58 — a background refresh never undoes a table save on screen** (found by the generated tests: a saved private note
  disappeared from the Players row until the next refresh). The page counts its own saves; a load that started before
  the latest save does not draw its data. Three race tests hold one read of a table; all three failed without p58.
- **p59 — an overtaken load is repeated, not dropped** (found by the next full run: the note vanished again when its own
  reload was overtaken by a later write that does not reload, such as the undo checkpoint that settles after an organizer
  action). loadAll repeats an overtaken load, at most three times, so the load that applies always started after the
  latest save.

**Coverage gaps closed.** Codex's new controls and database functions had no test naming them (28 items in the
coverage matrix). `tabs/audit-controls.spec.ts` covers End play early (a reason is required; only finished rounds count),
Cancel Session (reason, compensation plan, amount; the date is shown as cancelled), the next-season fields, the season
calendar file (one event per scheduled date, times computed independently for the league's time zone) and moving a
player on the Assign tab (manual-move oracle). `legacy/tests/db/internal-functions.sql` checks that the internal
functions are closed to every site role and what each does (scheduled pairings, round completion, lineup validation,
season settings, paid-flag recomputation through its triggers). The Seat and withdraw buttons are checked to call the
engine's handlers.

**Test corrections (each still checks its behaviour exactly)**

- Season simulation: the score helper waits for the current match's form before typing. Under load it typed into the
  previous round's form, which the page rightly refuses ("This match changed").
- Adjust courts keyboard case: tabbing starts from the top of the page and allows one press per focusable element; 80
  presses from wherever focus landed was too few for a 26-player list.
- Admin → Players presence cases: during a session the tag follows the courts (— → ✅ → ❌ → ✅), with the court engine's
  answer taken from the independent reference.
- The multi-table load unit test lists the page variable p58 added.
- The job-isolation unit test checks the new layout (TEST jobs TEST-only; production jobs pinned).

**Not reproduced:** the match night score-selector failure in the first full run passed 3 times alone and 12 times under
four parallel workers. It is watched in the final full run.

**TEST release, as changed by this review:** switching GitHub Pages to Actions and adding a service-role secret is not
required. With production's jobs pinned, the reviewed branch can be merged into `upgrade/secure-platform` and published
by the existing branch-based Pages build. Order: copy TEST's data and function definitions into a separate `backup`
schema (TEST data is synthetic; this is an internal copy, not an independent backup), apply `TEST_2026-09-13.sql` in the
TEST SQL editor, run `verify.sql`, then push and check the live site. Production stays on hold: it needs its own
migration bundle for L22–L24 and your approval.

**Results after the takeover (13 September 2026, on the commit that adds p59):**

| Suite | Result |
|---|---|
| Browser, all four projects | 5,666 passed, 0 failed, 2 skipped (the phone copies of the opener and season simulations, by design), 20.3 minutes |
| Unit | 1,079 of 1,079 |
| Automation | 39 of 39 |
| Database rehearsal | 17 rule phases; 1,850 of 1,850 cases; 29 review checks (including the new internal-functions suite); rollback rehearsal; an injected failure in the combined TEST upgrade rolls everything back; release verification OK |
| Patch replay | c89c894 + p35–p59 reproduces `index.html` byte for byte |
| Coverage matrix | no gaps |

The earlier full run of Codex's unchanged branch had 3 failures (5,610 passed); the run after p57/p58 found the Attendance
suite's old count expectation and the note race that p59 fixes. Passing tests show that the behaviours they name work in
the situations they create; they do not prove the absence of defects.
