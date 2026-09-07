# Agreement and attendance automation — September 7, 2026

Confirmed: organizer Christy acts personally, with no registered club entity. Youngest current participant is 16; ages 16–17 use the guardian signing path and adults sign for themselves. verified no-show means one court down; school cancellation means two physical shuttlecocks and no cash refund; absence notice is 72 hours. The waiver-area review copy now displays these policies. It is not a signed or finalized agreement.

## Signing

Incorporate the fee, refund, cancellation, no-show and facility clauses into the immutable published agreement text/hash. Retain verified signer identity, participant identity, signer capacity, version and timestamp; provide a receipt. A minor must not use adult self-signing. Build a separate verified guardian flow; guardian consent does not guarantee all claims of the minor are waived. Counsel/insurer review and exact absence-refund rounding remain outstanding. Do not describe the league as an incorporated or separately registered legal entity. The reported youngest age establishes the current roster age; an exclusion policy for future younger applicants has not separately been agreed. Keep optional messaging/photo consent separate.

## Attendance flow — proposed, not deployed

- Open app attendance seven days before a session. Pin its link in the regular Messenger group.
- Find nonresponders by comparing approved season registrations with submitted responses. Keep “uncertain” distinct from no response.
- Remind unresolved members at 96 hours and again before 72 hours, through enabled email/SMS channels. Re-check response, consent and cancellation immediately before sending; deduplicate person/session/channel/reminder.
- Escalate unresolved responses to Christy at the cutoff. Missing votes do not automatically mean absence, refund eligibility or no-show.
- Offer vacancies to approved spares in a transparent queue. Use atomic, expiring holds so two people cannot take the last spot. The spare group can carry the app link; individual offers live in the app.
- A spare accepts and pays $20. An e-transfer claim remains pending until Christy checks the bank or a verified provider confirms payment. Only confirm an available, unexpired place. Late payments require reconciliation rather than overbooking.
- Assign eligible, confirmed attendees with completed agreements to courts; reconcile actual attendance before penalizing no-shows.

Email/SMS providers, verified senders, consent/unsubscribe handling and scheduler deployment remain required. No reminders were sent or providers activated.

## Messenger research

Meta's documented Messenger Platform is Page-based and imposes recent-interaction/allowed outside-window requirements. No supported API for reading personal Messenger group poll votes or automatically messaging its nonvoters was identified. Do not equate Page messaging with personal group access. Keep voting in the app to reliably identify members and avoid a fragile chat-scraping dependency.

Meta official collection:
https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api?entity=request-22794852-31d80e54-aa3d-4c64-9e01-14925626797e

CRTC guidance for commercial email/text covers consent, sender identification and unsubscribe:
https://crtc.gc.ca/eng/com500/faq500.htm

## ELO placement — requested, not implemented

The existing win/points percentages are not ELO. Seed initial ratings from Christy's order and label newcomers provisional. Publish doubles rating calculations and round weighting; avoid accidentally weighting the five-player court more heavily because players play extra games. Resting players receive no match outcome.

Sort confirmed attendees by rating and form playable courts: with 25 players, 4/4/4/4/4/5. Keep the one-court no-show penalty separate from ELO; use a capacity-preserving swap and handle the bottom-court edge case explicitly. Use initial seed order for equal ratings. Preview before publication, with administrator corrections.

Recommended distinction: use ELO for starting placement, then ladder results for movement during the night. Re-sorting by ELO after every round can conflict with the promised ladder format. Corrected historic results must rebuild ratings chronologically and invalidate stale unpublished plans.
