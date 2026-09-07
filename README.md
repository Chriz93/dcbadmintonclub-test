# DC Badminton Club — isolated upgrade workspace

The new application is in [`platform/`](platform/). Production is **unchanged**. No database or mail provider is contacted by the default local preview. The old root client is retained as migration evidence with network access disabled.

Start with [`docs/07-verification.md`](docs/07-verification.md) for tested capabilities and remaining release blockers.

- [Product/security audit](docs/00-audit.md)
- [Migration and rollback plan](docs/01-migration-rollback.md)
- [Architecture and invoice analysis](docs/02-architecture.md)
- [Administrator guide](docs/03-administrator-guide.md)
- [Member guide](docs/04-member-guide.md)
- [Privacy and retention](docs/05-privacy-retention.md)
- [Deployment and recovery](docs/06-deployment.md)

Use Node 24, pnpm 11.19.0; run `pnpm install --frozen-lockfile` and `pnpm dev` from `platform/`. Do not publish, copy code into production or connect to production without explicit authorization and the listed quality gates.
