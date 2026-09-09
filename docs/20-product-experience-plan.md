# Maplewood league experience — proposed delivery plan

Prepared September 8, 2026. **Planning only: no application or deployment changes are made by this document.**

September 9 update: Christy authorized the opponent-based ELO choice. The locally browsable phase-1 experience and spoken tour are documented in `21-narrated-game-day-demo.md`. Hosted integration and the remaining phases are still pending.

## Product outcome

The new website should feel like the original DC Badminton Club website: open the league, see the players and courts, enter a score, check standings, and open anyone's badminton history. Christy should be able to run and repair a session through the interface. Registration, agreements and administrative checks support that experience.

Reuse the original navigation, visual gym arrangement and useful performance views on the existing new backend. Keep the old website available while the new experience is reviewed. Do not build a third application or switch the league before visible feature parity is demonstrated.

The reference is the original site at https://chriz93.github.io/dcbadmintonclub/, the three supplied screenshots, and its local `index.html`. Old prices, dates, capacity assumptions and access-control implementation are not current season requirements.

September 9 follow-up: round progress, persistent movement history, current-round score forms and participant scoring are implemented in local source. Migrations 032–034 and hosted integration remain pending. The updated verification and full legacy parity matrix are in [22-round-movements-and-legacy-review.md](22-round-movements-and-legacy-review.md). The table below records the original planning baseline, not the current delivery status.

## What is present and what is missing

| Capability | Verified current situation | Required result |
|---|---|---|
| Sign-in and registration | Verified sign-in, details, seasonal agreement and approval workflow exist | Keep sign-in first; show a short registration checklist and clear status |
| Dummy league | The isolated TEST database contains 25 synthetic players and one completed four-round, 80-game rehearsal | All players and their results must be discoverable through normal screens |
| Courts | Assignment lists and match-day controls exist | Gym and list views, six recognizable courts, every player visible, court details and movement indicators |
| Player history | My Matches shows the signed-in person's history | Every approved member can open every league player's performance profile |
| Standings | Basic performance and ELO tables exist | Leaders, Rankings, Stats, Sessions, History and RSVP views, with clickable names |
| Scores | Scores are embedded in the session workspace; current authorization is for scorekeepers/admins | Separate Scores tab; a participant can submit results only for their own matches |
| Administration | Backend operations and an admin workspace exist | Familiar organized tabs and direct controls for the full match-day workflow |
| Historical ELO and final placements | Current ELO aggregates exist; dedicated historical ELO and final-placement records need work | Traceable rating changes and explicit final placements after the last movement |
| Verification | Automated tests and a database rehearsal passed | Also demonstrate the complete hosted experience through actual authenticated screens |

Existing test evidence is in `19-deep-matchday-review.md`. Those checks do not establish that the requested interface has been delivered.

## Confirmed access choices

Christy confirmed both on September 8:

- Every signed-in league member can view other league members' badminton performance: rating, results, statistics, court movements and match history.
- Players can submit scores for matches they played. Christy can correct any match.

Apply these permissions within the member's league. Public visitors, unrelated accounts and guardian-only accounts do not gain member privileges. League performance views must not include contact details, date of birth, emergency contacts, payments, agreement receipts or guardian information.

Recommended score behavior: any participant in a match can submit its first official result. Once saved, another participant cannot silently overwrite it; show the saved result and a correction request route to Christy. Existing designated scorekeepers retain their authorized scope. Server checks must reject attempts to score another court's match merely by changing an identifier.

## Familiar screens

Use the original compact navy/cyan visual direction, readable contrast and fixed bottom navigation. Retain labels alongside icons. Normal viewing automatically loads the current club, season and relevant session. Administrators with multiple clubs have a clear club selector. Keep the selected season/session consistent across screens.

| Screen | Player experience | Christy's additional controls |
|---|---|---|
| Home | Next session and RSVP; my court, ELO and last match; announcements | Open registration queue or current session directly |
| Register / My account | Details → season agreement → payment claim → approval status; subsequent seasons show renewal | Review eligibility, guardian verification and bank-confirmed payment; approve before seeding |
| Courts | Gym/List switch; session and round selector; names, movement arrows, current game and resting player; tap a court or player | Preview assignments, swap/move players, include an eligible checked-in player and review movement |
| Scores | Own court and current round first; pairings, targets, results, pending games and save status | All courts, missing scores, corrections and controlled reopening |
| Standings | Leaders / Rankings / Stats / Sessions / History / RSVP | Review results and navigate to the appropriate correction control |
| Schedule | Approved and cancelled sessions, venue, times and response deadline | Record facility cancellation and review the resulting credits |
| Admin | Shown only to authorized organizers | Players / Registered / Session / Attendance / Assign / Payments / Announcements / Tools |

The court map follows the supplied layout: **C1, C2, C3 above C6, C5, C4**. With 25 attending players, the initial distribution is **4 / 4 / 4 / 4 / 4 / 5**. Court 6 must show all five players and the rest rotation. Copying the old four-slot display would hide a player and is unacceptable.

