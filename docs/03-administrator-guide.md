# Administrator guide — local test release

Open `platform/` with Node 24 and pnpm 11.19.0. `pnpm install --frozen-lockfile`, `pnpm dev`. Default mode is disconnected, synthetic data. Never serve the legacy repository root. The root legacy client was contained but its other API functions are retained only as migration evidence.

## Review the preview

Club home: venue, next club night, 28 sessions and 56 hours. Schedule: approved/cancelled filter, individual Google Calendar links, season ICS for Apple/other calendars. Courtside: change attendance and court count, select Court 6, cycle five games and enter practice scores. Practice data exists only in memory. No member database is contacted in demo mode.

Administration: upload a text-based PDF (maximum 10 MB, 40 pages). It is parsed locally; no third-party upload. Inspect extracted text and SHA-256. Only unambiguous ISO date/time/status rows auto-populate; other layouts and scanned PDFs need manual correction. Validate canonical booking text. Check ALL dates, rooms, venue, status and duration against the original. The 2026–27 supplied transcription has 28 active / 56 hours and six explicit cancellations. No PDF authenticity claim is made.

## Connected test workflow

Create an isolated test project or use a verified existing test project. Set `.env` from `.env.example` using a modern publishable key and explicit test project reference. The production reference is refused. Apply numbered SQL migrations in order to the test DB; expose `club_app` in Supabase API settings. Only RPC functions explicitly granted are callable. Never add blanket policies to make a test pass.

Create synthetic Auth accounts through approved Supabase tooling and use verified email. Assign the initial owner via a reviewed operator SQL transaction after verifying its Auth UUID; never infer ownership from an email in a browser. Member sign-in uses OTP, in-memory session only. Admin signs in via Member hub, then uses Administration to enroll/verify TOTP. All privileged RPCs require `aal2` plus a database role. Owner/platform-owner bootstrap and role management remain operator workflows; no browser role editor is shipped.

The guarded administrator screen supports loading pending registrations, approval/waitlist decisions, session cancellation, recent delivery states and audit events. The connected member screen supports own RSVP revisions and email preferences. Permit commit requires PDF provenance, confirmed preview, tenant/season/venue UUIDs and administrator MFA. These UUID fields are a staging integration surface, not a finished end-user season builder.

Server RPCs provide attendance, whole-plan court assignment, score submission, session completion, private export and deletion requests. In connected mode, Courtside loads club/session records, checks in members and previews assignments for explicit confirmation. Only verified admins assign/complete; scorekeepers can check in and submit scores. A failed score locks editing until refresh. The connected courtside screen supports attendance, reviewed assignments, versioned scores and completion. Full live match lifecycle and multi-user Auth verification remain release blockers. Registration/waiver submission UI is implemented; publishing approved waiver text and verifying the connected workflow remain required. The default disconnected preview still uses practice scores; the separate port 5174 test instance uses guarded database RPCs.

## Notifications

Deploy a server-only scheduled worker only after a separate provider setup. `scripts/notification-worker.ts` defaults to `DELIVERY_MODE=provider-sandbox`, refuses the production project, and requires explicit enablement for live recipients. See `11-operations-runbook.md` before configuring it. It is NOT run here. Queue entries require email opt-in; consent is rechecked at delivery time. Jobs lease atomically, use stable provider idempotency keys, retry exponentially, record status/receipt and stop retrying after eight attempts. A crashed eighth attempt requires operator recovery; monitor stuck leases. Provider idempotency retention must cover the retry window before real delivery is enabled.

## Operational checks

Review queue lag and failures after each session. Investigate repeated revision conflicts. Never replay jobs already delivered without comparing provider IDs. Confirm backups restore, not merely download. Keep error logs to action, time, request ID, error code and tenant ID; avoid email, medical data, message content and tokens. No external telemetry configured yet.

Real member OTP and administrator TOTP were verified with the user on 2026-09-06. Do not reload the app to refresh data: Auth tokens intentionally live in memory, so a full reload requires signing in again. Use in-app refresh controls.

## Maplewood intake and corrections

Open Administration and load club records to review payment claims by name. Check your bank before confirming payment; membership approval is separate and requires the current participant waiver and full regular fee. In Courtside, preview assignments and use each player’s court selector to fix placement. Enter a correction reason to edit saved scores, including completed sessions. Restarting a round removes it and all later rounds from results, retains an audit snapshot, and reopens the session for reassignment. Restart now has a guarded undo before replacement work exists. See `09-maplewood-season.md` for pending automation and launch gates.

## September 7 operations extension

The new local participant/guardian signing, attendance accounts, ELO, spare queue, and restart undo are documented in `10-agreement-and-automation.md`. Migration/live status and external dependencies are in `11-operations-runbook.md`; they supersede earlier proposed-feature notes.

Club settings, season builder and announcements are now available in a separate Administration section after migration 019. Load settings, edit public name/contact/accent with a reason, or create an empty season with venue, court count, capacities and score targets. Import its approved permit separately. Announcements are plain text, member-only by default; publishing a public announcement is an explicit checkbox and saving sends no email/SMS. Privacy and deletion review records club-scoped decisions after migration 021; it deliberately does not erase signed records or another club's records automatically.
