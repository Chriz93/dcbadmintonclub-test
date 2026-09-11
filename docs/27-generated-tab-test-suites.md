# Generated tab suites — 2,800 browser cases and the fixes they drove

Written September 11, 2026 for the TEST site (`upgrade/secure-platform`, https://chriz93.github.io/dcbadmintonclub-test/). Production is unchanged.

## What was added

Every tab, button and selection menu of the legacy page now has its own browser suite of 100 cases, plus 500 cases that cross tabs and people. Each case builds a different league from a seed and checks the page against expectations computed independently of `index.html`.

| Suite (file in `legacy/tests/e2e/tabs/`) | What each of the 100 cases checks |
|---|---|
| `leaders` | order, court label, W/L/win %, badges, live-round tag, the game-history popup |
| `rankings` | every Elo rating against the independent reference, order, summary line, trend |
| `stats` | each card (wins, losses, rate, best court, streaks, climb, absences), the awards banner |
| `sessions` | each finished night court by court: placement, movement arrow, record |
| `history` | rounds and games per night; opening a card shows every game in order |
| `court-history` | one row per player, one cell per finished night |
| `standings` | every Standings tab in random order shows only its own section; Player of the Session |
| `schedule` | 28 Tuesdays, Done / Active / —, the six school cancellations |
| `courts` | gym and list views: every player (five on Court 6), counts, medals, arrows, open slots |
| `scores` | court picker, pairings, saved games, the live score check, saving valid and invalid scores |
| `session` | start (seating from votes), next round, end, reset, cancel, late, absent and replace, rebalance, cascade, attendance |
| `home` | next-session line, countdown, vote card, announcements, Player of the Session, admin checklist, quick buttons |
| `vote` | player Home card (regular, spare, awaiting approval) around the 72 h and 46 h marks, the database lock, organizer overrides |
| `qa` | organizer answers / edits / deletes; players ask; text shown as text |
| `announce` | list, post (each type, validation), delete, Home follows |
| `pay` | totals, balance lines, ledger, $14 refund list, recording every payment type, Mark refunded, delete |
| `registered` | overview, all lists, registration cards, invitations, approve (and the full-league path), reject, promote |
| `players` | court distribution, sync banner, lists, move / bench, absent, remove, call in, add, re-sort |
| `attendance` | counts, courts with votes, spare pool, excused, past nights, marking before and during a session |
| `assign` | the drag-and-drop board with a real mouse drag, full-court refusal (Court 6 holds five) |
| `tools` | Undo after clearing a round, Clear round, test email and vote reminders, snapshots save / restore / delete, export |
| `register` | the three-step wizard with every validation, full-league waitlist, returning player, already registered |
| `admin` | bottom bar, the eight admin tabs in any order, court detail popup, Lock and unlock with the code |
| `interop-1` … `interop-5` | ten journeys × 50 leagues: round advance, end, end then Undo, decline then start, absent then start, payment, refund, player ↔ organizer Q&A, announcement, vote — every read-only tab re-derived from the database afterwards |

Supporting files: `gen.ts` (seeded leagues played out with the rules model), `oracle.ts` (independent expectations), `harness.ts` (one signed-in page per suite, a shared database for two people), `checks.ts` (cross-tab checks). The Playwright project is `tabs` (desktop Chrome).

Run: `cd platform && pnpm exec playwright test -c ../legacy/tests/e2e/playwright.config.ts --project=tabs --reporter=line`

## App defects found and fixed (patch `legacy/patches/p25_tab_suite_fixes.py`)

1. Leaders and Stats counted the final round twice between its automatic rotation and End Session.
2. Courts hid the fifth player on Court 6 (gym and list views) and showed "5/4"; admin labels likewise.
3. Cancel session wiped every earlier session's statistics; now only tonight is discarded and statistics are rebuilt.
4. The waitlist Promote button disappeared at 24 regulars instead of 25.
5. Stats showed award icons before any session was finished (the banner was hidden).
6. Between sessions, Courts listed stored courts, so last week's decliners still held a seat (Court 1 could list six); it now shows next Tuesday's lineup exactly as Start Session will seat it.
7. Mark Late could put a sixth player on Court 6, which has no pairings, so the round could never finish.
8. Late arrivals were never recorded (the list was built on a detached array).
9. A device that saw a session ended elsewhere could not start the next one ("someone else saved newer changes" on every try).
10. The Home countdown froze at its last value once play started.
11. After the 46-hour lock the confirmation still said "You can change your answer above".
12. The Registered tab counted regular places three different ways.
13. Add Player used yet another count; the Players tab's 🚫 claimed success when no session was running.
14. Attendance marked before Start Session was ignored; absent is now not seated (one court down next week), present is seated despite a "not coming" vote.
15. Dropping a player on a full court in Assign removed them from the board (and a later save dropped them from the session); Court 6 holds five.
16. The Record-payment title showed names like "O&#39;Connor".
17. Restoring a snapshot deleted every announcement.
18. A round already rotated into the standings could be cleared, leaving movements with no scores behind them.
19. Players always saw "25 spots left" and the full-league waitlist never triggered (the count used a field players cannot read).
20. The court detail popup showed stored courts and only four players.
21. "🔒 Lock" did nothing: the next render unlocked again. Organizer tools now stay off on the device until the authenticator code is entered.
22. The Attendance tab showed "marked absent / confirmed present" before the mark was saved; it now confirms only after the save.
23. Ending a session straight after the final round's automatic advance recorded no Undo step of its own (it ran inside the advance's step); session steps now wait for the previous step to finish, so each one can be undone on its own.

