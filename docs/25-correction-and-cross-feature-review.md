# Correction requests and cross-feature review — 9 September 2026

Christy reported that correction requests were not working and questioned the coverage of tabs and linked features. This review found actual product gaps. The earlier passing counts did not demonstrate all live account workflows.

## Findings and changes

1. The open signed-in browser was still executing an older JavaScript entry. A deployed release does not replace a running tab. The app now checks public version metadata and offers an explicit update prompt, without automatically reloading or discarding work. The first reload of an old tab is still necessary. Sessions remain in memory; reloading requires signing in again.
2. That real league inbox account is a spectator member of the synthetic rehearsal, not one of its 25 players. It can read performances but cannot request a change to a match it did not play. Scores now explains this state.
3. The connected correction queue was an empty collapsible list with no explanation or request guidance. It now shows a useful empty state, match date/round/court/game, proposed and current scores, pending status, and decisions. Players request corrections from their own saved match; Christy reviews requests in Scores.
4. Pending requests previously lacked per-match confirmation and duplicate prevention in the interface. The request action is now replaced with a pending message and a link to the queue. Database uniqueness and authorization continue to enforce this independently.
5. Admin decisions now show failures beside the request and preserve the decision text for retry. Accepting updates results and ELO; declining leaves scores untouched. A stale request cannot overwrite a newer correction. Played/published court assignments remain historical evidence.
6. The fictional demo had no player correction-request lifecycle. It now demonstrates request → pending → independent admin decision → player-visible resolution. A proposal does not replace the displayed saved result or change ELO before approval.
7. Confirming discard when switching court filters did not actually reset an editor that remained mounted. The shared leave guard now clears dirty state and resets editor instances. Cancelling keeps both the filter and typed scores.
8. Home's My scores shortcut now returns to the player's own court even after they previously inspected another court.
9. Connected Schedule previously queried the fixed `dc-badminton` public club independently of the selected league season. It now uses the same selected snapshot as Courts and Scores, links the corresponding session, and exports only that season. The existing validated calendar encoder and server calendar UIDs are retained. Metadata failures disable export, explain the failure and provide Retry. Cancellation wording includes the confirmed $20 paid-spare refund.

## Verification scope

- 1,202 unit/database tests passed in 23 files, including 12 new demo correction lifecycle cases.
- Eight new browser scenarios, run on desktop and mobile, expand the suite to 108 cases. The local full run initially had four failures from two obsolete fixture expectations: the authorization error wording and the old Schedule data contract. Updating those fixtures retained the authorization, schedule and assignment assertions; the six affected desktop/mobile checks then passed. A clean CI run is required before release acceptance.
- New browser tests connect actual migrated PostgreSQL functions and row-level policies in isolated PGlite to separate player and admin browser contexts. They verify private requests, prohibition on self-approval, unchanged results while pending, approval, ELO replay, profile/history, preserved assignments, selected-season calendar, stale acceptance failure and decline. Authentication and transport are synthetic; these are not live Supabase end-to-end identity tests.
- Existing browser cases exercise sign-in, registration, adult/guardian agreement screens, account/navigation, administration, seeding/assignments, the 80-game session, score conflicts, movements, rankings/history, court layout, offline behaviour and accessibility. Most of these use mocked API responses; separate SQL tests cover database rules. Coverage percentages apply only to the configured domain/config modules, not every React feature.
- TypeScript, lint, demo/TEST builds and dependency audit passed. No database migration, private credential or member email is needed for these fixes.

## Remaining live acceptance gates

The TEST preview is not a claim that every production feature is proven. The gates in [23-connected-product-release.md](23-connected-product-release.md) remain: independently authenticated real member/guardian/admin signing and scoring acceptance, actual remote backup restoration into an isolated destination, reviewed agreement publication, deferred reminder/unsubscribe credentials and delivery tests, and final roster/production reconciliation. No reminder credentials were requested again and no verification email was sent in this review.

The repository-root legacy project is being changed independently. This release stages and deploys only the platform app and this report.
