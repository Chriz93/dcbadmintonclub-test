# ADR 001 — retain PostgreSQL and Supabase Auth

Decision: keep Supabase for this upgrade, with normalized tenant data and transactional RPCs, a TypeScript component client, and a server-side outbox worker. Do not reimplement passwordless authentication. Existing static GitHub Pages can serve public output but cannot supply all security headers or server jobs; use a separately configured secure host for the authenticated application after authorization. Hosting migration is not currently performed.

| Concern | Supabase | Cloudflare Workers + D1 |
|---|---|---|
| Auth | Managed email OTP and MFA | Additional identity provider/integration needed |
| Isolation | PostgreSQL RLS + compound tenant FKs | Every API query must enforce tenant scope |
| Migration | Additive schema; preserve existing IDs | Translate JSON and PostgreSQL behavior to SQLite |
| Transactions | Row locks, RPC, outbox in same transaction | D1 transaction/batch model; queue coordination |
| Recovery | PostgreSQL dumps; verify external backup | D1 recovery/export and independent restore rehearsal |
| Portability | Standard PostgreSQL + managed Auth coupling | SQLite data portable; Worker/queue runtime coupling |
| Maintenance | One DB/Auth service plus mail worker | API, auth, D1, bot checks and job infrastructure |

Billing evidence is unavailable. User-reported ~$60/month cannot be attributed to usage without invoices and currency. Inspect organization subscription, every project and compute size, add-ons/custom domains/PITR, storage, egress, realtime, tax/currency and inactive projects. Never delete/downgrade a project without verified backup and approval. Repeated polling is inefficient but does not prove the bill's cause.

Planning estimates (USD, excluding tax/domain/SMS, checked 2026-09-06): Supabase Free $0 if limits and inactivity behavior are acceptable; Pro starts $25/month with $10 compute credit, extra compute/projects/add-ons separate. Budget $25–45 for retained Supabase plus $0–20 transactional mail pending provider choice. Cloudflare Workers paid minimum $5 plus D1 usage and auth/email, provisional $5–35 total for a small club, excluding development/maintenance. Free quotas may fit 25–100 members; this is not a measured qualification. Use 30-day observed usage and invoice before committing to savings.

Sources: https://supabase.com/pricing ; https://supabase.com/docs/guides/platform/billing-faq ; https://supabase.com/docs/guides/platform/your-monthly-invoice ; https://developers.cloudflare.com/workers/platform/pricing/ .

Domain boundaries: branding/venues/seasons/schedule; identity/membership/waivers; attendance/RSVP; assignment/rotation/matches/rankings; transactional outbox; audit/retention. Public schedule contains no member records. Private responses never enter a public cache. Mutations use bearer access tokens, not ambient cookies, so cross-site cookie CSRF is not applicable; retain origin checks and CSP. User identity comes from verified Auth tokens, never request body IDs alone.
