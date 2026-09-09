# Round movements, game-day testing and legacy parity

> **Current release (9 September 2026):** See [Connected product release](23-connected-product-release.md) for the hosted Preview, completed integrations, current checks and deferred launch gates. Earlier status statements below are historical.


Verified September 9, 2026. Local source delivery; hosted TEST and production were not changed in this work.

## Delivered

The populated game-day demo now shows round progress on Courts and Scores, completion counters for every court, an explicit wait state, movement labels beside all 25 names, and a dedicated Court movements screen. Published history includes all players grouped into moved up, moved down and stayed, with session/round selectors. Final placement after round four is labelled separately; no fifth played round is invented. A player’s home screen has their next court game, partner, opponents, rest turn, a direct scores action and their last published movement. The walkthrough can be hidden to give the court screen the whole panel.

The connected SessionWorkspace source now defaults to the latest round, exposes a historical round selector and shows progress plus published movements derived from saved assignments. It no longer displays every round’s score form at once. Ordinary participants can submit their own first result; saved results require an audited administrator correction. These connected changes require migrations 032–034 before hosted deployment. The populated gym/profile interface remains a separate local demo.

## Exactly when a round ends

1. Publish the starting lineup. At 25 attendees, courts hold 4/4/4/4/4/5 players.
2. A four-player court plays three doubles games to 21. A five-player court plays five doubles games to 15; every player rests once and partners each other player once. Current league scoring has no deuce extension. Smaller attendance has its own validated rotation and total; 24 attendees require 18 games, not 20.
3. Each game needs one valid completed result. Participants may enter their own match once; another participant cannot overwrite it. Christy can correct it with a reason.
4. With 25 players, all 20 scheduled games must be complete. A court that finishes early waits. Missing or deleted games, incorrect participants, duplicate pairings, wrong targets and incomplete rest coverage cannot be treated as a completed round.
5. The round becomes ready for review. Rank each court by win percentage, then points earned divided by maximum possible points. Exact ties use stable player identity. ELO is not the per-round movement tie-break.
6. Christy reviews and publishes. Adjacent courts exchange their bottom/top player simultaneously. Court 1’s top player and Court 6’s bottom player stay; court sizes are preserved. Players immediately see the published up/down/stayed record in the demo. Connected clients currently need Refresh session; automatic live updates remain pending.
7. Start the next rotation. A correction after preview invalidates that preview. A correction after publication updates results/ELO but preserves played assignments; changing those requires the reviewed restart workflow.
8. Close the session after a completed round. The demo illustrates four rounds/80 games; four is not a promise that every real evening can fit four rounds. Finish play by the permit’s 22:05 stop time. If a final round is incomplete at closing time, do not invent winners or publish partial standings: Christy must review and remove that incomplete round through the audited restart controls before closing the completed portion. The connected app still needs a simpler close-night checklist and a dedicated final-placement record.

Official opponent-based ELO uses completed sessions: Christy’s starting seeds, team-average expectation, K=32, frozen ratings within each round and mean player change per round. Corrections replay ratings chronologically. Rest turns do not count as games or losses.

## Issues fixed

- Completion formerly depended on the remaining match rows. Totals now come from assignments, so a deleted game cannot lower the target.
- Database assignment requests could skip rounds or overwrite an earlier unscored round while later rounds existed. Migration 032 rejects both and validates the previous complete rotation under the session lock.
- Session completion now validates every round’s assigned players, game count, target, partner coverage and equal play/rest coverage.
- Player self-scoring was demonstrated locally but not supported by the connected permission path. Migration 033 grants first submission only to active participants in that game, retains existing scorekeepers, and preserves revision, audit and correction restrictions.
- Live score correction did not change the session revision, allowing an older assignment preview to pass its version check. Migration 034 invalidates it. The local demo also checks score and movement revisions.
- ELO calculations reject duplicate game contributions, unknown/repeated players and nonfinite baseline ratings.
- Repeating the demo’s score-fill action no longer adds duplicate audit entries.
- Synthetic Court 6 scores wrongly assumed a 15-point target even with only four players. Sample results now follow the game’s actual target.
- The build’s filename-based startup list could omit a newly shared chunk from offline caching and the bundle budget. It now follows Vite’s manifest and static import graph. The compiled offline browser checks passed.

## New tests and evidence

| New cases | Coverage |
|---:|---|
| 500 | Four rounds: 80 missing-score cases, 80 deleted-game cases, 80 wrong-court cases, 100 independently checked player movements, 80 reversible corrections, 40 ELO integrity checks, 20 stale score writes, 20 changed movement previews |
| 145 | PostgreSQL checks: 80 deleted-game completion denials, 20 incomplete-round publication denials, 20 participant submissions, 20 nonparticipant denials, five lifecycle/permission/version checks |
| 21 | Reduced attendance, joined/sitting-out labels, duplicate assignments, partial scores, repeated game IDs, empty courts and nonfinite ratings |
| 10 | New desktop/phone browser cases for movement history, missing results, next-game controls, responsive clickable profiles and authenticated participant-scoring UI with a mocked API |
| **676** | **Additional automated cases; reruns are not counted as new cases** |

Final unit/database/coverage run: **1,137 passed, 21 files**. The 500 requested cases are individually named in `platform/tests/round-movement-500.test.ts`. PostgreSQL tests execute all migrations in an isolated PGlite database; fixtures roll back.

