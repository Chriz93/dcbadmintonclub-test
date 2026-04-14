# DC Badminton Club — TEST

🧪 **This is the TEST environment.** It mirrors the production app at
[chriz93.github.io/dcbadmintonclub](https://chriz93.github.io/dcbadmintonclub/)
so you can try changes, run the test suite, and experiment safely without
touching real member data.

⚠️ **Never point this repo at the production Supabase project.** The whole
point of this copy is isolation — see setup below.

## One-time setup

Before this test site can load data, you need to give it its own Supabase
backend. See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for the full walkthrough.
Short version:

1. Create a new Supabase project at https://supabase.com
2. Run the SQL in `SUPABASE_SETUP.md` to create the `players`,
   `announcements`, and `app_state` tables
3. Copy the Project URL + anon key from Supabase → Settings → API
4. Open `index.html` and replace these two lines:
   ```js
   const SB='__REPLACE_WITH_YOUR_TEST_SUPABASE_URL__';
   const SK='__REPLACE_WITH_YOUR_TEST_SUPABASE_ANON_KEY__';
   ```
5. Commit and push — GitHub Pages rebuilds in ~30 seconds

## Isolation from production

| Thing | Production | Test |
|-------|------------|------|
| Repo | `Chriz93/dcbadmintonclub` | `Chriz93/dcbadmintonclub-test` |
| URL | `chriz93.github.io/dcbadmintonclub` | `chriz93.github.io/dcbadmintonclub-test` |
| Supabase project | `bwepvxelvwgwxrnaglrx` | (you create a new one) |
| Service worker cache | `dcbc-v12` | `dcbc-test-v1` |
| localStorage keys | `dcbc-*` | `test-dcbc-*` |

Both sites live under the same origin (`chriz93.github.io`), so the localStorage
keys and service worker scope needed different names to avoid collisions when
both are open in the same browser.

## What you can do here

- Run the full test suite (`#run-tests` URL hash) without worrying about
  corrupting real Session data
- Add fake players and simulate full sessions end-to-end
- Try UI changes before merging to production
- Train other admins

## Deploying changes to production

When something works here and you want it live:

1. Copy the relevant edits from this repo's `index.html` into
   `dcbadmintonclub/index.html`
2. Do NOT copy: the TEST banner, the placeholder Supabase credentials, the
   `test-dcbc-*` localStorage key prefix, or the `dcbc-test-v1` cache name
3. Bump the production `sw.js` cache version (e.g. `v12` → `v13`)
4. Commit to `Chriz93/dcbadmintonclub`
