# Maplewood platform — independent security and correctness review

Snapshot: `/Users/christygeorge/maplewood-code-review-20260907` (code only, 98 files).
Reviewer: Claude (Fable 5.1), 2026-09-07. Static review only. Nothing was executed, installed, deployed or sent. Only this file was written.

Scope requested by REVIEW.md: tenant isolation, guardian signatures, score and revision concurrency, ELO replay, rotation preservation, 72-hour refund boundary, spare payment and capacity races, unsubscribe and notification retry semantics. Passing tests were not treated as proof.

## 1. Summary

| # | Severity | Area | Finding |
|---|----------|------|---------|
| H1 | High | Guardian signatures | Guardian consent is self-designated and unverifiable: a minor can sign as their own "guardian" with a second mailbox, or self-sign by entering an adult birth date. Nothing surfaces the birth date or guardian identity to the approver. |
| H2 | High | Match day / scores | Scorekeepers (no MFA, no reason) can overwrite any already-recorded score before completion, including rounds whose results already drove court movement. The UI actively enables this. |
| H3 | High | Authorization / payments | Re-publishing the season agreement (version > 1) silently strips every approved regular of RSVP rights and converts their paid seats into spare vacancies until each re-signs and is re-approved. No notice is sent, and reminders stop for them. |
| M1 | Medium | Payments / policy | Cancelling a session by re-importing the permit bypasses the cancellation policy (no shuttle credits, no `session.cancelled` notice) and can silently reopen a session that was already cancelled with shuttle credits issued. |
| M2 | Medium | No-show penalty | Penalty consumption is one-way: re-saving round 1 with a different plan cannot un-apply a penalty, and the client treats a pending penalty for the *current* session as movable even though the server will never consume it. |
| M3 | Medium | Payments / policy | A pending $14 absence refund survives a school cancellation of the same session, so a player who declined receives cash where the published policy promises none. Needs an explicit policy decision. |
| M4 | Medium | Concurrency | Lock-order inversion between permit import (season → session) and completion / correction / restart (session → season). Postgres will abort one side with a deadlock error that the UI reports as a generic failure. |
| M5 | Medium | Notifications | Deliveries that were never attempted do not age out; with the 90-per-day budget a `session.cancelled` or `spare.available` email can be sent days later, after the session. Only `attendance.*` templates are re-validated at send time. |
| M6 | Medium | Spares | The "first eligible vote" rule is not enforced. Whoever the administrator verifies first wins the place regardless of vote order; the client text promises vote order. |
| L1–L10 | Low | Various | See section 3. |

Controls that reviewed as sound are listed in section 4. What the existing tests do and do not prove is in section 5. Review limits are in section 6.

## 2. High and medium findings

### H1. Guardian consent is self-designated and cannot be trusted (High)

Files: `platform/migrations/024_no_minimum_age.sql:9,14`; `platform/migrations/013_agreements.sql:57-62` (`signing_options`), `:63-76` (`sign_agreement`), `:108-112` (`approve_member`); `platform/src/services/auth.ts:25`.

What the code does:

- `save_eligibility` accepts a self-reported `birth_date` and a self-typed `guardian_email`. The only check on the guardian address is a regex and "not equal to my own sign-in email" (024:9).
- `signing_options` grants guardian capacity to *any* account whose confirmed `auth.users.email` equals that string (013:61). No relationship to the participant is established, no age or identity check on the guardian, no administrator confirmation.
- `requestCode` calls `signInWithOtp` with `shouldCreateUser: true` (auth.ts:25), so any mailbox becomes a confirmed account after one OTP.
- `approve_member` only checks that a `signature_receipts` row exists for the latest publication (013:110). It never looks at `participant_eligibility`, and no administrator screen displays birth date, guardian email, or signer name for review.

Reproduction (two independent paths):

