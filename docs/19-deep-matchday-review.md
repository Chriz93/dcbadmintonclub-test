# 25-player match-day review — September 8, 2026

The updated TEST site is https://maplewood-league-test.pages.dev/. Application source: `155563e`. This review covers the requested 25-player rehearsal, 300 additional regression cases, browser workflows, and fixes. Production was not changed.

## Results obtained

- **461 unit/domain/database tests passed**, including exactly **300 new independently named cases**.
- Coverage gates passed: 98.39% statements/lines and 91.26% branches across the configured domain/config modules; this is not a whole-application or SQL coverage percentage.
- **42 desktop/mobile browser cases passed**, including eight additional runs covering four new scenarios on both viewports.
- Both browser viewports completed **four rounds, six courts, 80 submitted games, 25 participants**, with the real React controls and intercepted synthetic HTTP responses. These checks are not a substitute for the hosted authenticated rehearsal below.
- ESLint, TypeScript compilation, and TEST build passed. The registry dependency audit reported no known vulnerabilities. Initial compressed assets: 185.2 KiB, below the 220 KiB budget. Lazy PDF parser is separate.
- Actual PostgreSQL processes with independent connections passed concurrent score-correction, import/correction lock, last-spare-place, and notification lease checks. The encrypted synthetic backup restored into a separate database, matching 44 table/permission/function hashes and denying anonymous private reads. This does not claim a restore of an actual remote Supabase backup.
- The fresh rehearsal setup ran in Supabase **TEST**: 25 approved synthetic registrations, 25 simulated agreement receipts, 25 initial seeds, zero games initially, and zero delivery consents. Existing session rows were compared within the setup transaction and remained identical.

## What the additional 300 cases exercise

| Cases | Coverage and assertions |
|---:|---|
| 72 | Every valid 15/21-point final-score combination, either winning side; real SQL score correction, revisions, audit entries, completed-season rebuild, 25 ELO rows and coherent participation totals |
| 20 | Unfinished, tied, negative, above-cap and otherwise invalid scores rejected by domain and database |
| 43 | Every attendance size 0–30, six over-capacity rosters, six invalid configurations; capacity, identity conservation, no duplicates, no mutation, singleton redistribution |
| 30 | Courts of 2/3/4/5 players across five rotation offsets; partner coverage, rest frequency, malformed configurations |
| 40 | Each of 25 single-player no-show positions plus 15 overlapping penalty groups; one-court movement, bottom-court deferral, stable outcomes, no lost participants |
| 30 | Twenty complete rounds checked against an independent integer-ratio ranking oracle; ten missing/duplicated/malformed round variants rejected |
| 25 | Each synthetic player's private contacts, intake, eligibility and signature receipt isolated; exact own-game history with no contact/payment leakage |
| 40 | Ten privileged actions denied to ordinary members, scorekeepers, administrators without MFA, and unrelated authenticated identities |
| **300** | **All passed** |

Fixtures use fake identities and simulated JWT claims. They prove database policy behavior under those claims; they do not prove email issuance, real guardian identity or cross-device authentication.

## Bugs fixed

1. **Incomplete round movement.** Movement previously ranked whatever game rows it received, so missing courts/games, duplicates, invalid teams, incorrect targets or inconsistent rests could yield a plausible plan. It now validates a full rotation per assigned court before computing movement. Saved lineups remain authoritative even when game rows are missing. The check supports historical lineup order and each season's configured targets.
2. **Invalid rotation settings.** Zero/noninteger/negative targets and invalid caps now fail before games are generated. Ranking rejects empty/unequal teams and unknown resting players.
3. **Ordinary member court access.** Session refresh previously called the restricted no-show-penalty API for every member. Ordinary players now load courts without that privileged request; the SQL permission boundary remains intact.
4. **Scoring an early assignment.** Games assigned while a session was still scheduled could remain disabled in the browser although the server accepts its first score. The first score is now enabled and moves the displayed session to active after confirmation.
5. **Upcoming-session recovery.** Malformed data could cause an uncaught promise rejection. Loading, validation failure and retry are now explicit, and stale data clears on refresh or club changes.

The first 300-case run passed 284 cases. Eleven failures identified the domain validation defects above; five were an unrealistic test principal absent from Auth, corrected by creating a separate synthetic Auth identity. An older rest-order test used an incomplete singles/doubles mix; it now supplies complete valid rotations. Assertions were not weakened to accept malformed results.

## Hosted rehearsal

Club: **TEST ONLY — September 8 rehearsal**. Season: **Synthetic 25-player match day**. Separate fixture namespace `f0260908`; the earlier rehearsal and actual season were preserved. The organizer's existing account owns this isolated club. Synthetic operators and players have no passwords or email-delivery consent. Simulated signatures are explicitly marked as nonlegal rehearsal data; payments represent no bank transaction.

