# Operations runbook — TEST only

## Deployment status

The local implementation includes migrations 001–021. The remote TEST project was previously verified through 011. Applying 012–021 is blocked while the Mac is locked and the authenticated dashboard is inaccessible. Do not turn on operations against an older schema or share the localhost link as a public website.

Apply each new numbered migration once, in order, in project **wgolevihkvmosajumzvl**. Each file is transactional. If one fails, resolve it before advancing. Never apply these files to production without a reviewed cutover. Then run `scripts/verify-operations.sql`, apply `scripts/enable-maplewood-operations.sql`, and verify again. Keep legal publication empty until reviewed text is supplied.

Validate with separate adult, guardian and administrator accounts in TEST: intake, agreement, payment approval, RSVP/refund, spare booking, attendance, first and subsequent rounds, score conflict, completion, correction, restart/undo. Local synthetic tests are not a substitute for this live acceptance pass.

## Scheduled reminders

Install Node 24 and project dependencies on a private server. Copy `platform/scripts/operations.env.example` outside the repository, restrict permissions to 0600, and populate secrets through the host's secret manager. The browser must never receive the service-role, mail, Twilio, or database keys.

Invoke `node --env-file=/PRIVATE/PATH/operations.env --experimental-strip-types scripts/notification-worker.ts` from `platform/` once per minute using the host scheduler. Do not activate this schedule until sender/provider setup and an authorized test are complete. Multiple invocations use database leases, but monitor abnormal overlaps.

Start with `DELIVERY_MODE=provider-sandbox` and `ALLOW_REAL_RECIPIENTS=false`. Only the Resend sandbox recipient is used; SMS is suppressed. Live delivery requires explicit operator enablement, a verified sender, verified phone provider configuration for Auth, per-member channel consent, and an authorized test recipient. Configure Twilio STOP handling and the operational contact/unsubscribe process before real use. The signed no-login unsubscribe endpoint is implemented in `scripts/unsubscribe-server.ts`: host it behind HTTPS, set the same signing key in worker/server, and configure `UNSUBSCRIBE_URL` plus the organizer contact in `SENDER_CONTACT`. GET shows confirmation; POST disables only the signed club/person/channel. Never log token-bearing URLs. Test public routing before delivery enablement. Complete delivery-policy review before enabling bulk notices.

The worker is deliberately guarded to this TEST reference. A future production worker needs a separate reviewed deployment configuration. The supplied code does not silently enable production.

Monitor pending age, failed counts, expired processing leases, and worker exit status. The admin screen displays delivery states. “Accepted” means the provider accepted the request, not proof of inbox/handset delivery. There is no delivery webhook integration yet. Do not blindly retry uncertain SMS or email beyond provider idempotency retention; reconcile provider IDs first. Retrying an old job with a new key can duplicate delivery.

## Backups and recovery

`backup:test` requires pg_dump, a private TEST database connection, a 0600 file containing 32 random key bytes, and a new output path. It streams a custom-format dump into authenticated AES-256-GCM encryption, verifies decryption, and writes an encrypted 0600 file. Keep the key separate from backups. The command is not a scheduled or verified remote backup service.

Before launch, restore a backup into a separate disposable database, verify row counts, RLS/grants, private account records, signatures and match history, and record restore time. Never restore over the active database. Local tests restore a synthetic PostgreSQL archive and test encryption tampering; no remote restore or recovery time is claimed.

## Session corrections

Refresh before editing. Use Courtside for scores and court plans; use Administration → League operations for verified absences, no-show decisions, seed order, spare payments and refund/shuttle ledgers. A scored round requires restart before reassigning it. Restart preserves an audit snapshot; undo is allowed only before replacement work would be overwritten. Historical score changes rebuild stats and ELO. A cash ledger marked settled means Christy separately completed the payment.

## Remaining launch dependencies

- Unlocked Mac and authenticated TEST dashboard for migration/live verification.
- Reviewed agreement from Christy; initial seed order after players onboard.
- Public hosting/domain and an approved production cutover.
- Sender/provider credentials, consent/unsubscribe setup and authorized delivery test.
- Verified encrypted external database backup and isolated restore.
- Legacy member identity mapping if historical production records are to be migrated.

No production code/database was changed; no club messages were sent in this phase.