1. Self-guardian. A 17-year-old registers with `kid@x.example`, submits intake, saves eligibility with birth date 17 years ago and `guardian_email = kid2@y.example` (any free mailbox they own). They sign out, request an OTP for `kid2@y.example` (account auto-created), sign in, call `signing_options` (one guardian row appears), and call `sign_agreement` with `relationship='Parent'`. The receipt shows `signer_capacity='guardian'`. `approve_member` succeeds. The `live-test-rollback.sql` and `operations.test.ts` cases pass because the "guardian" in those tests is a different synthetic user, which is exactly what this attack produces.
2. Self-sign as adult. Same minor enters a birth date 19 years ago and no guardian email. `signing_options` returns an adult row; they sign for themselves. After signing, `save_eligibility` refuses corrections (024:11), so a later honest correction needs an administrator function that does not exist in this snapshot.

Impact: the published terms say "All players under 18 require verified parent/legal-guardian consent". The system cannot deliver "verified"; it delivers "a second email address". For a club run personally by the organizer, the liability exposure is real.

Suggested direction (not implemented): have the organizer record the guardian's identity (name and email) before the guardian can sign, show birth date and guardian email in the approval UI, require an administrator acknowledgement on approval for any participant under 18, and turn off `shouldCreateUser` for the guardian flow or gate guardian accounts behind an organizer-issued invitation.

### H2. Scorekeepers can silently overwrite recorded scores without MFA or a reason (High)

Files: `platform/migrations/001_platform.sql:93-102` (`submit_score_impl`), `platform/migrations/009_session_recovery.sql:29-35` (wrapper), `platform/migrations/003_session_engine.sql:11` (only *reassignment* of a scored round is blocked), `platform/src/components/SessionWorkspace.tsx:744-768`.

What the code does: `submit_score_impl` validates the revision and the session being `active`, then unconditionally updates `score_a/score_b`. There is no `score_a is null` guard. The scorekeeper role does not require `aal2` (001:36). The UI computes `correct_score` versus `submit_score` purely on `admin && m.score_a !== null` (SessionWorkspace 756), so a non-admin scorekeeper sees enabled inputs on every scored game and re-saves through `submit_score`.

Reproduction: as any scorekeeper (aal1) on an active session, after round 1 is scored and round 2 has been assigned from those results, call `submit_score(c, m, 21, 0, <current revision>)` on a round-1 match. It succeeds. `assign_courts_impl` refuses to *reassign* round 1 (003:11) but nothing refuses re-scoring it, so the round-2 court movement no longer matches the recorded results. On completion, standings and ELO are rebuilt from the altered scores. The audit row says `score.changed` with no reason. `database.test.ts` "score validation and competing stale submissions" covers revision conflicts only, never overwrite.

Impact: the published rule is "administrators may make audited corrections". Six scorekeepers in the fixture can alter league results without MFA. Also breaks the stated invariant that movement already played is consistent with its inputs.

Suggested direction: in `submit_score_impl` raise if `game.score_a is not null` (force `correct_score`), or at minimum refuse re-scoring any round lower than the highest assigned round.

### H3. Re-publishing the agreement mid-season silently locks out all regulars and hands their seats to spares (High)

Files: `platform/migrations/013_agreements.sql:36` (`publish_agreement` resets approved → pending when `v>0`), `platform/migrations/012_attendance_accounts.sql:23` (`spare_vacancies` counts only `approved` regulars), `:71` (RSVP requires `approved`), `:101` (reminders require `approved`), `platform/migrations/012_attendance_accounts.sql:92` (shuttle credits require `approved`).

What the code does: any re-publication for a season (a wording fix, a second legal review) flips every `approved` registration in that season to `pending`. From that moment, for every scheduled session:

- `submit_rsvp` raises "Regular registration required" for all 25 regulars (012:71), so nobody can give the 72-hour notice that earns the $14 refund.
- `spare_vacancies` = capacity − 0 approved regulars − confirmed spares = 25 vacancies. Approved spares can `request_spare` and be confirmed into seats belonging to regulars who have paid $400 (012:33, 012:46). Once confirmed, a re-approved regular who had said "not attending" earlier is blocked by "Place filled" (012:73).
- `queue_due_reminders` skips pending registrations (012:101), so the people who most need to re-sign are not reminded, and no `agreement.published` notification is enqueued at all.
- A school cancellation in that window gives shuttle credits to nobody among the regulars (012:92).

