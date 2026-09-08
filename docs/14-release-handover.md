# Release handover — September 7, 2026

## Current status

Hosted TEST: https://maplewood-league-test.pages.dev/

The upgraded app remains on `upgrade/secure-platform` in the TEST checkout. Supabase TEST migrations 001–029 are applied. The original GitHub Pages production site, production checkout and production database remain unchanged. Cloudflare labels the main deployment of this separate TEST project “Production”; that is not the league production database or cutover.

The user created maplewoodbadmintonleague@gmail.com and Cloudflare, and reported Google 2-Step Verification enabled. Supabase SMTP non-secret fields were prepared with smtp.gmail.com:465 and the league sender. The credential setup is **not verified complete**: the user needed help generating a Google app password. The App passwords page is open, and the credential entry/save remains a user handoff. Do not inspect or print password field values.

The user authorized up to four total test messages to christygeorge993@gmail.com and maplewoodbadmintonleague@gmail.com. **Zero of those four messages have been requested/sent in this phase.** No players may be contacted under this authorization.

## Completed evidence

- 150 automated tests passed.
- All 24 desktop/mobile browser cases passed across the full run (22 passed) and targeted rerun (2 passed after fixing the test's combobox locator). New coverage includes explicit organizer identity review and disabled submit until confirmation. Browser Auth/API responses are mocked.
- Build, TypeScript and ESLint checks passed. TEST startup assets approximately 178.5 KiB gzip, below the 220 KiB budget.
- Real local PostgreSQL separate connections passed competing score corrections, last-spare-place payments, six email workers with 90 unique leases, and permit import concurrent with score correction without deadlock.
- The synthetic 25-player/80-game database was pg_dump-exported, AES-GCM-encrypted, decrypted and pg_restore-restored into a different database. Data/security matched across 43 comparisons; anonymous private reads stayed denied. This is **not an actual remote Supabase recovery**.
- Claude completed an independent static review of a code-only snapshot. Findings and remediation are in `16-claude-review.md` and `17-review-remediation.md`. Key fixes cover guardian review, ordinary score overwrites, signed agreement republishing, cancellation/refunds, stale email and penalty reapplication. Low-severity follow-ups remain recorded; no claim of zero defects.
- TEST legacy archive: 32 players, one completed session/36 games, no real current-season signatures or identity links imported.
- Gmail reminder adapter is implemented, with durable pre-send markers and reconciliation after uncertain results. No scheduled live worker is deployed or enabled.

## Next execution steps

1. User generates the Google app password and enters it directly into the prepared Supabase SMTP form, then saves. Verify a real sign-in email using the authorized four-message budget.
2. Configure TEST hosted Auth URLs and complete distinct real member/guardian/admin login acceptance, without treating mocked tokens as real identity tests.
3. Deploy/configure the Gmail reminder worker, scheduler and public signed-unsubscribe endpoint. The present static website deployment does not run server scripts. Private credentials must be supplied directly to the chosen server environment. Test delivery/consent/quotas/unsubscribe before enabling real recipients.
4. Obtain actual remote TEST database connection through private configuration, export and restore to an approved isolated target, verify permissions/data, and separately account for Storage objects. No destructive restore over an existing project is authorized.
5. Final participation text review/publication, production inventory reconciliation and conditional cutover after gates pass. Initial seeding follows real player registration, signing and organizer review.

## Review locations

Member hub: details, season agreement, RSVP and previous matches. Standings: rankings/results. Administration: identity review, approvals, payments, seeding, match-day correction/recovery and previous-season identity linking.

Plan and enhancement priorities: `15-release-plan.md`. No paid subscription was activated, no real payment was marked verified, and no real agreement was signed by the assistant.


## SMTP live check — September 7, 2026

User reported saving the Google app password. One authorized hosted TEST sign-in request to the organizer failed: Supabase Auth logged Gmail SMTP 535 / 5.7.8 (username and password not accepted). Delivery is not verified. Count this as one of the four authorized test attempts; do not retry automatically until credentials are corrected. No credential was recorded. The updated Cloudflare TEST deployment reported Success.

September 8 follow-up: user removed spaces from the app password and saved. Two additional hosted TEST sign-in attempts failed in the UI (three total authorized attempts used, one remaining). Latest detailed cause still being checked; do not infer delivery or credential validity from the generic UI error.

September 8 SMTP follow-up: browser input replacement required ControlOrMeta+A / Backspace; Meta/Super selection had appended text and caused temporary invalid addresses. Final fourth authorized sign-in request still failed in UI. Do not send further test emails without additional authorization. SMTP credentials remain unverified.

September 8 latest SMTP check: after user reported a successful credential update, one additionally authorized hosted TEST sign-in request to the organizer succeeded. The application displayed the One-time code input and its success status. Inbox delivery and completed login remain pending user verification; no code or credential collected. Five total authorized request attempts across this setup, with no further messages authorized by this latest single retry.

September 8 confirmed email login: organizer reported receiving/entering the code; hosted TEST showed authenticated Member hub with real league sessions and private account controls. Administration remained behind its authenticator verification gate. Existing-factor verification form opened for the organizer. This confirms one organizer email/login path, not independent member/guardian accounts or scheduled reminders.

September 8 organizer MFA verification passed on hosted TEST. UI reported second factor verified; Load club records succeeded with Club records refreshed, real season sessions and existing audit events. No league records mutated by this read-only verification. Remaining independent-account, scheduled reminder delivery, and actual remote backup restore gates are unchanged.