The patch replays cleanly on the previously committed page and reproduces the working copy byte for byte.

## Test-infrastructure corrections

The mock database now orders results the way the real API does (`order=` was ignored), never reuses an id after a delete, and keeps an explicit id on insert (a restored player keeps their id).

## Limits (stated plainly)

- These are generated, parameterized cases over seeded leagues, not 2,800 hand-written scripts.
- They run against the mock database that mirrors the real rules; the SQL rules themselves are proven separately by the Postgres rehearsal.
- The `tabs` project runs in desktop Chrome; the phone layout is covered by the existing match-night, season and opener suites.
- Registration waitlisting is applied when the organizer approves (the database stores a new sign-up as pending); the player is told they joined the waitlist.

## Results (September 11, 2026, after the last page change)

| Gate | Result |
|---|---|
| Generated tab suites (`tabs` project, desktop Chrome) | **2,800 / 2,800 passed** in one run (12.7 min) |
| Match night, season and opener suites (desktop + phone) | 18 passed, 2 skipped by design (season and opener run once, on desktop), three consecutive runs |
| Automation unit tests (`legacy/automation`) | 13 / 13 |
| SQL rules rehearsal (local Postgres 17) | RULES and PHASE2–PHASE9 pass (no SQL changed in this phase) |
| Patch replay | `p25` applied to the previous commit reproduces `index.html` exactly |

Along the way, full runs also exposed timing races. Two were app defects (22 and 23 above); the others were tests
reading the database before the page had finished saving, and now wait for the save.

## Phase 13 — 1,100 more cases, aimed at what had not run (September 11, 2026)

**How the gaps were found.** The suites can record Chrome's own code coverage (`COVERAGE_DIR=<folder>`, then
`node legacy/tests/e2e/tabs/coverage-report.mjs <folder> index.html`). Before this phase the 2,800 cases ran 219 of 276
named functions and 77.5% of the app's code lines (3,341 of 4,310). The rest of the page — 2,779 lines from
`if(window.location.hash==='#run-tests')` to the end of the script — is an old in-page test runner that only starts
when the address ends in `#run-tests`; it is not part of the app and is excluded from the app figure.

**New suites.**

| Suite | Cases | What it adds |
|---|---|---|
| `phone/home`, `phone/vote`, `phone/register`, `phone/scores`, `phone/courts` | 500 | the player-facing suites again at iPhone 13 size with touch (`tabs-phone` project) |
| `round-complete` | 100 | the Tuesday-night path: saving the last court (game by game or "Save All") advances the round by itself, or readies the session to end after round 2 |
| `toss-birds` | 100 | top and bottom ties, the toss popup (Cancel, Redo), the next round moving exactly the chosen player; shuttle hand-out reaching History and Stats |
| `admin-extras` | 100 | private notes, editing a registration, adding from the court popup, the sync banner, withdrawing an invitation, the present / absent tag |
| `vote-changes` | 100 | the admin Home list of vote changes (after-deadline and by-admin marks) and an override appearing at the top |
| `my-season` | 100 | a player's own season card and share image |
| `season-rollover` | 100 | archiving the season (label rules, refusals) and the full reset, with every tab re-checked |

