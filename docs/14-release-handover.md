# Release handover — September 7, 2026

## Status

The upgraded app and legacy-history implementation are saved on `upgrade/secure-platform` in the TEST checkout. Migrations 001–025 are applied to the separate Supabase TEST project. Production files, database and public website remain unchanged. This is not a production release sign-off. The user confirmed that Cloudflare and the dedicated league Gmail account are not ready.

## Verified work

- 137 automated tests passed, including archive access isolation, verified identity linking, invalid historic scores, agreements, refunds, no-shows, ELO, corrections and recovery.
- All 24 desktop/mobile browser tests passed, including previous matches, archived results and tested accessibility states. Connected browser cases use mocked API responses and are not independent real Auth account tests.
- ESLint and the TypeScript production build passed; startup bundle approximately 177.5 KiB gzip, below the 220 KiB budget.
- A real local PostgreSQL 17 rehearsal used separate simultaneous connections: one score edit succeeded and one stale edit conflicted; two payments for the last spare place produced one confirmation and one reconciliation; six email workers leased 90 unique jobs.
- The synthetic 25-player, 80-game database was exported with pg_dump, encrypted using AES-256-GCM, and restored with pg_restore into a separate database. Data, Auth fixture rows, policies, grants and functions matched across 42 comparisons. Anonymous private reads remained denied. This verifies the recovery mechanism, not recovery of the actual remote Supabase database. The temporary database server was stopped.
- TEST archive result: one archive, 32 legacy players, one completed session (36 games), zero identity links and zero real current-season signatures. Original protected tables are retained.

## What Christy needs to provide

1. Create the free Cloudflare account and dedicated league Gmail account, then sign in through the browser. Do not paste passwords or app passwords into chat. No domain purchase is necessary for a pages.dev address.
2. Finish review of the participation agreement, especially guardian participation and the organizer wording. Publish only the reviewed version. No waiver can guarantee absolute legal protection.
3. Make the approved TEST database connection available through private configuration for an actual external backup/isolated restore, and provide separately controlled test mailboxes for independent member/guardian/admin Auth checks. No destructive restore over an existing project is authorized by this checklist.
4. After players register and sign, approve eligible registrations and set initial seed order. Historical identity links can then be reviewed.

## Engineering still required before launch

- Configure public hosting, Auth URLs and delivery endpoints.
- Implement/configure and verify the selected free Gmail delivery path (the current worker uses Resend, which needs a verified domain). A Gmail account alone does not make notifications operational. Verify Auth email, reminders, unsubscribe, quota behavior and scheduled execution end to end. SMS remains disabled; no paid subscription was activated.
- Exercise independently issued real Auth sessions, guardian identity separation and privileged admin flows. The latest browser session returned to the MFA/sign-in gate.
- Export and restore the actual remote TEST database into an approved isolated target, verify counts, permissions and authentication behavior, and separately account for Storage objects. The local synthetic backup and Supabase daily-backup listing do not satisfy this gate.
- Verify production source inventory and reconcile any differences from TEST, archive it, then link only reviewed identities. TEST counts must not be represented as production counts.
- Re-run release checks for the configured deployment and complete production cutover only when the conditional approval gates pass.

## Where to review

Local connected app: http://127.0.0.1:5174/

Members: Member hub → previous matches and Previous seasons. Standings has current rankings/results. Administrators: Administration → Previous-season archive and identity links (requires current verified administrator MFA).

No real member notifications were sent in this pass; no payment was marked verified for a real member; no old signature was converted into a new-season signature.
