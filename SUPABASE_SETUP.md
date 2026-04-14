# Supabase Setup for TEST Site

Follow these steps to give the test site its own isolated backend.

## 1. Create a new Supabase project

1. Go to https://supabase.com and sign in (you can use your existing account)
2. Click **New Project**
3. Settings:
   - **Name**: `dcbadmintonclub-test`
   - **Database password**: pick any strong password (you won't need it often)
   - **Region**: pick the one closest to Ottawa (usually `Canada (Central)` or `East US`)
   - **Plan**: Free tier is fine
4. Click **Create new project** and wait ~2 min for it to provision

## 2. Create the tables

Once the project is ready, open **SQL Editor** (left sidebar) and paste the
entire block below, then click **Run**:

```sql
-- ══════════════════════════════════════════════
-- DC Badminton Club — TEST schema
-- ══════════════════════════════════════════════

-- Players table
create table if not exists players (
  id bigserial primary key,
  name text not null,
  email text default '',
  phone text default '',
  emergency text default '',
  medical text default '',
  sig text default '',
  waiver_signed boolean default false,
  paid boolean default false,
  current_court integer default 0,
  highest_court integer default 0,
  season_wins integer default 0,
  season_losses integer default 0,
  games_played integer default 0,
  no_show_count integer default 0,
  membership_type text default 'regular',
  created_at timestamptz default now()
);

-- Announcements table
create table if not exists announcements (
  id bigserial primary key,
  content text not null,
  created_at timestamptz default now()
);

-- Key-Value store (sessions, attendance, approvals, etc.)
create table if not exists app_state (
  id bigserial primary key,
  key text unique not null,
  value text,
  created_at timestamptz default now()
);

-- Allow the anon role to read/write everything (matches production)
alter table players enable row level security;
alter table announcements enable row level security;
alter table app_state enable row level security;

create policy "anon full access players"   on players       for all to anon using (true) with check (true);
create policy "anon full access announcements" on announcements for all to anon using (true) with check (true);
create policy "anon full access app_state" on app_state    for all to anon using (true) with check (true);
```

You should see **"Success. No rows returned"** at the bottom.

## 3. Copy your project credentials

1. Click **Settings** (gear icon, bottom left) → **API**
2. Copy the **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
3. Copy the **anon** / **public** key under "Project API keys"
4. ⚠️ Do NOT copy the `service_role` key — that one is secret

## 4. Paste into `index.html`

Open `index.html` in the `dcbadmintonclub-test` repo. Search for
`__REPLACE_WITH_YOUR_TEST_SUPABASE_URL__` (around line 782) and replace both
lines:

```js
const SB='https://xxxxxxxxxxxx.supabase.co';  // your Project URL
const SK='eyJhbGc...';                          // your anon key
```

## 5. Commit and push

```bash
cd /Users/christygeorge/dcbadmintonclub-test
git add index.html
git commit -m "Configure test Supabase credentials"
git push
```

GitHub Pages will rebuild in ~30 seconds. Open
https://chriz93.github.io/dcbadmintonclub-test and you should see the app load
with an empty database.

## 6. (Optional) Seed with test data

If you want realistic data to play with, you can either:

**A. Add players manually** via the Admin → Players tab (faster for a few)

**B. Copy data from production** — paste this into the browser console while
viewing the PRODUCTION site (`chriz93.github.io/dcbadmintonclub`):

```js
// Export current production data to a JSON file you can import into test
const dump = {
  players: S.players,
  current: S.current,
  sessions: S.sessions,
  announcements: S.announcements
};
const blob = new Blob([JSON.stringify(dump, null, 2)], {type: 'application/json'});
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'dcbc-prod-dump.json';
a.click();
```

Then on the test site, an import helper can be added later if needed.

## Safety reminders

- The **TEST banner** at the top of the page is your constant reminder that
  you're in the test environment. Don't remove it.
- If you ever see production data appear in the test site, stop immediately —
  something is mis-configured and pointing at the wrong Supabase project.
- It's safe to run the test suite (`#run-tests`) here. It's **not** safe on
  production.
