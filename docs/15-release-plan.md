# Maplewood phased release plan

The objective is a usable member website with auditable league administration, not a promise of zero defects. Today is the target; failed safety/correctness checks remain release blockers.

| Phase | Deliverable | Exit evidence | Current status |
|---|---|---|---|
| 1. Scope | Feature inventory and explicit limitations | Rules mapped to behavior and acceptance tests | Baseline implemented; inventory below |
| 2. Services | Free hosting, Gmail Auth, reminder delivery, scheduled execution and unsubscribe | Real sign-in received; opted-in test reminder received; unsubscribe stops next send | Hosted TEST site online; organizer email login and MFA verified; scheduler and unsubscribe code added by Claude, private service configuration and live reminder verification pending |
| 3. Identity/security | Real member, guardian, admin sessions | Issued Auth tokens; cross-account denial; MFA; expiry; guardian consent separate from participant | SQL/mocked-browser checks passed; independent real-account acceptance pending |
| 4. Match-day | Full session with 25 synthetic players | All players accounted for; valid partner rotation; 80 scores; ties; correction/replay/concurrency results | 150 automated checks and 24 browser cases passed; concurrency/restore re-run passed |
| 5. Independent review | Claude findings and remediation record | Findings reproduced or explicitly dismissed with evidence; regression tests | Claude review complete; high/medium fixes implemented and tested; follow-ups recorded |
| 6. Recovery/release | Actual remote backup restore, reviewed legacy import, hosted release | Restored data/permissions verified; critical findings closed; deployment smoke test | Actual remote restore and final production release pending |

## Release scope

- Simple Member hub: sign in, enter details, current-season agreement, RSVP, payments/credits, previous matches. Standings: current ranking/results. Previous seasons: private reviewed identity-linked archive.
- 25 regular advanced players; $400 regular season; $20 spare session. Christy verifies e-transfer receipts; a typed payment claim never proves payment.
- First eligible vote plus verified payment and capacity confirms spare placement. Ratings support court assignment; Christy sets initial seed order only after approved registration and current agreement.
- Six courts; five-player Court 6 rotation when 25 attend. Scores, rounds, movements, completion and chronological ELO correction/rebuild are guarded and audited.
- At least 72 elapsed hours' notice qualifies for $14 absence refund. Exactly 72 hours qualifies; one millisecond late does not. Facility cancellation: no cash refund, two physical shuttles. Verified no-show: one court down, reversible by admin; unanswered RSVP alone is not a no-show.
- No minimum age. Under-18 participants require separate verified guardian consent. Fresh agreement every season. The legal organizer is Christy; draft agreements are not a guarantee of legal protection and must be reviewed before publication.
- Permit-based 28 approved sessions and 6 cancelled dates, Tuesday 20:15–22:15 Toronto; finish play 22:05. The permit supersedes the original promotional message.
- Private historical archive preserves old results without importing old signatures/payments as new entitlement.

## Test matrix

| Area | Required checks |
|---|---|
| Identity | Valid/invalid/expired/replayed sign-in, logout, multi-device state, distinct member/guardian/admin, revoked access, no cross-tenant/profile leakage |
| Agreement | Adult acceptance, younger minor, wrong guardian, self-sign attempt, missing checkbox, outdated publication, new season requires new receipt, immutable receipt |
| Registration/payment | Incomplete intake, duplicate submit, verified vs claimed payment, capacity reached, concurrent last place, refund replay, permission denial |
| RSVP | All attend, 24/25 attend, unanswered vs absent, 72-hour boundaries, DST elapsed time, withdrawal after spare confirmation, cancelled session |
| Match-day | Four/five-player courts, participant conservation, ties and deterministic tie-breaks, invalid/unfinished scores, duplicate players, stale revisions, repeated requests, admin correction/undo, ELO replay |
| Delivery | Consent off, answered RSVP suppression, daily/monthly cap under parallel workers, provider failure, timeout after send, worker crash, stale lease, duplicate start, unsubscribe forged/expired token, no SMS charges |
| History | Own matches only, empty/paginated results, old invalid/tied scores marked for review, ambiguous identity denied, old/current seasons separated |
| Browser | Mobile/desktop, keyboard, accessibility, form errors/retries, reload/offline, stale data, readable member view |
| Recovery | Encrypted real source backup, isolated restore, row/policy/grant/function comparison, Storage coverage, rollback rehearsal |

Test counts alone are not acceptance. Existing browser tests mock API responses; local database tests use synthetic claims. Neither substitutes for real independently issued Auth sessions. Claude review supplements tests and does not replace them.

## Enhancement priorities

Before launch: clear pending actions for players; delivery-failure/reconciliation visibility for Christy; easy, audited match-day correction and recovery. Validate the existing Member hub before adding extra screens.

After stable launch: season-to-season setup convenience, richer personal progress charts and partnership statistics, optional web push (device support and consent required). These are proposals, not delivered features.

Unsupported under current constraints: automatic personal Facebook/Messenger poll reading/messaging; free guaranteed SMS; automatic e-transfer verification; absolute legal immunity. Use the app RSVP link pinned in both Facebook groups, opted-in email, and administrator payment verification.

## User-dependent gates

Organizer Auth SMTP is verified. Reminder-worker and deployment credentials must be entered directly in private service settings, not chat. Real inbox recipients/test sends need explicit authorization. Actual remote backup connection must be supplied through private configuration. Reviewed legal text must be published before real signatures. Christy's initial seeding follows player registration/signing, so it is not a pre-registration engineering blocker.