Reproduction: with the match-day fixture (25 approved regulars), run `publish_agreement(c, season, <text>, 'Typo fix', 1)` as admin. Then `select club_app.spare_vacancies(c, s)` returns 25 for any scheduled session; `submit_rsvp` for any player raises `42501`. `matchday.test.ts` "requires a new season signature" tests a *new* season, not re-publication for the current one.

Suggested direction: on re-publication keep registrations approved but record `requires_resign` (or compare receipt waiver against latest publication only at *approval* time), exclude such regulars from `spare_vacancies`, and enqueue a notice.

### M1. Permit re-import bypasses cancellation policy and can undo a cancellation (Medium)

Files: `platform/migrations/008_revision_guards.sql:43-47`; compare `platform/migrations/012_attendance_accounts.sql:86-94`.

`import_permit` updates an existing session's `status` directly whenever the new status differs, guarded only for `active`/`completed`. A row imported as `cancelled` sets `status='cancelled'` with a `session.changed` notice and no shuttle credits, no audit `session.cancelled`, no spare reconciliation. The reverse also holds: a session cancelled through `cancel_session` (shuttle credits already inserted, revision bumped, `cancel:` notices queued) is flipped back to `scheduled` by re-importing the same permit with the row still marked active, leaving the shuttle-credit ledger rows in place.

Reproduction: seed, `cancel_session` on session 1 (credits issued), then re-run `import_permit` with the original 34 rows and a different `sha256` (any re-scan changes the hash, so the dedup at 008:35 does not fire). Session 1 returns to `scheduled`; `session_accounts` still shows two shuttles per player.

Suggested direction: route status changes for existing sessions through `cancel_session_impl` logic, and refuse to reopen a `cancelled` session by import.

### M2. No-show penalty consumption cannot be corrected by re-saving round 1 (Medium)

Files: `platform/migrations/014_ratings_penalties.sql:74-81`; `platform/src/components/SessionWorkspace.tsx:182-186, 387, 461, 497`.

- `assign_reviewed_courts` marks the oldest pending penalty `applied` when the player appears in `penalties_applied` and in round 1. Re-saving round 1 (allowed until scored) with `penalties_applied=[]`, which the UI does after any manual court edit (461, 497), leaves the penalty `applied` even though the new plan may not move the player down. Only `restart_round(1)` reverts it.
- The client loads *all* pending penalties for the club (182-186) with no session or season filter, so a penalty recorded for the session currently being assigned marks the player `penalized`, `initialPlacement` moves them down, but the server condition `n.session_id<>s` (014:79) never consumes it. The player is demoted this session and again next session.

Reproduction: record a no-show for player P at session S1; at S2 preview round 1 (P moved down, checkbox checked), save; edit a court, save again with the box now cleared. `no_show_penalties` stays `applied` although the reason text may say the penalty was deferred.

### M3. $14 refund survives a school cancellation of the same session (Medium, policy decision needed)

Files: `platform/migrations/012_attendance_accounts.sql:79-80` versus `:86-94`.

A regular who declines ≥72 h early gets a pending `absence_refund`. If the school then cancels, `cancel_session` credits shuttles only to players who did *not* decline and does not void the refund. The declined player therefore receives $14 cash for a session nobody played, contradicting "School/facility cancellations: no cash refund". Whether the earlier notice should still earn the refund is a policy call; the code takes one side silently and the terms take the other.

### M4. Deadlock-prone lock ordering between permit import and match-day functions (Medium)

Files: `platform/migrations/008_revision_guards.sql:31` (season `for update`) then `:41` (session `for update`); versus `platform/migrations/003_session_engine.sql:49-51`, `platform/migrations/009_session_recovery.sql:16-18, 41-44` (session first, then season).

Two administrators, one importing a refreshed permit while another completes or corrects a session in the same season, can deadlock. Postgres aborts one transaction with `40P01`; both UIs show "not confirmed". Data stays consistent, so this is availability, not integrity. Fix is to take the season lock first everywhere or drop the season lock from import.