A court's detail view shows the assigned roster, games, partners/opponents, scores, rests and round movement. A read-only gym display can enlarge this same view for projection. Sharing prepares court information for Christy to send; it must not send messages automatically.

## Performance views and definitions

- **Leaders:** familiar court-based ladder order, with wins, losses and win percentage. Explain the ordering; keep it distinct from rating rank.
- **Rankings:** numeric ELO, ELO rank, rating change, current court and played-game totals. A new player's baseline is marked as seeded until results exist.
- **Stats:** games played, wins/losses, win percentage, points for/against and percentage, best court, court progress and clearly labelled session streaks. No division-by-zero or misleading zero-loss percentage for an unplayed player.
- **Sessions:** a completed session's final court placements, per-player W/L and win percentage, and up/down/stayed movement. Show final placement after the last round's movement, not simply the court on which the last match was played.
- **History:** filter by season, session, player, round or court; display both teams, score and result. Opening a name always leads to the same profile.
- **RSVP:** session attendance response and available places. Missing response is distinct from a confirmed absence and from an administrator-verified no-show. Financial and contact details remain private.
- **Player profile:** name, regular/spare status, current court, ELO and change, career/season filters, statistics, rating trend, court movement timeline and complete previous matches with partners/opponents. Show provisional results and official results distinctly.

Statistics must come from one coherent set of recorded matches. Do not separately calculate incompatible totals in each screen. Completed-session ELO is the current new-backend behavior; any live rating estimate must be explicitly labelled provisional.

### ELO compatibility needs an explicit comparison

The two applications currently use different formulas. The original derives a baseline from court achievement and applies court-weighted win-based adjustments, including live scores. The new backend starts from Christy's seed order and uses opponent team ratings with a round-normalized ELO calculation, rebuilding official ratings from completed sessions.

**Recommendation:** keep the new opponent-based calculation while restoring the familiar Rankings display. Compare both formulas on the same synthetic matches and document the result before release. Matching the old appearance must not silently change the formula or imply that historical ratings will be numerically identical.

Store or reproducibly derive rating-before, rating-after and delta per completed session. Current aggregate ELO alone cannot supply a truthful historical chart. Original-season ratings, if imported, should retain their legacy method label rather than being mixed into a new-method trend without explanation.

Keep these concepts separate: seed order, ELO rank, starting court, round movement, last played court and final session placement. Subsequent-session ELO placement and intra-session ladder movement are separate operations under the current rules. Preserve a final-placement record without inventing another played round.

## Delivery phases

### Phase 1 — Visible dummy league for review

Build the agreed screens around one consistent synthetic data set: **25 fictional players, three completed sessions and one active session**. Extend the existing rehearsal rather than replacing it. Each player has a readable fictional name, seed, ELO, games, results and court history. Give the active session a mix of scored and pending games.

The first review must let Christy browse all 25 names, open profiles, switch Gym/List, inspect courts, see a fifth-player rest, select past sessions and inspect rating changes. Make the new screens use the same components and data contracts that will serve the connected app. Do not create a separate throwaway mockup.

A clearly labelled synthetic preview may offer “View as player” and “View as admin” for visual review. This is presentation simulation, not a way to impersonate a real account or bypass backend permissions. The authenticated TEST rehearsal remains necessary for real writes and access testing. Synthetic identities, signatures and payments are visibly marked; no real messages are generated.

**Exit:** Christy can browse the actual requested information and compare it with the three screenshots before another rollout cycle. Record any visual/workflow changes at this point.

### Phase 2 — Connect the familiar member experience

Connect the approved views to league-scoped read APIs. Add safe league-wide performance profiles, historical rating data and final-placement summaries. Make Home, Courts, Scores and Standings agree on their selected season/session. Load automatically, provide retry on failures and preserve useful state when moving between tabs.

Implement the confirmed participant-scoring permission on the server and the Scores page. Version checks handle simultaneous submissions; a failed request must never appear saved. Reconnecting should reload authoritative state and reveal conflicts before another submission.

Retain the existing sign-in → registration/renewal → eligibility approval journey. A player is available for initial seeding only after the required current-season agreement, guardian checks where applicable and organizer approval. A returning member reaches their league Home directly when eligible.

**Exit:** independently signed-in members can see the same league results, score only their own matches, and cannot retrieve another player's private records.

### Phase 3 — Complete Christy's match-day workspace

Restore the old admin organization with searchable Players and Registered lists, court distribution, attendance counts and direct links from a player to the relevant action. Build a guided sequence:

