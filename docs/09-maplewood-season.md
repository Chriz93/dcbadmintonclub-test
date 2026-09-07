# Maplewood Advanced League — confirmed rules and remaining launch work

Updated September 6, 2026. All changes are in the isolated TEST project. The local link is not a shareable public launch URL.

## Confirmed by Christy

- 25 regular players; advanced ladder play. Regular registration is closed. Accepted regular players and spare applicants enter their own details after email verification; Christy reviews their status.
- Regular fee $400 for the season; spare fee $20 per session. E-transfer payment references are claims until checked against the bank record. No bank credentials are collected.
- A player must give at least three days' notice for an absence refund. Implementation assumption: at least 72 elapsed hours before the booking starts; this is independent of the existing attendance RSVP deadline.
- Facility cancellations receive no cash refund. Two shuttlecocks per affected player are returned/credited. Whether this is a physical credit remains to be explicitly confirmed; no automated ledger entries have been created.
- No-shows move down the ladder. The size of the penalty remains to be confirmed; one court was proposed, not applied.
- Christy chooses initial seeding. Automated movement and tie decisions must be previewable and administrator-correctable.

## Original documents verified

Permit `2026-07-21-0001`, modified August 27, 2026: Maplewood Secondary School, 700 Cope Drive, rooms 127C/127D. 28 approved bookings and 6 cancelled dates. September 15, 2026 through May 18, 2027; May 25 is cancelled. All bookings are 20:15–22:15 Toronto time, 56 booked hours. Facility rules require activities to end ten minutes before the booking ends: finish play by 22:05, exit by 22:15. No early arrival, outdoor gym footwear or food/drink in the gym.

Permit SHA-256: `e26814b74362fb39c3288481ab0570a21a95f2b854515872488590c95667853b`.
Facility rules SHA-256: `637909d16d1b700c0e3c9ec3661c090571ce0197b589ffb9f6a59acdc1962dc1`.

The fixture contains only the 34 extracted booking rows, without private contact, insurance or billing details. A regression test compares every date, time and cancellation with the app's schedule. The original PDFs stay outside the repository and public assets.

**The supplied Rules and Regulations PDF is a facility-use document, not a signed participant waiver or a club liability release.** Participant waiver wording, named legal parties, adult/minor eligibility and insurer/counsel review remain outstanding. No waiver has been published or accepted on a player's behalf. The application cannot promise absolute immunity or zero defects.

## Available in TEST

- Member hub: private legal name, chosen display name, phone, emergency contact, regular/spare request and payment claim. Saving does not grant a place, role or paid status. Intake is included in the member data export.
- Administration: review payment claims by name; verify only after checking the bank record. Maplewood regular approval requires the current participant waiver, verified full season payment and space within the 25-person cap. Spare approval is eligibility only; session payment and reservation controls are still pending.
- Standings: completed-session games, wins, win percentage and percentage of available points. Exact statistical ties share a rank. These are season performance results, not a replacement for ladder positions or initial seeding.
- Courtside: move players between courts in the assignment preview; server rejects duplicate players and invalid court sizes. MFA administrators can correct recorded scores with a reason, including completed sessions; season statistics are rebuilt. Administrators can restart a selected round and every later round after reviewing all affected game revisions. Old assignments and scores are retained in the audit log. This is not a one-click undo/restore interface.
- Existing authenticated administrator assurance is reused when returning to Administration; a new code is required only when the session no longer has AAL2.

## Still required before inviting players

1. Reviewed participant waiver and adult/minor decision; versioned legal-name signing workflow with downloadable acceptance receipt, separate optional photo/notification consent.
2. Attendance reminder scheduler and delivery service, spare offers with expiry, reservation/payment checks, and a clear no-response escalation. Proposed flow: open weekly response → remind nonresponders before the 72-hour deadline → release vacancies → offer spares → publish final courts. Facebook can carry the website link; the app should own attendance records.
3. Refund and physical-shuttle credit ledger with idempotent accounting, administrator review and correction. Define refund amount/rounding (400/28 is not an exact cent amount), treatment of rejoining after cancellation and repeated absence changes. Existing RSVP notifications are not refund accounting.
4. Persisted initial seeding, automatic round movement, audited tie decisions, no-show penalty and simple movement correction/undo.
5. Full new-member and multi-user live rehearsal; independent-connection concurrency tests; encrypted external backup/remote restore; production email/domain and launch approval.

No new member emails, real payment verifications or live match results were created during this phase.