### M5. Never-attempted notifications do not expire (Medium)

Files: `platform/migrations/015_delivery_privacy.sql:21, 28`; `platform/migrations/022_player_experience.sql:35-43`.

`claim_delivery_batch` fails rows older than 23 h only when `attempts>0`. Rows that were never leased (because `claim_free_email_batch` hit the 90/day or 2,500/month ceiling) stay `pending` indefinitely and are sent when budget returns. `delivery_target` re-validates only `attendance.%` templates. A 25-player cancellation plus reminders can exhaust the day; the cancellation notice for Tuesday may then go out on Wednesday. Retry semantics for *attempted* email are otherwise correct (lease, exponential backoff, cap at 8, Idempotency-Key on the provider call).

### M6. "First eligible vote" for spares is not enforced (Medium)

Files: `platform/migrations/012_attendance_accounts.sql:46`; `platform/src/components/SessionAccounts.tsx:104-106`.

`verify_spare` confirms whichever request the administrator verifies first while a vacancy exists. Two spares vote for one seat; if the administrator verifies the second voter's e-transfer first, that spare is confirmed and the first voter goes to `reconciliation`. The member-facing text promises "the first eligible vote with verified payment takes an available spot". `promote_paid_spares` later orders by `greatest(voted_at, paid_at)`, which is a different rule again. Pick one rule and enforce it in `verify_spare` (for example refuse to confirm a later voter while an earlier unexpired `payment_pending` vote exists).

## 3. Lower-severity findings

- L1. Rotation is reconstructed, not preserved. `SessionWorkspace.tsx:405-411` rebuilds each court's player order from first appearance in the previous round's matches rather than from the `assignments` table, and manual moves append the player to the end (467, 501). The server maps template positions from that order (003:28-34). Result: the position that rests first on the five-player court is scrambled between rounds, and the `offset` parameter of `rotation()` (`courts.ts:66`) is unused by both client and server. Fairness within a round holds; continuity across rounds does not.
- L2. Ties are resolved by UUID. `courts.ts:159` breaks exact standing ties with `id.localeCompare`, so `moveCourts` demotes one of two tied players deterministically but arbitrarily. The app text says tied movement "requires a recorded administrator decision", but the preview never flags a tie.
- L3. Pre-authorization row locks without throttle. `submit_rsvp` (012:68) takes `sessions ... for update` before any authorization or `throttle()`; when operations are enabled and the caller is not an approved regular, it raises before `throttle` runs, so the 30/min limit never applies to that path. Any authenticated user can hammer-lock any club's session rows. Locks are held only for the failing transaction, so impact is contention, not data.
- L4. `spare-vacancy:{session}:{user}` (017:37) has no revision, so a spare is told about a vacancy for a given session at most once ever, even if the vacancy is filled and reopens.
- L5. First assignment flips the session to `active` (003:37) at whatever time the administrator assigns. That closes `request_spare`, `promote_paid_spares`, `withdraw_spare` and reminders (all require `scheduled`) even if done a day early.
- L6. `signing_options` exposes a participant's legal name and grants signing rights to whichever confirmed account matches a typed email (013:58-61), with no throttle. A typo in the guardian address gives a stranger a signable agreement for the child.
- L7. Displayed times contradict the terms. `MemberDashboard.tsx:191` shows the RSVP deadline in the browser's local zone, and the 72-hour refund deadline is never shown; the season rules promise Toronto time.
- L8. In-flight leases older than 23 h are failed underneath the worker (015:28), which then throws "Unable to persist delivery state" (`notification-worker.ts:126-129`) and abandons the rest of the batch until leases expire.
- L9. `registrationClosed` is never enforced server-side. `intake_options` is public (010:50) and `submit_intake` only needs a confirmed email (010:20-38), so anyone can create `members`, `memberships(pending)` and `registrations` rows in the club.
- L10. Hard-coded fee. The refund eligibility check uses `claimed_amount_cents>=40000` (012:79) rather than the season's `regularFeeCents` rule used at approval (013:96).