1. Select the session; review RSVPs, approved registrations and spare/payment status.
2. Check in players; batch actions have their own audit entry.
3. Preview ELO-based starting assignments and pending reviewed penalties; correct them and publish.
4. Monitor the current round, missing scores and any correction requests.
5. Review calculated up/down/stay movement and tie-break explanations; adjust with a reason if needed.
6. Publish the next round. Keep earlier rounds readable without displaying every score form at once.
7. Close the session only after the completion checklist; publish final placements, ratings and summaries.
8. Correct an official score, reopen/restart or undo through the UI with a clear affected-results preview and audit trail.

Christy's corrections must update affected official statistics coherently. Do not silently rewrite courts on which games have already been played; changing a historical score and replaying later movement are distinct decisions. Finalized agreement receipts remain preserved as evidence; administrative correction uses a new version or record rather than rewriting a signature.

**Exit:** Christy can run and repair the full rehearsal through the hosted interface without SQL or developer assistance.

### Phase 4 — Prove the whole experience

Run the connected TEST league through registration, review, seed assignment, attendance, court publication, four rounds and completion. A 25-player full session has **20 games per round and 80 games total** with the current rotation settings. Use the three earlier synthetic sessions to verify history and rating progression.

Use actual member/admin accounts for permission and session behavior, alongside isolated database and automated browser checks. Existing regression tests remain required; add cases for the new screens, access paths and defects found during rehearsal. Test count alone is not acceptance.

Required cases include incomplete onboarding, expired authentication, wrong-club access, 24/25 attendees, absent/nonresponding players, spare competition for the last place, fifth-player rests, incomplete/tied/invalid scores, two simultaneous submissions, delayed networks, stale revisions, movement overrides, historical corrections, restart/undo, season switching and mobile interaction.

**Exit:** all acceptance checks below pass, relevant CI gates pass, and Christy has reviewed the visible experience.

### Phase 5 — Finish launch operations and transition

Complete the remaining independent member/guardian checks, reviewed agreement publication, free-email reminder and unsubscribe delivery setup, production deployment configuration, and an isolated restore of an actual remote backup. The existing synthetic restore does not replace that backup check.

Resolve the recorded paid-spare facility-cancellation exception before agreement publication: migration 031 currently differs from the stated no-cash facility-cancellation policy. Do not introduce a new refund promise through the interface by accident.

Keep the old site available until the replacement is accepted. Import only supported historical records with verified identity mapping; preserve original records and show unavailable fields honestly. Demonstrate rollback before the production transition. Existing conditional launch approval applies only after required checks and the reviewed product outcome are satisfied.

## Acceptance checklist

- [ ] All 25 synthetic players appear in the roster, profile directory and appropriate rankings/history views.
- [ ] Selecting a player from Courts, Leaders, Rankings or History opens the same performance profile.
- [ ] Each round accounts for all present players exactly once in assignments; all five Court 6 players and their rests are visible.
- [ ] A member can find their next session, court, ELO and previous match from Home without loading clubs manually.
- [ ] Every match has the correct session, round, court, teams and score; totals reconcile to the underlying matches.
- [ ] Final session placements and movement arrows agree with the final movement record, including after the last played round.
- [ ] ELO history agrees with the official formula and completed-match history; seeded, provisional and legacy values are labelled.
- [ ] Players can submit their own matches and receive a clear result if someone else already submitted; unauthorized scoring fails on the server.
- [ ] Christy can correct a match and see coherent results across profiles, statistics, rating history and session summaries.
- [ ] Admin moves, restarts and undo preserve participants, avoid duplicate results and show an audit trail.
- [ ] Member-visible performance APIs do not expose private registration, financial, guardian or contact information.
- [ ] Desktop, phone and enlarged gym display work without clipped names, hidden players or overwhelming score forms.
- [ ] Hosted authenticated rehearsal and required regression checks pass; production cutover is not inferred from a mock/demo result.

## Current season rules carried forward

- Organizer: **Christy** personally; league display name Maplewood Advanced Badminton League.
- 25 regular places, $400 season fee, closed regular recruitment; accepted players complete their own registration. Spares pay $20 per session.
- No minimum age; under-18 participants use the separate guardian process. A new agreement is required each season, using the same returning account.
- At least 72 elapsed hours' absence notice qualifies for the agreed $14 credit/refund record. Facility cancellation credits two physical shuttlecocks under the stated policy; resolve the existing paid-spare exception before publication.
- A verified no-show means one court down, with review and reversal available. An unanswered RSVP is not a no-show.
- Spare priority requires both a response and bank-verified payment; a typed payment claim does not confirm a place. Allocation respects capacity.
- Christy controls initial seeds. Six courts accommodate 25 with a five-player rotation; later rounds use the agreed ladder movement and deterministic tie-break rules.
- Use the approved permit dates and Toronto times, including cancellations, rather than the original advertisement's dates/times.
- Attendance voting belongs in the app. Finish opted-in free email delivery; do not promise a free SMS service or automatic personal Messenger poll access. No paid subscription is introduced by this plan.

The next deliverable is **Phase 1: the populated league experience**, followed by Christy's visual review. This document does not claim those missing views are already implemented.
