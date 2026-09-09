import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import {
  matchdayFixture,
  club,
  seasonId,
  players,
  identity,
} from "../../scripts/matchday-fixture";
import { snapshotSchema } from "../../src/league/data";
import { mockSignIn, mockUser, signIn } from "./auth-fixture";
/** Actual migrations, SQL functions and RLS behind the browser; authentication is synthetic. */
export async function databaseLeague() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;`,
  );
  for (const f of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("migrations/" + f, "utf8"));
  await db.exec(
    "begin;" +
      matchdayFixture().replaceAll(players[12], mockUser.id) +
      "commit;",
  );
  let queue = Promise.resolve();
  function run<T>(
    user: string,
    admin: boolean,
    action: () => Promise<T>,
  ): Promise<T> {
    const result = queue.then(async () => {
      await db.exec(
        "begin;set local role authenticated;" +
          identity(user, admin ? "aal2" : "aal1"),
      );
      try {
        const value = await action();
        await db.exec("commit");
        return value;
      } catch (e) {
        await db.exec("rollback");
        throw e;
      }
    });
    queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  const errors: string[] = [];
  async function rpc(
    name: string,
    args: Record<string, unknown>,
    user = mockUser.id,
    admin = false,
  ) {
    if (
      ![
        "league_snapshot",
        "is_admin",
        "request_match_review",
        "resolve_match_review",
        "submit_score",
        "correct_score",
      ].includes(name)
    )
      throw new Error("Unsupported test RPC " + name);
    const keys = Object.keys(args);
    if (keys.some((k) => !/^[a-z_]+$/.test(k)))
      throw new Error("Invalid test parameter");
    return run(
      user,
      admin,
      async () =>
        (
          await db.query<{ value: unknown }>(
            `select club_app.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(",")}) as value`,
            Object.values(args),
          )
        ).rows[0].value,
    );
  }
  async function open(page: Page, user = mockUser.id, admin = false) {
    await mockSignIn(
      page,
      admin ? "club_admin" : "member",
      "active",
      club,
      { ...mockUser, id: user },
      admin ? "aal2" : "aal1",
    );
    await page.route(
      "https://wgolevihkvmosajumzvl.supabase.co/rest/v1/**",
      async (route) => {
        const path = new URL(route.request().url()).pathname,
          name = path.split("/").at(-1)!;
        try {
          let data: unknown = [];
          if (path.includes("/rpc/")) {
            if (
              [
                "my_upcoming",
                "my_notification_preferences",
                "my_rsvp",
              ].includes(name)
            )
              data = null;
            else if (
              [
                "league_snapshot",
                "is_admin",
                "request_match_review",
                "resolve_match_review",
                "submit_score",
                "correct_score",
              ].includes(name)
            )
              data = await rpc(
                name,
                route.request().postDataJSON(),
                user,
                admin,
              );
          } else {
            const sql: Record<string, string> = {
              memberships:
                "select m.club_id,m.role,m.status,m.kind,jsonb_build_object('name',c.name) club from club_app.memberships m join club_app.clubs c on c.id=m.club_id where m.user_id=auth.uid()",
              seasons: "select id,club_id,name from club_app.seasons",
              venues: "select id,name,address,rooms from club_app.venues",
              sessions: "select id,calendar_uid from club_app.sessions",
              clubs: "select slug from club_app.clubs",
            };
            if (sql[name])
              data = await run(user, admin, async () => {
                const rows = (await db.query(sql[name])).rows;
                return name === "clubs" ? rows[0] : rows;
              });
          }
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(data),
          });
        } catch (e) {
          const error = e as { message: string; code?: string };
          errors.push(error.message);
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ code: error.code, message: error.message }),
          });
        }
      },
    );
    await signIn(page);
  }
  return {
    open,
    rpc,
    errors,
    snapshot: async (user = mockUser.id, admin = false) =>
      snapshotSchema.parse(
        await rpc("league_snapshot", { c: club, se: seasonId }, user, admin),
      ),
    close: async () => {
      await queue;
      await db.close();
    },
  };
}
