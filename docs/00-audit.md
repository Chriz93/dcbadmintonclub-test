# Product and security audit — 2026-09-06

Scope: local production and test source, git differences, setup, manifest, worker and embedded tests. The initial audit was local-only. The authorized TEST dashboard inspection and containment below were completed later on 2026-09-06. Production database policy state remains unverified.

## Evidence and existing behavior

Production HEAD `445d327`; test HEAD `bc13763`. Both have unrelated untracked `.claude/` work, left untouched. Source archives including Git history are outside the repos at `/Users/christygeorge/dcbc-private-backups/2026-09-06`; every archived file verified against its source. These are NOT database backups.

Both apps are ~9,000-line HTML applications with embedded CSS/JS and tests. Features: invite gate, email lookup sign-in, registration with signature/waiver and health/contact data, approval and waitlist, regular/spare fees and payment status, attendance/no-show counts, pre-session attendance, six-court assignment and drag/drop, score entry, two-round soft limit, promotion/relegation with coin-toss tie overrides, undo, completed-session summaries, statistics, announcements, questions, CSV/PDF/share, snapshots, install manifest and worker. These remain in the legacy source while the replacement is qualified; new UI is not a claim of feature parity.

Documented tables: `players` (identity, email, phone, emergency, medical, signature, waiver, paid, current/highest court, wins/losses/games/no-shows/type), `announcements` (documented content; runtime expects type/title/body), `app_state` (unique key, JSON encoded as text). Runtime expects additional approval, waitlist, registration date and admin-note fields absent from setup: schema drift.

KV inventory: `current_session`, `completed_sessions`, `player_approvals`, `membership_overrides`, `pre_session_attendance`, `round_snapshots`, `qa_questions`, `admin_pin`, `invite_code`, `votes_session_N`, `rsvp_session_N`, `snapshot_ISO`. Session contains id/number/date/cycle/assignments/initialAssignments/scores/movements/completed/preTosses and attendance extensions. Scores use `cN_yN_gN` keys and side player IDs, scores and winner. Preserve unknown keys in quarantine during migration rather than discarding them.

Court engine: hardcoded NC=6, NG=3, eight April–May 2026 dates interpreted in browser timezone. Four players get three doubles partner combinations; three get three singles pairs; two repeat singles three times; five get no combinations. First-to-21/no-deuce UI allows admin-confirmed ties and incomplete terminal scores. Round ranking sorts wins, raw points, point difference, then ID, with recorded top/bottom tosses; all-tied courts have special movement behavior. Raw totals disadvantage players with fewer games and 15-point modes. Completion and movement write multiple mutable JSON objects and player totals separately.

Auth: email existence stored in localStorage is treated as sign-in; admin PIN is read from public KV with a source fallback. `adminUnlocked` only gates UI. All REST requests use the anonymous key. No verified user identity, trusted role enforcement, MFA or tenant boundary. Publishable anon keys are not privileged secrets, but cannot make permissive policies safe.

Sync: loadAll fetches private player rows, announcements and 7–9 KV records every 15 seconds per open tab. A parallel raw realtime socket reloads state; reconnects create heartbeat intervals without cleanup. Approximately 2,160–2,640 REST reads per active tab-hour, before writes/realtime, inferred from source, not measured usage. Growing completed_sessions/snapshots repeatedly transfer full JSON; snapshots duplicate personal data in the same database.

PWA: worker caches broad non-Supabase fetches (including external responses), attempts offline API fallback, deletes ALL other origin caches on activation. Production/test share GitHub origin. Test differs in project URL, branding, scope and some storage names, but RSVP keys and test setup still touch production-prefixed localStorage. Test results reader/writer keys disagree. Viewport prevents zoom. Widespread interpolated HTML needs systematic escaping review; several attribute/class interpolations are not validated.

Tests: embedded test runner stubs network and mutates global state, hundreds of assertions mixed with unconditional pass markers; no package/CI/coverage/browser automation or real policy/concurrency suite. Do not execute legacy app on production to test it. Test/production logic differs in projected rankings and return shapes, so copy/paste deployment is unsafe.

## Prioritized issues

| Priority | Finding | Required release gate |
|---|---|---|
| P0 | Documented anonymous full read/write to sensitive data | Verify deployed policies; revoke legacy access in coordinated maintenance cutover after external backup |
| P0 | Fake identity and client-only PIN | Auth + trusted role checks; admin AAL2 |
| P0 | Lost updates and forged scores/RSVPs | Transactional RPC, version checks and idempotency |
| P0 | No tenants or private/public split | Tenant FKs, RLS, restricted RPCs, adversarial SQL tests |
| P1 | Shared-origin caches/storage | Narrow shell cache and separate origin for new auth app |
| P1 | Snapshots in same DB, incomplete key list (`pin` vs `admin_pin`) | Encrypted offsite dump and restored verification |
| P1 | No consent/retention/notification queue | Explicit preferences and durable outbox |
| P1 | Five-player engine missing, DST/schedule hardcodes | Domain tests and permit review |
| P1 | Accessibility, exception swallowing, dependency CDN | Component rewrite, CSP, browser/a11y gates |
| P2 | Excess polling/whole-state transfer | Indexed targeted queries, no idle polling |

## Production boundary

No production changes or publication are authorized. Local test containment cannot revoke policies on a remote database. Current production exposure remains until an explicitly authorized coordinated cutover. The legacy app is preserved as migration evidence, not considered safe for continued public access.

## Authorized TEST verification — 2026-09-06

Confirmed dashboard project `dcbadmintonclub-test` (`wgolevihkvmosajumzvl`), Canada Central, healthy, currently labelled nano. Initial live audit found three public legacy tables with RLS enabled but twelve unconditional anonymous policies, and zero Auth users. Exact counts: 32 players, 0 announcements, 26 app_state records.

Created `upgrade_backup_20260906`, copied all three tables and policy definitions under a table lock, compared deterministic logical content hashes, and revoked all schema/table access for public/anon/authenticated/service_role on the snapshot. Revoked public/anon/authenticated grants on the three legacy tables. Verified anonymous player SELECT, state UPDATE and snapshot schema USAGE all false. No individual player records were displayed or exported. This protected internal snapshot is not an offsite backup or a complete remote restore rehearsal. Dashboard also showed seven daily physical backups; storage objects are excluded.

Applied additive migrations 001–006 through the dashboard. The dashboard RLS protection was used for migration 001; actual verification found 24 new tables, zero without RLS, zero anonymous table grants and zero authenticated non-SELECT grants. Only `public_schedule` and `registration_options` are executable by anon. Seeded 28 scheduled / 6 cancelled sessions / 56 hours and six courts, preserving all 32 legacy players; no new member identities were created. No production or billing changes. One user-authorized Auth test email was subsequently requested; delivery and sign-in await user verification.

Follow-up: migrations 007–008 were applied for minimal tenant roster reads and explicit revision/totals validation. The user completed one authorized OTP email sign-in and TOTP administrator verification. One test owner membership was added after checking the verified Auth UUID; none of the 32 legacy players were migrated. Actual RSVP revision/audit, private profile, admin reads and attendance were verified without notification consent/jobs. A read-only local calendar endpoint serves the public schedule. Production remains unchanged.