**Defects found and fixed (patch `legacy/patches/p26_gap_suite_fixes.py`).**

24. The admin-note title showed names like "O&#39;Connor".
25. My season told a player who declared "paid in full" that the fee was owing, with the e-transfer address; it now says the payment is reported and waiting for the admin.
26. Stats (and the season PDF) always counted 0 shuttles: they read the per-court hand-out as if it were per player.
27. Adding a player from the court popup to a full court took them off their own court before refusing.
28. A player could be stranded alone on an empty court. The bottom player of a court moved down whenever the court was not
    Court 6 — even into an empty court — so with, say, 6 players (Court 1: 4, Court 2: 2) round 2 had one player alone on
    Court 2 and one alone on Court 3, and neither could play. It happened every round whenever the turnout left the last
    occupied court with 2–3 players (17–20 attending, for example); a full 25-player league never showed it. Now a player
    moves down only if the court below has players — the last occupied court is the bottom court — in the rotation, End
    Session, the projected next round, the round tracker and the court tally (patch `p27_no_stranded_player.py`; the test
    rules model follows the same rule).

**Results (after patches p26 and p27).**

| Gate | Result |
|---|---|
| All generated suites (`tabs` 3,400 + `tabs-phone` 500) | **3,900 / 3,900 passed** in one run (22.2 min, with coverage recording) |
| Match night, season and opener (desktop + phone) | 18 passed, 2 skipped by design, two consecutive runs |
| Automation unit tests | 13 / 13 |
| SQL rules rehearsal | RULES and PHASE2–PHASE9 pass |
| Coverage of the app's code | **244 of 281** named functions, **86.2%** of lines (3,717 of 4,313) — up from 219 / 276 and 77.5% |

Still not exercised by any browser test: files the page makes for you (season PDF, waiver export, share and copy
summaries), phone push notifications, signing out, linking a waiver to another player, promoting from the waitlist, and
legacy helpers no button reaches any more (`undoRound`, `undoScore`, `saveAssignments`, `changePin`, `toggleMembership`,
`handleAbsentPlayer`, `startRealtime`).

## Instant email (September 11, 2026) — migration L14, patch p28

GitHub's own timer for the reminder job ("every 10 minutes") actually started it 2–5 hours apart, and the Tools buttons
only queued a request for it. Now the database starts the job through GitHub's API:

