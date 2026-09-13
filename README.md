# DC Badminton Club — TEST application

The current GitHub Pages TEST site serves the root [`index.html`](index.html). Its database migrations, reminder automation and regression suites are under [`legacy/`](legacy/). The separate application under [`platform/`](platform/) has its own build and tests; passing those alone does not validate the current Pages site. Production is a separate repository and is not a target of this work.

See [`docs/31-audit-remediation.md`](docs/31-audit-remediation.md) for the September review fixes, test results and TEST release procedure. Do not publish the updated root client until the combined TEST migration `legacy/migrations/TEST_2026-09-13.sql` (L22–L24) has been applied and verified. The root quality workflow checks the actual delivered application and offers an explicit TEST-only release after its checks pass. Existing branch-based Pages publishing must be changed to GitHub Actions to enforce that gate.

The root application connects to TEST when opened normally. Automated browser tests intercept those requests, use synthetic data and deny external application requests. Database tests run against disposable local PostgreSQL. The reminder workflow defaults to dry run and refuses real-recipient delivery from this TEST repository.

For a local preview, run `python3 -m http.server 8791 --bind 127.0.0.1` from this repository, then open `http://127.0.0.1:8791/`. Use this HTTP address in the browser panel instead of a `file://` link. This is the real TEST login, so it needs your emailed code and the TEST database at L24; it is not the synthetic test environment. Direct-file previews do not support service workers/push and may be restricted by the browser.

Start with [`docs/23-connected-product-release.md`](docs/23-connected-product-release.md) for the current hosted preview, tested capabilities and remaining release gates.

- [Product/security audit](docs/00-audit.md)
- [Migration and rollback plan](docs/01-migration-rollback.md)
- [Architecture and invoice analysis](docs/02-architecture.md)
- [Administrator guide](docs/03-administrator-guide.md)
- [Member guide](docs/04-member-guide.md)
- [Privacy and retention](docs/05-privacy-retention.md)
- [Deployment and recovery](docs/06-deployment.md)

Use Node 24, pnpm 11.19.0; run `pnpm install --frozen-lockfile` and `pnpm dev` from `platform/`. Do not publish, copy code into production or connect to production without explicit authorization and the listed quality gates.
