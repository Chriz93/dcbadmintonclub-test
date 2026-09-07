# Deployment and recovery

No deployment was performed or authorized. Production source and database are unchanged. The CI workflow has no publish step.

## Local validation

Node 24 / pnpm 11.19.0:

```
cd platform
pnpm install --frozen-lockfile
pnpm lint
pnpm test:coverage
pnpm build
pnpm audit --audit-level high
pnpm exec playwright install chromium
pnpm dev
# separate terminal
pnpm test:e2e
```

Build output is `platform/dist` only. Never deploy the repository root, source archives, `.env`, SQL scripts, test results or the legacy app. GitHub Pages ignores `_headers`; use a host that honors configured CSP, HSTS, frame restrictions and nosniff before launching the authenticated app. Tighten `connect-src` to the exact approved project at deployment. Public shell assets alone are cached; private API responses and authenticated requests bypass the worker.

Apply `001` through `008` SQL only to an approved isolated test project. `seed-test.sql` adds venue, six courts, season and 34 dates without member PII. It is idempotent but must not be mistaken for a complete legacy data migration. Public API exposes only `public_schedule` and `registration_options`; all private relations deny anonymous access and direct browser writes. A service-role credential is never a VITE variable.

Database verification uses PGlite's actual PostgreSQL engine and RLS with synthetic Auth functions/claims. This proves SQL semantics locally, not real JWT verification, separate-connection contention, Supabase gateway exposure or production policy state. Run adversarial tests against real test Auth accounts before launch.

Backup helper: `scripts/backup-test.py` requires operator-installed pg_dump and age, TEST_DATABASE_URL, APPROVED_TEST_DB_HOST, BACKUP_AGE_RECIPIENT. It refuses the known production reference and encrypts stdout without plaintext export. Supply trusted CA configuration for verify-full TLS. Decrypt to a pipe and restore to a separate disposable database; compare schema, RLS, counts and data hashes. This helper has not been exercised against a remote project here.

Rollback rehearsal locally restored a synthetic PostgreSQL archive and checked ranking data and anonymous denial. Remote RTO/RPO remains unmeasured. Follow `01-migration-rollback.md`; never roll back to anonymous full access.

Before release: implement remaining feature parity, approved legacy identity mapping and data converter; pass connected Auth/email/courtside/registration tests; verify external encrypted backup; rehearse rollback on disposable remote project; review legacy policy revocation and deployment artifact; obtain explicit production authorization. After authorized launch verify tenant separation, member-owned RSVP, admin MFA, cancellation feed updates and queue delivery, then monitor for a full club session.

On 2026-09-06 migrations 001–008 and the season seed were applied to the authorized existing TEST project, after verified internal snapshot and legacy grant revocation. See `00-audit.md`. No remote member migration or production deployment occurred.

For this local connected run, ignored `.env.test.local` contains only the test URL/reference and browser-safe publishable key. Run `pnpm dev --mode test --port 5174`; normal `pnpm dev` stays demo mode on 5173. TEST Data API includes club_app and automatic new-table grants are disabled. TEST signup and magic-link templates use `{{ .Token }}` for the code UI; the built-in email provider is rate-limited and requires a production SMTP setup before launch.

## Local calendar subscription

Run `pnpm calendar:dev` with the ignored test env file to serve `http://127.0.0.1:8787/calendar/dc-badminton.ics`. Only GET/HEAD are supported; responses contain public event fields, use weak ETags and cache for 60 seconds. Provider errors return 503/no-store. The handler is independently testable and must be hosted behind HTTPS before external subscription use. No hosting was performed. The connected local Schedule page links this endpoint and loads current database dates; the disconnected preview retains supplied seed dates.
