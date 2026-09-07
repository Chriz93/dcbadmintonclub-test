# Operations runbook — TEST only

## Deployment status

Migrations **001–023 are applied to TEST wgolevihkvmosajumzvl**. Migrations 022–023 add season-scoped seeding, personal match history, free-email budgets and rehearsal fixes. The live permission audit passed and Maplewood operations are enabled with the confirmed $14/72-hour/physical-shuttle policies. Do not replay these migrations. Production has not been upgraded.

The live rollback rehearsal passed refund, spare, guardian, scoring, ELO and restart/undo checks; that earlier rehearsal rolled back its data. A separate 25-player, 80-game rehearsal now remains in TEST for review; see `12-matchday-review.md`. Member agreement and session-account screens loaded in the real signed-in app. The user renewed administrator verification successfully; club records, attendance/accounts and club setup loaded against TEST.

Validate with separate adult, guardian and administrator accounts in TEST: intake, agreement, payment approval, RSVP/refund, spare booking, attendance, first and subsequent rounds, score conflict, completion, correction, restart/undo. Local synthetic tests are not a substitute for this live acceptance pass.

## Scheduled reminders

Install Node 24 and project dependencies on a private server. Copy `platform/scripts/operations.env.example` outside the repository, restrict permissions to 0600, and populate secrets through the host's secret manager. The browser must never receive the service-role, mail or database keys.

Invoke `node --env-file=/PRIVATE/PATH/operations.env --experimental-strip-types scripts/notification-worker.ts` from `platform/` once per minute using the host scheduler. Do not activate this schedule until sender/provider setup and an authorized test are complete. Multiple invocations use database leases, but monitor abnormal overlaps.

Start with `DELIVERY_MODE=provider-sandbox` and `ALLOW_REAL_RECIPIENTS=false`. Only the Resend sandbox recipient is used; SMS is suppressed. Live delivery requires explicit operator enablement, a verified free-tier email sender, per-member email consent, and an authorized test recipient. SMS is disabled under the zero-cost policy. The worker reserves at most 90 emails per UTC day and 2,500 per UTC month, leaving headroom within Resend Free (100/day, 3,000/month). These are application limits, not visibility into other senders sharing the account. Court changes are in-app only, avoiding 100 emails across four rounds. The signed no-login unsubscribe endpoint is implemented in `scripts/unsubscribe-server.ts`: host it behind HTTPS, set the same signing key in worker/server, and configure `UNSUBSCRIBE_URL` plus the organizer contact in `SENDER_CONTACT`. GET shows confirmation; POST disables only the signed club/person/channel. Never log token-bearing URLs. Test public routing before delivery enablement. Complete delivery-policy review before enabling bulk notices.

The worker is deliberately guarded to this TEST reference. A future production worker needs a separate reviewed deployment configuration. The supplied code does not silently enable production.

Monitor pending age, failed counts, expired processing leases, and worker exit status. The admin screen displays delivery states. “Accepted” means the provider accepted the request, not proof of inbox/handset delivery. There is no delivery webhook integration yet. Do not blindly retry uncertain SMS or email beyond provider idempotency retention; reconcile provider IDs first. Retrying an old job with a new key can duplicate delivery.

## Backups and recovery

`backup:test` requires pg_dump, a private TEST database connection, a 0600 file containing 32 random key bytes, and a new output path. It streams a custom-format dump into authenticated AES-256-GCM encryption, verifies decryption, and writes an encrypted 0600 file. Keep the key separate from backups. The command is not a scheduled or verified remote backup service.

Before launch, restore a backup into a separate disposable database, verify row counts, RLS/grants, private account records, signatures and match history, and record restore time. Never restore over the active database. Local tests restore a synthetic PostgreSQL archive and test encryption tampering; no remote restore or recovery time is claimed.

## Session corrections

Refresh before editing. Use Courtside for scores and court plans; use Administration → League operations for verified absences, no-show decisions, seed order, spare payments and refund/shuttle ledgers. A scored round requires restart before reassigning it. Restart preserves an audit snapshot; undo is allowed only before replacement work would be overwritten. Historical score changes rebuild stats and ELO. A cash ledger marked settled means Christy separately completed the payment.

## Remaining launch dependencies

- Remaining distinct-account browser acceptance checks.
- Reviewed agreement from Christy; initial seed order after players onboard.
- Public hosting/domain and completion of the user’s conditionally approved production cutover gates.
- Sender/provider credentials, consent/unsubscribe setup and authorized delivery test.
- Verified encrypted external database backup and isolated restore.
- Legacy member identity mapping if historical production records are to be migrated.

No production code/database was changed; no club messages were sent in this phase.
