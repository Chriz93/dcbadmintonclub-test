# Claude review remediation — September 7

Claude independently reviewed a code-only snapshot, without credentials or live records. The original static findings are retained in `16-claude-review.md`; this document records our assessment and changes.

| Finding | Action and evidence |
|---|---|
| H1 guardian/age claims | Migration 028 adds an MFA-protected organizer identity review tied to eligibility revision. Minor signing options remain hidden until review; signer name must match the reviewed guardian. All operational approvals require organizer birth-date review. Private admin screen shows date of birth and guardian email and records the independent check. This is a human verification workflow, not automated proof of identity or relationship. |
| H2 score overwrite | Migration 027 makes ordinary score submission write-once. Recorded scores require the existing MFA/reason correction RPC; non-admin scorekeeper inputs are disabled. Regression confirms original scores/revision remain intact. |
| H3 agreement republish | Migration 027 rejects republishing once that season has signatures, preserving registration status and paid capacity. Next-season publication remains supported. Signed-season amendments need a separately designed consent workflow, not a silent reset. |
| M1 permit cancellation | Permit import cannot change the status of an existing session. Use the audited cancellation action. Reopening a cancelled session through import is rejected. |
| M2 penalty consumption | Migration 029 reverts previously consumed penalties before replacing an unscored opening plan, then consumes only explicitly reviewed penalties. Placement excludes same/future sessions and other seasons. Tests cover replacing the plan, omission, and current-session denial. |
| M3 refund vs cancellation | Pending $14 absence refunds are voided when the school cancels, and approved regulars receive two physical shuttles. Previously settled transfers remain evidence for manual reconciliation; no bank transfer is claimed reversed. This follows the user's no-cash facility-cancellation policy. |
| M4 import lock order | Removed import's unnecessary season write lock while retaining session locks. Real separate-connection rehearsal holds a session lock during correction and runs a competing permit import: correction commits, incompatible import is rejected, no deadlock. |
| M5 stale notification backlog | Never-attempted pending messages older than 24 hours or for sessions already started are suppressed before claiming. Regression covers a budget-starved unused message. |
| M6 spare priority wording | Clarified readiness order: both vote and administrator-verified payment must be complete, with available capacity. Earlier unpaid votes do not reserve a place. This matches the user's “first to vote and pay” instruction and existing serialised verification/paid-promotion behavior. Actual bank receipt time is not automatically verified. |
| L2 automatic ties | Updated contradictory manual-decision text: exact ties use a stable automatic order, reviewed by the admin before movement is saved. This matches the user's request for app-decided tie breakers. |
| L7 deadline timezone | Member hub shows Toronto time for the RSVP deadline and a separate explicit 72-hour refund cutoff. |

Additional SMTP work: migration 026 records a durable send-start marker, rejects duplicate/stale starts, and requires reconciliation after crashes or uncertain outcomes. Gmail adapter uses TLS, does not log credentials, suppresses SMS and disabled consent, and requires explicit live recipients. It is implemented/tested but not yet deployed as a scheduled worker or verified with Gmail.

## Verification

150 automated tests pass. Browser checks: 22 passed in the full run; the two new admin review cases initially had a test locator timeout, then both passed after targeting the accessible combobox. Thus all 24 cases passed across the full run plus targeted rerun. Build/type and lint checks are recorded separately in the handover. The updated real local PostgreSQL rehearsal passed 25 players/80 games, score conflicts, spare capacity, 90 distinct email leases, import/correction locking and encrypted restore across 43 data/security comparisons.

## Open review limits and follow-ups

- Claude has not independently re-reviewed these patches. Its initial review was static.
- L1 cross-round rest-position continuity remains an enhancement: within each five-player round everyone rests once and each pair partners once, but saved assignments do not retain an explicit lineup ordinal across rounds.
- L3 authorization/throttling before all row locks, L4 repeat vacancy notices, L5 early session activation, L8 stale in-flight handling, and L10 generalised fee configuration remain tracked follow-ups. Current league fee is the tested fixed $400.
- L9 is an onboarding-policy distinction: the shared link allows pending intake; only Christy can approve paid members up to capacity. It is not an invite-only allowlist. A strict allowlist would require the confirmed players' email list.
- Settled refunds preceding a later school cancellation require manual financial reconciliation. No payment integration is active.
- Actual Gmail delivery, independently issued Auth sessions, actual remote backup restore and final agreement publication remain release gates.
