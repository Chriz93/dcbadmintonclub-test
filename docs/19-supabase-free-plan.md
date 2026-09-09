# Running the league on Supabase without a paid plan

Written 2026-09-09 for the legacy site (single `index.html` + Supabase). Confirm the plan names and limits on the
Supabase billing page before acting; the figures below are the published Free plan limits at the time of writing.

## What the league actually uses

| Need | Season load | Free plan limit | Fits? |
|---|---|---|---|
| Database size | a few MB (players, JSON state, audit) | 500 MB | yes |
| Monthly active users | ≤ 40 sign-ins | 50,000 | yes |
| Egress | polling every 20 s on match night ≈ tens of MB/month | 5 GB | yes |
| Auth email (one-time codes) | ≈ 40–100 per week | unlimited with custom SMTP (Gmail already configured) | yes |
| MFA TOTP for the organizer | 1 factor | included | yes |
| Projects | production + TEST | 2 active projects per Free organisation | yes, exactly |

Nothing the site does needs a Pro-only feature. Daily backups and point-in-time recovery are Pro-only; the
replacement is the weekly export described below.

## The two things that change on Free

1. **Inactivity pause.** A Free project that receives no requests for 7 days is paused. During the season the site is
   used every week, so production will not pause. Over the summer it will, and the organizer restores it from the
   dashboard in about a minute (data is kept; projects paused for a long time can eventually be deleted, so export
   before the off-season).
   *Keep-alive option:* a GitHub Actions job that runs a harmless read (`select 1` via PostgREST with the publishable
   key) twice a week. This keeps both projects "active" for free. Add it only if you want zero manual restores.
2. **No managed backups.** Replace with a scheduled export: `pg_dump` of the `public` schema plus the `app_state`
   rows, stored encrypted in a private location (the legacy site already has a snapshot export in Tools; make it a
   weekly habit or automate it with the same GitHub Actions job using the database URL secret).

## How to move from Pro to Free (organizer does this; it is a billing change)

1. Supabase dashboard → Organization → Billing → change plan to Free. Check first that the organisation has at most
   two projects (production and TEST). Any add-ons (compute, custom domain, PITR) must be removed first.
2. The change takes effect at the end of the current billing period; nothing in the projects is altered.
3. After the switch, confirm: Auth → SMTP settings still show the Gmail sender; Auth → MFA still enabled.

## Alternatives if Supabase is ever dropped

- Cloudflare D1 + Workers (free tier) or Neon Postgres (free tier) with a small API in front. This is a rewrite of the
  data layer (`sbG/sbP/sbU/sbD/rpc` in `index.html`) and of every database rule in `legacy/migrations`; not worth it
  for a 25-player league while Supabase Free covers the load.

## Recommendation

Downgrade to Free once the 2026–27 migration is complete and the weekly export is in place. Keep TEST as the second
project. Add the keep-alive job if you prefer never to see a paused project.
