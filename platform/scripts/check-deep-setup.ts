import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { matchdayFixture, admins, club } from "./matchday-fixture.ts";
const db = new PGlite();
await db.exec(
  `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;`,
);
for (const file of readdirSync("migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort())
  await db.exec(readFileSync("migrations/" + file, "utf8"));
await db.exec(
  "begin;" +
    matchdayFixture() +
    `update club_app.members set email='christygeorge993@gmail.com' where id='${admins[0]}';update club_app.memberships set role='club_owner' where club_id='${club}' and user_id='${admins[0]}';commit;`,
);
const sql = readFileSync("scripts/deep-rehearsal-setup.sql", "utf8");
const out = await db.exec(sql);
console.log(JSON.stringify(out.at(-1)?.rows));
await db.close();