- `public.dispatch_reminder_job()` (organizer only, or the database's own timer) posts a `workflow_dispatch` for
  `legacy-reminders.yml`, using a fine-grained GitHub token kept in Supabase Vault as `github_dispatch_token`.
- A Supabase timer (`pg_cron`, job `maplewood-reminders`) calls it every 10 minutes, on time.
- Tools → "Send a test email to me" / "Send vote reminders now" start the job at once and show "✅ Done — N emails
  sent" when it reports back (a manual start took 14 seconds end to end). Without the token they fall back to the
  timer and say so.

Rehearsal PHASE10 proves only the organizer or the timer can start the job; the Tools suite (100 cases) runs against
the new behaviour. L14 is included in `PROD_2026-27.sql`; production needs the same Vault secret.

## Final deep check (September 11, 2026) — 26 regulars, 1,570 database cases, L15, backups

**League rules in the app (patches p30, p31, p32).** 26 regulars. Courts hold four; extra players become a fifth player
on the bottom courts (Court 6, then 5, then 4), and a court of five plays five doubles games to 15 with each player
sitting out one. Every session is two ladder rounds, then free play. With fewer than 24 playing nobody is seated alone:
a single leftover joins the court above as its fifth player (before, 21, 17, 13, 9 or 5 players left one person alone
on the last court); two or three left over still play singles, as the registration rules say. Home now also lists the
no-deuce scoring (21, or 15 on a court of five, even at 20–20) and the late-arrival rule.

**Database tests (`legacy/tests/db`, run with `sh legacy/tests/db/run.sh`).** A fresh copy of the schema on the local
Postgres, every migration (with the existing rules phases), then 1,570 generated cases, each rolled back:

| Family | Cases | What it proves |
|---|---|---|
| Table access matrix | 523 | read, add, change, remove and empty (TRUNCATE) every table as anonymous, a player, a spare, a stranger, the organizer with and without the second factor, and the job key; the public roster hides every private column |
| Voting | 270 | only your own answer (the organizer may answer for anyone); regulars locked from Sunday 10 PM, spares never |
| Scores | 260 | court, round, game number, 21/15 target, no tie, winner flag, the players named must be that court's, stale screens refused |
| Payments | 100 | the paid flag follows the ledger (season + adjustments ≥ $400; any spare fee for spares; refunds never unpay) |
| Registration | 110 | invitation, verified email, length limits, declared payment, no second record for a returning player |
| State, spares, reminders | 155 | versioned writes and retired keys; spare seat order and confirmation; who the reminder job may email |
| Statistics, undo, rollover | 101 | rebuild from stored scores; undo steps and its season boundary; the new rollover ledger rules and labels |
| Everything else | 51 | real asker names, profile, push, email opt-out, admin status, instant email, internal functions not callable |
| **Total** | **1,570** | |

A negative control re-opened three of the holes below on a copy; 134 cases failed exactly where expected.

**Defects found and fixed in the database (migration `L15_hardening.sql`, applied to TEST, included in
`PROD_2026-27.sql`).**

29. A signed-in account with no player record could answer the vote for any player.
30. A player could save games naming players from other courts, or game numbers a court does not play.
31. Players could still change their own vote directly in the table after the Sunday 10 PM lock (the site never does;
    the table allowed it). Votes now go only through `set_rsvp`.
32. The asker's name on a question came from the browser; it now comes from the player record.
33. The season rollover would have been refused on Supabase (its safe-update guard rejects a bulk delete without a
    WHERE clause), and it left last season's payments counting toward next season's fee and last season's reminder log
    blocking next season's reminders. Old payments now move to an organizer-only `payments_archive` (p31 says so on
    screen).
34. Supabase's default privileges gave signed-in users TRUNCATE and other unused rights on several tables; every table
    now has exactly the rights the site and the jobs use.
35. Security Advisor warnings: `my_email()` search path, `pg_net` in the public schema, two trigger functions callable
    directly. The one remaining advisor error (`players_public` is a security-definer view) is the design: it shows the
    roster without contact details. The remaining "signed-in users can run security-definer functions" warnings are
    the site's own database functions, each of which checks who is calling.

**Backups.** Daily at 7:30 AM (was weekly), every table including `rsvp_log`, `payments`, `payments_archive`,
`push_subscriptions` and `season_dates`. The restore helper restored invitations, organizers and season dates on the
wrong key and used `disable trigger all`, which Supabase refuses; both fixed, with unit tests, and a local drill damaged
13 of the 14 tables and restored all 14 exactly. `legacy/scripts/install-local-backups.sh` copies each day's file to
`~/MaplewoodBackups` without touching Supabase.

**Results (final code: patches p30–p32, migration L15).**

| Gate | Result |
|---|---|
| Generated tab suites (`tabs` 3,405 + `tabs-phone` 500) | **3,905 / 3,905 passed** (19.6 min) |
| Match night, season and opener (desktop + phone) | 18 passed, 2 skipped by design |
| Database cases (`legacy/tests/db`) | **1,570 / 1,570**; negative control 134 failures where expected |
| SQL rules rehearsal | RULES and PHASE2–PHASE11 pass |
| Automation unit tests | 16 / 16 (3 new for the restore helper) |
| Restore drill (local) | 14 / 14 tables identical after restore |
| TEST database after L15 | `verify.sql` 25 / 25 OK; function bodies match the rehearsal; timer still reaches GitHub |
| Patch replay | p30 + p31 + p32 applied to the previous commit reproduce `index.html` exactly |