## 4. Controls that reviewed as sound

- Tenant isolation: every table has RLS enabled (001:38), the browser role has no table write grants, every mutation is a `security definer` RPC with `search_path=''`, implementations are renamed `_impl` and revoked from browser roles, compound foreign keys carry `club_id` everywhere, and `verify-operations.sql` checks these invariants. Cross-club reads are blocked by `is_member/is_admin(club_id)`.
- Administrator MFA: `is_admin` requires the JWT `aal` claim to be `aal2` (001:35) and all money, approval, publication, correction and restart paths check it.
- Revision guards: every stateful RPC validates `expected_revision` against a `for update` row; `restart_round` additionally requires the exact per-match revision map (009:46-48). `undo_round_restart` refuses when replacement work exists and refuses double restores.
- ELO replay: chronological per-round rebuild from completed sessions with frozen ratings per round and mean delta (014:13-27); corrections and restarts rebuild through `rebuild_results` (009:24, 009:54, 016:19). The K5 templates in SQL match `rotation()` exactly (every pair partners once, everyone rests once).
- 72-hour boundary: inclusive at exactly 72 elapsed hours, correct for DST because it compares `timestamptz` instants (012:79).
- Spare capacity race: `request_spare`, `verify_spare`, `submit_rsvp`, `withdraw_spare` and `promote_paid_spares` all serialize on the session row, so over-allocation is prevented (confirmed by the rehearsal's concurrent verify test).
- Refund idempotency: replayed `request_id` with identical payload returns the stored result and skips refund side effects (012:75-77); different payload is rejected.
- Unsubscribe: HMAC-SHA256 token bound to club, user and channel, constant-time compare, service-role-only RPC, loopback listener, no token logging, one-click POST supported.
- Delivery: consent re-checked at send time, sandbox mode forces a test recipient, live mode requires explicit real-recipient enablement, SMS is hard-disabled by policy, secrets are scanned out of the bundle.

## 5. What the existing tests prove, and what they do not

The 137 unit/database tests run migrations on PGlite with a stubbed `auth.uid()`/`auth.jwt()` that reads `request.jwt.claim.sub` and a caller-supplied `aal`. They prove the SQL logic behaves as written under those claims. They do not prove that real Supabase tokens carry `aal2` only after TOTP, that `shouldCreateUser` is acceptable, or anything about Resend behaviour. The 24 browser checks use a fully mocked API; they exercise the React state machine, not the database.

None of the tests exercise: scorekeeper re-scoring of a recorded game (H2); re-publication of an agreement for the *same* season (H3); permit re-import over a cancelled session (M1); re-saving round 1 after a penalty was applied (M2); a cancellation after a refund was created (M3); concurrent import and completion (M4); budget-starved deliveries older than a day (M5); two spares verified out of vote order (M6). The guardian tests (`operations.test.ts:187-219`, `live-test-rollback.sql:30-37`) use a separate synthetic user as guardian, which is the same shape as the self-guardian attack in H1, so they cannot detect it.

## 6. Review limits

- Static reading only. No tests, scripts, migrations or the app were run; no database, browser session, credential or live service was accessed.
- Not in the snapshot and therefore unreviewed: `index.html`, `vite.config.*`, `playwright.config.*`, `eslint.config.*`, `public/` (including `sw.js`, which `check-build.ts` rewrites), `.env*`, `node_modules`. `styles.css` was not reviewed.
- Supabase project configuration (Auth OTP settings, MFA enforcement, JWT claim contents, PostgREST exposed schemas, whether `club_app` is exposed to `anon`) is not visible; findings assume the migrations are applied as written.
- The legacy `public` schema containment (`staging-containment.sql`) and the remote restore drill could not be verified.
- Resend's idempotency window (assumed 24 h by 015:28) and `GET DIAGNOSTICS ROW_COUNT` after `RETURN QUERY` (022:41) were not verified against vendor or PostgreSQL documentation.
- Line numbers refer to files as they exist in the snapshot; several migrations are single very long lines, so a "line" may contain an entire function.
