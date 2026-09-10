# Registration requests and the Players list — 9 September 2026

Christy's confirmed policy: anyone with the website link may sign in and submit a registration request. Only the organizer approves a place. This supersedes the invitation-only onboarding policy in earlier reports and migration 030 for the platform app.

## Player and administrator workflow

1. A new player verifies their email and lands on registration. The form uses that signed-in email and collects legal/display names, phone, emergency contact, regular/spare choice and an optional e-transfer claim.
2. Submitting creates a pending request. It does not verify a payment, reserve a place, assign ELO or grant member access. The player continues to the season agreement and approval status. Saved details reload on return; updates use the existing revision check.
3. Administration → Players automatically loads named registrations. All, Pending, Approved, Waitlisted and Rejected filters, season selection and name/email search cover both incomplete applications and approved players. Review player exposes private contact/payment details and explains missing approval checks.
4. Review payment opens the existing payment verification screen. Review participant / guardian opens the independent identity review. Successful identity review refreshes Players.
5. Approve player uses the existing server-enforced signature, identity/guardian, payment and capacity checks. The list refreshes after approval; the approved applicant remains visible. Regular approval cannot exceed 25. Spare membership approval does not reserve a spare session.
6. The player refreshes membership to enter the league. Initial ELO still follows Christy's seeding after approval. Each future season retains its separate agreement requirement.

## Implementation and verification

- Migration 038 removes only the invitation gate from `submit_intake`, rejects unverified identities and prevents self-editing a reviewed registration. The internal intake implementation remains private. A new MFA-protected `registration_review_list` supplies the organizer's list without exposing contact tables to other members.
- 1,210 unit/database tests pass in 24 files. Eight new SQL cases cover shared-link requests, unverified callers, private administration, duplicate/stale submission, agreement checks, approval, the 26th regular applicant, cross-club access and signed agreement immutability.
- The browser suite has 110 desktop/mobile cases. Its first full run passed 109 and caught a saved-details reload race in the new case. The form now disables edits immediately while reloading. The complete SQL-backed registration → edit → adult signature → independent admin identity review → approval → member access flow then passed three consecutive runs on each device profile (six runs). Clean CI is the final release gate.
- The browser registration test uses separate player and administrator contexts backed by actual migrations, SQL functions and row-level policies in isolated PGlite. Only authentication and HTTP transport are synthetic. No actual member identity, payment or legal signature is simulated in the hosted database.
- TypeScript, lint, build and dependency audit pass. Domain/config coverage is 96.98% statements and 93.64% branches; those percentages do not represent all React screens.
- Submission and lookup timeouts provide retry guidance. Saving an updated request preserves a single application, and approval refreshes the list. Contact data remains private.

## TEST database deployment evidence

Migration 038 was applied through the authenticated Supabase dashboard to project `wgolevihkvmosajumzvl` only. Deployed function body hashes match the local migration:

- `submit_intake`: `5b0b17ba64daa4f860645099b82d1e9c`
- `registration_review_list`: `88b093397047a2a7aa369e859a3d42a7`

The list RPC grants execute to authenticated callers and checks administrator MFA internally. Anonymous execute is false; authenticated execute on the internal intake implementation is false. Before/after counts are unchanged: 50 registrations, 50 synthetic signature receipts, 56 member profiles, 160 matches and 200 rating-history entries.

## Scope

This is the platform TEST preview release, not a production launch claim. The remaining live acceptance gates in report 25 still apply. Reminder credentials remain deferred; no emails were sent in this change. The repository-root legacy project is being modified independently and is not part of this deployment.

## Published release

- Source commit: `ea9ca0df8d9fa984f46fd8f42d50707eb21736ce`.
- [Clean GitHub quality run](https://github.com/Chriz93/dcbadmintonclub-test/actions/runs/34432888283) passed, including all 110 browser cases, 1,210 unit/database tests, lint, build and dependency audit.
- Cloudflare confirmed **Success** in **Preview**, name `league-release`: https://league-release.maplewood-league-test.pages.dev/ . The Production environment was not selected.
- Archive: `/tmp/maplewood-registration-release-20260909.zip`, 28 compiled public files, SHA-256 `31f9245ed8f81266c6b6b24d07440188146c721537d764295b10c5be1bae258d`.
- A fresh hosted tab loaded `assets/index-DCyHOgrb.js`, matching the TEST build and its version metadata. The live sign-in page explains that new players submit a request after signing in and Christy approves their place. The original signed-in tab was preserved; its running code requires a refresh to receive the new release.
- This update did not send sign-in codes, grant a real account player/admin access, or publish a real agreement. The new signing/approval rehearsal used isolated synthetic data.
