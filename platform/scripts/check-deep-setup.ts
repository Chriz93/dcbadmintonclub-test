import "./deep-rehearsal-play.ts";
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
const play = readFileSync("/tmp/maplewood-deep-play.sql", "utf8");
const played = await db.exec(play).catch((e) => {
  console.error(
    JSON.stringify({ message: e.message, code: e.code, where: e.where }),
  );
  process.exit(1);
});
console.log(JSON.stringify(played.at(-1)?.rows));
// Local-only clock compression: onboarding and recovery happen in separate real-world minutes.
await db.exec(
  "delete from club_app.rate_limits where user_id in ('f0260908-0006-4000-8000-000000000001','f0260908-0006-4000-8000-000000000002')",
);
const recovered = await db.exec(
  readFileSync("scripts/deep-rehearsal-recovery.sql", "utf8"),
);
console.log(JSON.stringify(recovered.at(-1)?.rows));
await db.close();
