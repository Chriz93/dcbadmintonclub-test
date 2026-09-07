import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
it("test seed is repeatable and persists exactly 28 active bookings and 56 hours", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;`,
    );
    for (const name of readdirSync("migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(readFileSync("migrations/" + name, "utf8"));
    const seed = readFileSync("scripts/seed-test.sql", "utf8");
    await db.exec(seed);
    await db.exec(seed);
    const result = await db.query<{
      active: number;
      cancelled: number;
      hours: number;
    }>(
      `select count(*) filter(where status='scheduled')::int active,count(*) filter(where status='cancelled')::int cancelled,(sum(extract(epoch from (ends_at-starts_at))/3600) filter(where status='scheduled'))::int hours from club_app.sessions`,
    );
    expect(result.rows[0]).toEqual({ active: 28, cancelled: 6, hours: 56 });
    expect(
      (await db.query("select * from club_app.members")).rows,
    ).toHaveLength(0);
  } finally {
    await db.close();
  }
});
