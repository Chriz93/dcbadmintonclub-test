# Auth-first league workflow — 2026-09-08

The organizer requested the familiar workflow of the original GitHub Pages app: sign in, register, then use a small set of league tabs. The old source was reviewed for its quick actions and conditional navigation. Its email-only localStorage identity and PIN access were not reused; the upgraded app continues using verified Supabase sessions, database authorization, and administrator MFA.

## Player flow

1. The connected TEST URL opens directly at email sign-in. Private components do not mount before authentication. An email change clears the previous code; verification always uses the address to which the code was requested.
2. An account without active membership lands at **Your registration**: **Player details → Season agreement → Approval status**. Saving details advances to the agreement. Moving between steps preserves entered form values within that registration visit. Closed registration still checks the confirmed-email list on the server.
3. Guardians can open agreement signing directly without registering themselves as players. Existing published agreement hashes, separate guardian identity review, and receipts are retained. Each season continues to require its own agreement.
4. Active members land at **Home** with upcoming sessions, their response/court summary, RSVP, and previous matches. Older seasons remain available in an expandable history section.
5. Primary tabs are **Home, Courts, Standings, Schedule, My account**. Registration, agreement renewal, profile, reminder preferences, privacy and exports are in My account. Standings retains results and ELO. Court/score permissions still come from the database.

Navigation visibility is not authorization. A failed membership read shows a retry state and does not expose a protected workspace. Signing out unmounts all private views. Refreshing the page still requires signing in again because tokens remain memory-only.

## Administrator flow

Active club owners/admins have a separate Administration button; player registration is not a prerequisite. Home has shortcuts to manage the league or run a session. Administration opens with verified admin controls, and the permit importer is collapsed below them. It links directly to match-day controls: check-in, assignments, scoring, reviewed movements, corrections/restart/undo and completion. Existing MFA, reasons, revisions and audit requirements are unchanged.

## Verification and deployment scope

- 161 unit/domain/PostgreSQL regression tests passed.
- Full 34-case desktop/mobile Playwright suite passed with synthetic intercepted APIs. New cases cover the sign-in gate, code/email binding and retry, registration steps, closed intake/guardian access, failed membership reads, sign-out, and owner access without player registration.
- After preserving form values between registration steps, all 14 affected desktop/mobile workflow and agreement cases passed again.
- TypeScript build and ESLint passed; startup assets remain below 220 KiB gzip.
- Read-only Supabase TEST metadata check confirmed `my_upcoming`, `my_invitation`, `eligibility_review_queue`, and assignment `ordinal` exist remotely. This supersedes the older note that migration 030 compatibility was unverified; it is not a full audit of every remote function body.
- No database data/rules, payments, signatures or emails were changed by this work. Original GitHub Pages production remains untouched.

Remaining launch gates are separate from this workflow change: final reviewed agreement publication, actual independent-account/reminder tests, complete reminder worker configuration, and an isolated restore of an actual remote backup. The paid-spare cancellation exception introduced in migration 031 still needs an unambiguous organizer decision before public launch; this change does not amend that policy.

## Published TEST verification

Source commit: `275470f`. Cloudflare direct upload to the existing `maplewood-league-test` project reported Success on 2026-09-08. Uploaded only the nine compiled static files in `platform/dist`; no source, environment files, database export, or server credentials were uploaded. Local archive SHA-256: `8d66dc9237ec346a07eb8749a6153910556b0f23c3ad7bf3aedf4e8deb8b26f8`. The upload artifact restricts CSP connections to the exact TEST Supabase hostname.

A fresh browser tab at https://maplewood-league-test.pages.dev/ visibly showed the new sign-in front door. Its DOM loaded `index-Bp9bonus.js` and `index-7NJ17fDh.css`, matching the built asset filenames, and captured browser error logs were empty. A separate Python HTTP verification received 403, so independent HTTP/header and byte-for-byte remote verification was not obtained. The deployment was verified through Cloudflare success and the live browser. No new real sign-in email was sent in this turn.

This was a static UI update. It did not deploy or enable the reminder worker/Pages unsubscribe function, publish a reviewed agreement, change database business rules, or launch the original production league.
