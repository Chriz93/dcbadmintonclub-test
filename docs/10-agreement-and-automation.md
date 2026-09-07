# Maplewood agreement and automation — September 7, 2026

## Implemented and applied to TEST

Organizer: **Christy**, acting personally. Maplewood Advanced Badminton League is the league name. No registered legal entity or surname is asserted.

- Regular season $400, 25 regular places, closed regular recruitment. Accepted players enter their own details. Spare sessions $20.
- Absence notice at least **72 elapsed hours** before session: **$14** ledger credit. Repeated requests do not create duplicate refunds. A refund ledger is not an automatic bank transfer.
- School cancellation: no cash refund; **two physical shuttlecocks** for affected eligible players. Administrator records actual handover.
- No response or “maybe” is not a no-show. Administrator verifies a committed player's absence, records the reason, and applies one court down at the next starting placement. Bottom-court/unresolved penalties remain pending unless reviewed; ELO is unchanged.

## Participant and guardian signing

Member hub provides details, date of birth, rule acknowledgment, separate guardian email for minors, complete agreement text, explicit electronic acceptance, and an exact downloadable receipt. Ages 16–17 use the separately signed-in guardian account. Guardian declares adult status and authority; verified email does not independently prove legal identity or authority.

Administration publishes the reviewed liability text with the fixed league rules, version, hash and review reference. No legal text has been published or signed automatically. Each receipt preserves participant name, signer, capacity, relationship, complete body, hash and timestamp. Publishing a replacement agreement requires renewed approval for that season. Optional messaging consent remains separate.

Christy's legal review remains a launch dependency. The supplied facility rules are not a participant waiver. No promise of complete legal protection is made. A signed identity correction currently requires an operator review, preserving the original receipt; do not directly overwrite signed records.

## Voting and spare allocation

Voting takes place in Member hub. Pin that link in the regular and spare Messenger groups. The system identifies nonresponders from approved registrations. It queues opted-in notices seven days ahead, then at 96 hours and within the final 78-to-72-hour window. Sending rechecks current response and consent. Missing responses continue reserving regular places until Christy resolves attendance.

Spare claims are not reservations. They expire after 24 hours or at session start. Christy checks the e-transfer and verifies payment. A confirmed available place is allocated atomically; excess/late payments go to reconciliation. “First vote and pay” uses the time payment is verified, because the app cannot independently observe e-transfer settlement. Eligible verified waiters are promoted when a spot opens; paid withdrawals follow the $14/72-hour rule. No bank transfer is executed by the app.

## Ratings and courts

Administration accepts Christy's seed order only for approved players with this season’s signed agreement. Each new season requires its own acceptance; previous receipts remain intact. Initial rating is 1000 plus 15 points for each lower seed. Starting placement sorts rating, seed, then stable member ID. Doubles ELO uses team average ratings, expected score with a 400-point scale, and K=32 averaged per played round, keeping 3-game and 4-game rounds equally weighted. Rest does not create a result. Completed-session scores drive ELO; correcting/reopening history rebuilds it chronologically.

Subsequent rounds use ladder movement. Administrators preview, move players, sit a player out, add checked-in players, correct scores, restart a round and safely undo a restart before replacement work exists. Every saved correction requires MFA, revision checks and a reason. Standings contains performance ranking plus the separate ELO table.

## External delivery setup

The server worker supports free-tier Resend email with consent checks, leases, bounded retry and a 90/day, 2,500/month application budget. SMS is disabled and its billable adapter removed. Court changes stay in the app. Provider acceptance is recorded as **accepted**, not delivered. SMS with an uncertain outcome is held for manual provider reconciliation. No provider was enabled, no club notices were sent, and no paid service was activated. See `11-operations-runbook.md` for setup and remaining delivery gates.

Personal Messenger group poll automation is not implemented. Earlier research did not identify a supported API for reading those polls or messaging personal group nonvoters. The app is the attendance record; chat groups distribute its link.

## Administration and unsubscribe additions

Migrations 019–021 add audited public club settings, empty season/venue/court creation, revision-protected announcements and a club-scoped privacy review queue. New seasons require the verified participant/guardian workflow. The no-login email unsubscribe endpoint uses a signed club/person/channel token, shows confirmation on GET, and disables that channel on POST. Public HTTPS routing and a shared server signing key remain deployment requirements.
