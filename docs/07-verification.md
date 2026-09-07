# Verification report — staging work in progress

Date: 2026-09-06. Production launch is not approved. This is evidence for the current test implementation, not a completed acceptance sign-off.

## Automated evidence

- 81 tests passed: 34 domain/config, 5 PDF parsing (including all original permit rows), 3 live-calendar handler tests, 1 repeatable seed, 38 PostgreSQL/RLS behavior tests.
- 16 browser tests passed in the final run, including connected courtside target sizing and live-schedule rendering: desktop and mobile home/schedule, Court 6 practice rotation/scoring, all six public-route accessibility scans, editable court previews and member standings, local PDF preview, dark appearance/overflow and compiled offline read-only shell. Axe found zero violations in the scanned states; this is not a complete manual WCAG conformance audit.
- Prior-phase coverage (not rerun for this phase): 97.51% statements/lines, 88.75% branches, 94.73% functions for domain services and configuration only. UI and SQL are not included in this percentage.
- ESLint and TypeScript production build passed. Initial JS/CSS gzip: 165.1 KiB against 220 KiB budget. PDF parser/worker load separately. Build checks found no server-secret markers.
- Dependency audit after upgrades reported no known vulnerabilities. CI configuration contains the checks but has not run on GitHub; nothing was pushed.
- Local PostgreSQL archive restore preserved synthetic rankings and anonymous denial. This does not establish remote RTO/RPO or backup completeness.

## Live TEST evidence

`wgolevihkvmosajumzvl`: 32 legacy players, 26 state records, 0 announcements preserved in protected internal snapshot and original tables. Anonymous legacy reads/writes and snapshot access denied. New schema: 24 tables, all RLS enabled, zero anonymous table grants, zero authenticated direct write grants. Anonymous function access limited to two safe public read RPCs. Season: 28 scheduled, 6 cancelled, 56 hours, 6 courts, 25 regular capacity, zero seeded real members. The original permit PDF is now verified against all 34 stored dates/statuses; provenance and source hash are recorded.

## Release blockers and remaining work

1. Real passwordless Auth and administrator TOTP/AAL2 passed with the user. A verified test club-owner membership was bootstrapped and audited. Actual admin records, own profile, RSVP creation/revision and attendance save succeeded. RSVP ended not_attending at revision 2, with 2 audit entries; attendance was returned to absent. No club notification jobs were generated because consent stayed off. Full registration/waiver, separate-user tenant/role testing and complete live match lifecycle remain required. Default app stays demo; connected test runs on 5174. Public REST checks passed: 34 schedule records and both member/legacy-player table access denied to anon.
2. Connected courtside UI now provides real attendance, assignment preview/confirmation, versioned scores, rest display and session completion; demo remains synthetic. A mocked API browser workflow verifies 25-player allocation, five-player Court 6 and stale-score recovery. Full live match lifecycle, configurable movement/tie handling, spare substitutions/capacities, payment/branding/admin feature parity remain.
3. A local live calendar subscription endpoint now serves the test public schedule on port 8787: HTTP 200, 34 events (28 confirmed/6 cancelled), conditional refresh HTTP 304. Stable IDs match connected schedule downloads. Public hosting, reminder scheduling and remaining spare notices remain. Notification worker is sandbox-only and was not run. Validate provider idempotency retention, crash recovery and actual delivery without emailing members during tests.
4. Build/rehearse complete legacy identity mapping and migration. Verify encrypted external database backup and remote restore; internal snapshot and source archives do not satisfy this gate.
5. Finish retention/erasure review tooling, full personal export coverage, operational monitoring and manual mobile/PWA/accessibility verification.
6. No claim of zero high security findings for the entire system until connected adversarial tests, concurrency tests on independent database connections and production cutover review are complete.

Production files and database were not modified. No production deployment, paid plan change or deletion was performed. One user-authorized test Auth email was requested; no club notification worker was run.

## Follow-up database hardening

Migrations 007–008 add a tenant-limited display-name roster and reject null revisions/permit totals and omitted booking statuses. Private implementation functions have no browser EXECUTE grants. Local adversarial regression tests pass. The migration is applied to TEST only.

Final live guard verification: 4 guarded revision RPCs, 0 browser-callable private implementations, 0 new tables without RLS, 32 preserved legacy players, 26 preserved state records and 0 club notification jobs.

## Maplewood intake and correction phase

Migrations 009–011 and `scripts/maplewood-policy.sql` applied to TEST only. New private intake table has RLS; browser writes occur only through RPCs. Completed scores and round restart have MFA, stale-revision checks and audit records; restart snapshots every removed match and assignment. A minimal member-only standings RPC exposes no private profile fields. Actual signed-in standings and intake screens loaded against TEST. No actual intake, payment verification, waiver or match was created in TEST. See `09-maplewood-season.md` for precise remaining work.

Final phase permission audit: 0 tables without RLS; anonymous intake SELECT false; member direct intake UPDATE false; private aggregate helper EXECUTE false; 6 new public RPC definitions present; intake requirement enabled; 28 scheduled and 6 cancelled sessions; 0 intakes, 0 waivers and 0 notification jobs.
