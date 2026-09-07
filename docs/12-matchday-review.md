# Maplewood match-day review — September 7, 2026

## What Christy can review

Open the connected TEST app at http://127.0.0.1:5174/. In **Standings**, choose **Synthetic 25-player rehearsal**. The saved results contain 25 fictional players, six courts and four rounds (80 games). Christy's account has administrator access to the isolated **TEST ONLY — Match-day rehearsal** club. All fake names start with TEST and email addresses end in example.invalid. Synthetic signatures and payment fixtures are not actual agreements, payments or legal review. No delivery consent was enabled and no messages were sent. The real Maplewood season still has 28 scheduled sessions, six cancellations and no signed participants.

The fixture is intentionally retained for review. Do not rerun its inserts: fixed IDs and unique club slug deliberately reject duplicate creation. Generator: `platform/scripts/matchday-fixture.ts`. It inserts fictitious verified identities and payment preconditions, then invokes eligibility, signing, approval, seeding, assignment, scoring and completion RPCs. Operator JWT claims simulate roles; this is not verification of 25 independently issued Auth tokens or 25 real bank payments. Two synthetic administrators and six court scorekeepers keep the rehearsal within normal rate limits. Production was not modified.

## Player experience and season enrollment

- Signed-in players no longer see another login form. Attendance and previous games are visible; registration, reminders and privacy controls are collapsible.
- **Member hub → My previous matches** shows date, win/loss, score, court, round, partner and opponents, with older-result pagination. The RPC uses the signed-in identity and accepts no arbitrary player ID. Errors retain already loaded results and offer retry.
- **Standings** shows completed-session games, wins, win percentage, points percentage and ELO. Exact statistical ties share a displayed rank. Court movement breaks remaining exact ties deterministically by stable player ID.
- Only registration approved after a current-season signature is eligible for seeding. Private pending onboarding data is necessarily saved to prepare the signature; it is not an approved playing roster entry.
- Each new season requires a new season-specific agreement, including guardian consent where applicable. Previous receipts are retained. This is the application policy, not a claim of guaranteed waiver enforceability. Christy's review of the final agreement remains pending.

## Verification and fixes

**124 automated tests passed** across 11 files; **24 desktop/mobile browser checks passed**. TypeScript production build and ESLint passed. Startup assets are approximately 176 KiB gzip (220 KiB budget). Browser Auth/provider scenarios use intercepted synthetic responses; live database RPC and signed-in standings checks provide separate evidence.

New deep checks cover:

- 25 signed and approved players; 100 round assignments; all 80 games completed; standings independently matched to 320 player-game appearances.
- Five-player Court 6, 15-point games, fair partnerships/rests; 2–50 players across 1–10 court configurations over eight movements, with capacity rejection and no lost/duplicate players or singleton courts.
- Exact standings ties; no tied terminal scores; 15/21 targets and unequal-game normalization.
- Season-signature isolation, administrator MFA, exclusion of unsigned seeds, private match history, forbidden privileged email leasing.
- Competing stale score corrections, chronological ELO rebuild and exact reversal without inflating played counts.
- Rewind of rounds 3–4 from the full match day and undo restoring all 80 games and exact ratings. This passed locally and in live TEST; recovery mutations rolled back.
- Free-email daily/monthly caps, no SMS sends, 30-write allowance and rejection of the 31st write, $14 refunds at exactly 72 elapsed hours and denial one millisecond late.

Existing suites additionally cover minors/guardian signing, spare payment verification/capacity, refund idempotency, school shuttle credits, verified no-shows and reversal, tenant access, malicious/null/stale inputs, incomplete sessions, restart conflicts, delivery retries/unsubscribe, offline read-only behavior, and backup encryption/restore of a local synthetic archive. Passing these tests does not exhaust all possible races, devices or failures.

The rehearsal exposed and fixed two issues:

1. Administration-only identities appeared as provisional ELO players. They are now excluded while historical player results are retained.
2. Four rounds could generate 100 court-change emails. Those updates now stay in the app, preserving the free email allowance for actionable reminders and spare notices.

Live post-migration verification: **25 synthetic ratings, 80 synthetic games, 28 real scheduled sessions, six real cancellations, zero tables missing RLS, zero browser-executable private implementation helpers/free-email leasing functions.** Migrations 022 and 023 are applied; do not replay them.

## Free notifications

No paid notification subscription was activated. The email worker is prepared but is **not sending or scheduled** until sender credentials, public HTTPS unsubscribe routing and an authorized recipient test are configured. It reserves at most 90 emails/day and 2,500/month, including retry reservations. These limits leave headroom within [Resend Free's published 100/day and 3,000/month limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits), but cannot account for unrelated applications sharing that account. Use the Free plan; do not enable paid overages. Pending reminders are rechecked for current response/consent before sending.

There is no sustainable free SMS provider configured. [Twilio's free SMS allowance is a time-limited trial](https://www.twilio.com/docs/usage/trials), so SMS is disabled rather than depending on future charges. Email plus in-app voting is the current no-additional-subscription path. This does not cancel or change the existing Supabase Pro subscription. Personal Messenger group polling/reminder automation is not implemented; pin the app link in both groups.

## What remains before launch

From Christy: review the final participation/guardian agreement; identify the public website/domain and usable free email sender account; finish seeding only after members register, sign and receive approval. Payment claims still need bank verification. The app cannot independently certify e-transfer receipts.

Engineering/operational gates: configure and verify email delivery/unsubscribe and the scheduled worker; restore an external database backup into a separate disposable database; complete independent adult/guardian/administrator browser acceptance and genuine multi-connection concurrency checks; reconcile old identities if last season's records must be imported; then publish and verify the production cutover. No PostgreSQL server/pg_dump or Docker executable was available in the current shell for an independent local multi-connection rehearsal. Local PGlite and live single-operator SQL do not prove that concurrency gate.

Useful next enhancements, in order: a clear next-session/current-court shortcut on the player home screen; a compact attendance/nonresponder summary for Christy; delivery/bounce visibility after the free sender is active. Optional browser push could supplement email later without SMS fees, but requires device permission and its own testing. Avoid adding social feeds or a complicated player dashboard.

## Age-policy correction and no-domain setup — September 7 follow-up

Christy corrected the policy: **no minimum participant age**; all under-18 participants require the separate guardian workflow. Migration 024 is applied to TEST and the visible rule summary is updated. Existing immutable receipts are not rewritten. 125 automated tests pass, including a 12-year-old eligibility record, blocked self-signing and the designated guardian signing option. The production build passes.

Recommended no-domain path: Cloudflare Pages Free with its provided pages.dev address, plus a dedicated consumer Gmail sender to evaluate for low-volume SMTP/Auth and reminder delivery. No Cloudflare account, Gmail sender, SMTP credentials or Gmail reminder adapter has been configured. Resend requires a controlled domain to send to players, and Supabase's default mail sender only serves organization team addresses, so ordinary independent-account email testing depends on sender setup. Gmail's published limits are not delivery guarantees. Keep SMS disabled. Use separate adult, child, guardian and administrator Auth identities; verify inbox delivery and forbidden cross-account reads with real tokens after sender setup. This supplements, rather than replaces, the existing simulated role tests.

Sources: https://developers.cloudflare.com/pages/platform/limits/ ; https://developers.cloudflare.com/pages/configuration/custom-domains/ ; https://resend.com/docs/api-reference/errors ; https://supabase.com/docs/guides/auth/auth-smtp ; https://support.google.com/mail/answer/7104828 ; https://support.google.com/mail/answer/22839 .
