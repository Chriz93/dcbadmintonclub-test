# Fix-to-test traceability

Every fix in this release is covered by at least one test that fails if the fix is undone or broken again. This table
says which. docs/29 is the item-level matrix (every page, tab, control, form field, rule sentence, download, database
function and table, and the tests that name it); `legacy/tests/unit/coverage-gate.test.mjs` fails whenever that
matrix has a gap. The button census (`tabs/buttons.spec.ts`, `tabs/phone/buttons.spec.ts`) clicks every usable
control in every recorded state and fails when a control does nothing, throws, answers only "not available", or is
shown without being in the census.

Passing tests show the behaviours they name work in the situations they create. They do not prove there are no
defects.

## The organizer's reports and the fixes they led to

| Fix | What was wrong | Tests that cover it |
|---|---|---|
| p54 — starting courts keep the earned courts | Before a session the Courts page re-ranked everyone four to a court: declines moved players up, spares landed on Court 6, and Admin → Players disagreed | `unit/lineup.test.mjs` (named cases, the organizer's TEST situation first, and 200 generated leagues); `tabs/lineup.spec.ts` (200) and `tabs/phone/lineup.spec.ts` (80): the Courts page, the explanation card, Admin → Players, court details, the WhatsApp message and Start Session all agree with the independent reference `unit/starting-reference.mjs`; `tabs/seating.spec.ts` (33) |
| p55 — a night of 2 to 30 players is never refused | A lone player next to full courts made Start Session refuse a valid night | `unit/lineup.test.mjs`: five named cases and 300 "never stuck" leagues (refused exactly when fewer than 2 or more than 30 are coming) |
| p57 — "Present" means on a court | Attendance showed 24 present with 22 on the courts | `tabs/attendance-count.spec.ts` (40, refusals checked against the reference's reason); `tabs/attendance.spec.ts` (the count tags); `tabs/admin-extras.spec.ts` (the Players tag during a session) |
| p61 — Call In works before a session | Call In did nothing before a session; confirmed spares were listed as unassigned | `tabs/call-in.spec.ts` (40: regulars join the bottom court, spares answered coming with seat, e-transfer or standby, during a session through the court engine); the button census (every Call In, Seat and pool control in every state, desktop and phone) |

## Defects found by the tests and the GitHub checks

| Fix | What was wrong | Tests that cover it |
|---|---|---|
| p58 and p59 — a refresh never undoes a save on screen | A saved private note vanished until the next refresh (a background refresh that started before the save finished after it; then the save's own reload was overtaken too) | `tabs/sync-race-tables.spec.ts` (hold one table read; failed without p58); `tabs/admin-extras.spec.ts` note cases; `unit/review-regressions.test.mjs` (the split load) |
| p60 — league dates and times are the same on every device | Eleven displays used the device's time zone; the tests had worked out league times on the machine's clock | The date and time suites (Home, vote, Pay, vote changes, Tools, Q&A, Schedule, Waiver, audit controls) now compute league times in the league's zone and pass under both UTC and Toronto time; `automation/remind.test.mjs` checks the exact instant; GitHub's checks run in UTC |
| p62 — no court changes offered after both rounds | With both rounds finished (before End Session), the Assign tab's Move selectors, the Court selectors on Players and Registered, and Call In were offered but only answered "Start an unfinished session first" (found by the button census) | `tabs/complete-locks.spec.ts` (disabled with the reason when both rounds are finished; usable during play); the button census skips disabled controls and fails if they come back enabled |
| Production jobs pinned | The audit remediation had pointed production's only backup and reminder jobs at TEST | `unit/isolation.test.mjs`: TEST jobs use only TEST; production's jobs are pinned to the code they ran before this release |
| Production build | A production build of the new page would have kept TEST's cache names, security policy and banner; the installed app was named TEST | `unit/production-build.test.mjs`: builds from a clean checkout into a temporary folder and checks that only the settings lines differ |
| Untested new controls and functions | 28 items of the audit remediation were not named by any test | `tabs/audit-controls.spec.ts` (End play early, Cancel Session, next-season fields, the calendar file, moving a player on Assign); `db/internal-functions.sql` (permissions and behaviour of every internal database function); `unit/coverage-gate.test.mjs` keeps the matrix without gaps |

## The audit remediation (review findings 01–31)

Codex's table in docs/31 maps each finding to its tests (database review, season-recovery and operations suites;
unit and automation review regressions; `tabs/review-regressions.spec.ts` and the tab suites). The takeover review
added the tests above and ran all of them; results are in docs/31 ("Results after the takeover").

## Open design question: spares keep the court they last played on

When a spare plays a session, the site records that court for them, as it does for regulars, and keeps it afterwards.
Such a spare then appears on that court's list in Admin → Players and in the Court Distribution counts, and not in the
spare pool, so the pool's Call In is not offered for them (the RSVP tab's "Set coming" still is). The Call In tests
use a spare who has not played yet, which is what the pool is for. One option is to list every spare in the pool
before a session and leave spares out of the court lists and counts; that changes what Admin → Players shows, so it is
the organizer's decision.

## Test-side corrections (so the tests check the right thing)

Each still checks its behaviour exactly: the season score helper waits for the current match's form; the keyboard case
tabs from the top of the page; the rotation checks follow the next court in use; the harness waits for a previous
case's load and cancels its pending save; league times are computed in the league's zone; the waiver offset is
normalised (-0 in UTC).
