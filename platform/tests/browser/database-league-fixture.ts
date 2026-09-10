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
export async function databaseLeague(setup = "") {
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
  if (setup) await db.exec(setup);
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
  const calls = [
    "league_snapshot",
    "is_admin",
    "request_match_review",
    "resolve_match_review",
    "submit_score",
    "correct_score",
    "submit_intake",
    "registration_review_list",
    "approve_member",
    "verify_intake_payment",
    "review_eligibility",
    "save_eligibility",
    "sign_agreement",
    "intake_options",
    "signing_options",
    "eligibility_review_queue",
  ];
  const setReturning = [
    "intake_options",
    "signing_options",
    "eligibility_review_queue",
  ];
  const errors: string[] = [];
  async function rpc(
    name: string,
    args: Record<string, unknown>,
    user = mockUser.id,
    admin = false,
  ) {
    if (!calls.includes(name)) throw new Error("Unsupported test RPC " + name);
    const keys = Object.keys(args);
    if (keys.some((k) => !/^[a-z_]+$/.test(k)))
      throw new Error("Invalid test parameter");
    return run(
      user,
      admin,
      async () =>
        (
          await db.query<{ value: unknown }>(
            setReturning.includes(name)
              ? `select coalesce(jsonb_agg(t),'[]') as value from club_app.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(",")}) t`
              : `select club_app.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(",")}) as value`,
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
            else if (calls.includes(name))
              data = await rpc(
                name,
                name === "intake_options"
                  ? { club_slug: "test-matchday-rehearsal" }
                  : (route.request().postDataJSON() ?? {}),
                user,
                admin,
              );
          } else {
            const sql: Record<string, string> = {
              memberships:
                "select m.user_id,m.club_id,m.role,m.status,m.kind,case when c.id is null then null else jsonb_build_object('name',c.name) end club from club_app.memberships m left join club_app.clubs c on c.id=m.club_id where m.user_id=auth.uid()",
              seasons: "select id,club_id,name from club_app.seasons",
              venues:
                "select id,club_id,name,address,rooms from club_app.venues",
              sessions: "select * from club_app.sessions",
              clubs: "select id,name,slug from club_app.clubs",
              members: "select id,display_name,phone from club_app.members",
              member_intake: "select * from club_app.member_intake",
              registrations:
                "select r.*,case when s.id is null then null else jsonb_build_object('name',s.name) end season from club_app.registrations r left join club_app.seasons s on s.id=r.season_id and s.club_id=r.club_id",
              participant_eligibility:
                "select * from club_app.participant_eligibility",
              signature_receipts: "select * from club_app.signature_receipts",
              audit_events: "select * from club_app.audit_events",
              notification_deliveries:
                "select * from club_app.notification_deliveries",
            };
            if (sql[name])
              data = await run(user, admin, async () => {
                const url = new URL(route.request().url()),
                  params: unknown[] = [];
                const filters = [...url.searchParams]
                  .filter(
                    ([k, v]) =>
                      [
                        "club_id",
                        "season_id",
                        "user_id",
                        "id",
                        "status",
                      ].includes(k) && v.startsWith("eq."),
                  )
                  .map(([k, v]) => {
                    params.push(v.slice(3));
                    return `${k} = $${params.length}`;
                  });
                const rows = (
                  await db.query(
                    `select * from (${sql[name]}) source ${filters.length ? "where " + filters.join(" and ") : ""}`,
                    params,
                  )
                ).rows;
                return route.request().headers().accept?.includes("object")
                  ? (rows[0] ?? null)
                  : rows;
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