Initial court layout: **4 / 4 / 4 / 4 / 4 / 5**. Initial seeds 1–25 give starting ratings 1360 down to 1000. Each round generates three games on Courts 1–5 and five on Court 6. All 80 games are doubles: 320 player appearances and 160 wins across the completed session. Individual appearances differ as players move to/from the five-player court; season standings normalize wins and points, while ELO uses the configured round calculation.

The hosted TEST database completed the full rehearsal through authenticated-role match-day RPCs using the six synthetic scorekeepers and synthetic administrators. All 80 official scores were recorded, session status became completed at revision 5, and 25 standings/ELO records rebuilt with 320 appearances and 160 wins. Every Court 6 round deliberately used 15–10 results that produce a five-way tie; stable identity tie-breaking determined movement. The expected court rosters and rest sequence are recorded in `deep-rehearsal-rounds.json`.
Player numbers below refer to TEST Player 01–25.

| Round | Court 1 | Court 2 | Court 3 | Court 4 | Court 5 | Court 6 |
|---|---|---|---|---|---|---|
| 1 | 1, 2, 3, 4 | 5, 6, 7, 8 | 9, 10, 11, 12 | 13, 14, 15, 16 | 17, 18, 19, 20 | 21, 22, 23, 24, 25 |
| 2 | 1, 2, 7, 4 | 5, 6, 3, 12 | 9, 10, 15, 8 | 13, 14, 11, 20 | 17, 18, 21, 16 | 22, 23, 24, 25, 19 |
| 3 | 1, 2, 7, 12 | 5, 6, 15, 4 | 9, 10, 3, 20 | 13, 14, 21, 8 | 17, 18, 11, 19 | 23, 24, 25, 16, 22 |
| 4 | 1, 2, 15, 12 | 5, 6, 7, 20 | 9, 10, 21, 4 | 13, 14, 3, 19 | 17, 18, 16, 8 | 24, 25, 11, 22, 23 |


Final hosted audit confirmed 25 present players, zero queued messages and zero altered match revisions after rollback. ELO ranged from approximately 1004.30 to 1354.31.

Hosted recovery also passed: reversing a game's winner changed ELO; restoring its original result restored the exact ELO rows; restarting rounds 3–4 retained 40 games; undo restored 80 games, completed status, and exact ELO. These recovery changes ran inside a transaction that rolled back, preserving the completed rehearsal.

The six-scorekeeper split also respects the existing 30-mutations-per-minute limit. Local fixture setup and later recovery phases compress hours into milliseconds; the local-only checker resets only synthetic administrator counters between those phases. Hosted rate limits were not altered.

Hosted administrator screen rehearsal: pending renewed sign-in/MFA after publishing the verified build. The site currently requires sign-in again on page reload because tokens stay in memory. The previous screen did not expose verified club controls; no credentials were read or substituted.

## Deployment evidence

Cloudflare reported **Success** for the existing TEST project. Only nine compiled static files were uploaded. Archive SHA-256: `4a41a89722acafcff77b98f97acf583b11d4b49ca5715f48e5159a7f35523852`. The refreshed hosted page loaded `index-BJNZFP1g.js`, matching the local build. CSP in the uploaded artifact permits only the exact TEST Supabase origin. This was a static application deployment, not reminder-worker setup or a production launch.

## Recommended next improvements

- A current-round view with a clear “20 of 20 scored” summary, followed by one guided movement review. Keep previous rounds in a collapsible history so the screen does not grow to 80 score forms.
- Automatically load the member's current club and next relevant session. Admins with multiple clubs should choose explicitly. This would remove repeated Load/Refresh steps without hiding refresh/error states.
- A batch check-in action with its own audit entry, so checking in 25 players does not consume nearly all of one administrator’s per-minute write allowance. Preserve server-side throttling.
- A one-page session close checklist: missing scores, unresolved attendance, correction reason, then completion. Preserve current version checks and undo history.
- A final player/guardian acceptance session on two independently signed-in devices before invitations are sent.

These are proposals. The implemented fixes and tests above are separate from these future interface improvements.

## Remaining wider launch gates

The final reviewed season agreement, independent real member/guardian verification, reminder worker/unsubscribe delivery setup and live consent tests, and an actual remote-backup restore remain separate requirements. The paid-spare facility-cancellation refund exception in migration 031 still needs an explicit policy decision. No new real messages were sent in this rehearsal. Test success reduces known risk; it does not establish that every possible failure is covered or that the app is ready for unrestricted production use.