Browser verification: **68 distinct desktop/mobile cases verified across the full run and affected-suite rerun**. The full run passed 66; two new history assertions compared DOM text with rendered text and were corrected to compare rendered text consistently. All 24 demo cases then passed, including those two. Earlier stale locators and the full-session test’s old all-round form indexing were updated for the explicit round selector. The full 25-player/80-game admin rehearsal and the new member-scoring/history test passed on desktop and phone emulation. Tests cover Chromium desktop and iPhone-sized Chromium, not a physical iPhone/Safari or independent real hosted accounts.

Coverage scope is `src/domain/**` and `src/services/config.ts`: **98.61% lines, 94.73% branches**. The new round-status/movement helper has **100% line and branch coverage**. These figures do not describe the entire app, SQL or React UI.

Lint, TypeScript, production build and diff whitespace checks passed. Startup graph: **186.7 KiB gzip**, below the 220 KiB limit. The visible in-app browser was also used to publish round 2 and inspect the movement summary. No real players were contacted, no emails were sent, and no production data was changed.

## Legacy feature comparison

Compared with the preserved legacy `index.html`, especially `renderCourts`, `computeRoundStatus`, `renderRoundTracker`, `renderScoreEntry`, `renderLeaderboard`, `renderRankings`, `renderStats`, `renderSessionStandings`, `renderGameHistory`, `renderSnapshots`, `copyRoundSummary` and `renderQA`.

“Connected source” below means code ready for further integration/testing, not a claim that the hosted TEST website has been redeployed.

| Legacy capability | Local populated demo | Connected source / remaining work |
|---|---|---|
| Sign-in before registration | Simulated | Implemented with real Auth, seasonal registration and agreement flow; finish independent account/guardian verification |
| Six-court gym layout and clickable players | Present, including all five Court 6 players | Text court workspace present; connect the gym layout and full player profiles |
| Scores screen and current-round tracker | Present, with explicit progress and player scoring | Current-round selector/progress now present; participant permission migration added; separate simple Scores navigation still pending |
| Up/down arrows and completed-round movement history | Present for every round | Saved assignment comparison present; connect prominent personal notifications, real-time refresh and dedicated final-placement snapshots |
| Leaders, ELO rankings, statistics | Present | Basic league standings/ELO exist; integrate the familiar richer sections |
| Every player’s match history and ELO chart | Present | Own match history exists; connect peer profiles and durable historical ELO snapshots |
| Per-session final placements/history | Present | Dedicated end-of-session placement record and member session-summary screens still needed |
| Court heatmap, session streaks, most-improved awards | Not present | Still missing; add inside Stats after the core workflow is connected |
| Copy round summary / share court assignments | Not present | Restore a deliberate copy/share action; do not automatically message personal groups |
| Familiar admin tabs and quick roster controls | Demonstrated | Secure administrative operations exist but need the same organized workflow; quick-add must preserve signed-registration/approval requirements |
| Round restart/undo and snapshots | Local correction/audit demonstrated | Reviewed restart and undo exist; readable snapshot/recovery UI and actual remote restore rehearsal remain pending |
| Announcements, league questions | Announcement/RSVP examples | Announcement settings exist; legacy Q&A screen is still missing |
| RSVP and spare booking | Demonstrated | App RSVP/verified-payment booking exists; finish free email reminders, nonresponder view and live delivery/unsubscribe verification |
| Automatic advance after all courts finish | Deliberately uses Christy’s publish step | Keep a visible review/publish gate to catch incorrect scores; do not silently advance while someone is correcting a result |

The legacy’s automatic advance checks all courts, but its court-size assumptions and historical placement behaviour should not be copied wholesale. The new engine handles 25 participants explicitly and records played and final courts separately in the demo.

## Player-first priorities

Before live rollout:

1. Connect the demo’s simple Home → My court → My scores → My history path to real member data. Keep full details behind a player name; do not add more home-screen dashboards.
2. Automatically refresh assignments and progress without overwriting unsaved scores. If someone else changed a result, show a clear refresh/review message. Show connection and last-update status.
3. Give players a one-button request for a score correction, with match context and organizer resolution status. An ordinary player must not silently overwrite another saved result.
4. Add a large gym-display view with the round, court names, rest player and movement announcement.
5. Add a close-night checklist: outstanding games, published movement/final placements, stop time, completion and official ELO.
6. Restore copy/share summary and the unanswered-RSVP list. Complete opted-in free-email delivery; no paid SMS or personal Messenger scraping is assumed.

Later enhancements: court progression heatmap, partner statistics, attendance streaks/awards and a searchable league FAQ. Keep these under Stats or Help so registration and game night remain short.

## Launch work still pending

- Deploy migrations 032–034 and the reviewed client to isolated TEST together, then run a real authenticated session. Hosted TEST and production remain unchanged in this work.
- Complete live-data integration of the rich gym, peer-profile, historical rating and final-placement screens.
- Independent real member/guardian/admin checks, actual concurrent-client checks, and an isolated restore of the actual remote backup. Local SQL and mocked browser tests do not replace these.
- Reviewed season agreement/publication, including reconciliation of the existing paid-spare facility-cancellation exception with Christy’s stated policy.
- Private reminder-worker/unsubscribe/scheduler and release configuration; live opted-in delivery acceptance. Existing email-test allowance must not be reused for new sends without authorization.
- Final hosted acceptance before applying the previously conditional production-launch approval. No paid subscription has been introduced.
