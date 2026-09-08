import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  matchdayFixture,
  club,
  seasonId,
  sessionId,
  players,
  admins,
  courts,
  fixtureId,
  identity,
} from "../scripts/matchday-fixture";
import { validateScore } from "../src/domain/courts";
import { terminalScores, invalidScores } from "./fixtures/regression-matrix";
let db: PGlite;
const gameIds = new Map<number, string>();
let matchRevisions: string;
async function transaction<T>(
  actor: string,
  aal: string,
  run: () => Promise<T>,
) {
  await db.exec("begin;set local role authenticated;" + identity(actor, aal));
  try {
    return await run();
  } finally {
    await db.exec("rollback;");
  }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;`,
  );
  for (const file of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("migrations/" + file, "utf8"));
  await db.exec("begin;" + matchdayFixture() + "commit;");
  await db.exec(
    `insert into auth.users(id,email,email_confirmed_at) values('${fixtureId(99)}','unrelated@example.invalid',now())`,
  );
  for (const target of [15, 21]) {
    const r = await db.query<{ id: string }>(
      `select id from club_app.matches where session_id='${sessionId}' and target=${target} order by round,game,id limit 1`,
    );
    gameIds.set(target, r.rows[0].id);
  }
  matchRevisions = JSON.stringify(
    (
      await db.query<{ revisions: Record<string, number> }>(
        `select jsonb_object_agg(id,revision) revisions from club_app.matches where session_id='${sessionId}' and round>=3`,
      )
    ).rows[0].revisions,
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});

describe("300-case review: terminal scores, SQL revisions and rebuilds (72)", () => {
  it.each(terminalScores)(
    "$name updates exactly one game and keeps 25-player totals coherent",
    async ({ a, b, target, winner }) => {
      expect(validateScore(a, b, target)).toBe(winner);
      await transaction(admins[0], "aal2", async () => {
        const id = gameIds.get(target)!;
        const before = (
          await db.query<{ n: number }>(
            `select count(*)::int n from club_app.audit_events where club_id='${club}' and action='score.corrected'`,
          )
        ).rows[0].n;
        await db.exec(
          `select club_app.correct_score('${club}','${id}',${a},${b},1,'Synthetic boundary score review')`,
        );
        expect(
          (
            await db.query(
              `select score_a,score_b,revision from club_app.matches where id='${id}'`,
            )
          ).rows,
        ).toEqual([{ score_a: a, score_b: b, revision: 2 }]);
        expect(
          (
            await db.query(
              `select count(*)::int games,count(*) filter(where score_a is null)::int missing from club_app.matches where session_id='${sessionId}'`,
            )
          ).rows,
        ).toEqual([{ games: 80, missing: 0 }]);
        expect(
          (
            await db.query(
              `select count(*)::int players,sum(played)::int played,sum(wins)::int wins from club_app.rankings where season_id='${seasonId}'`,
            )
          ).rows,
        ).toEqual([{ players: 25, played: 320, wins: 160 }]);
        expect(
          (
            await db.query<{ n: number }>(
              `select count(*)::int n from club_app.audit_events where club_id='${club}' and action='score.corrected'`,
            )
          ).rows[0].n,
        ).toBe(before + 1);
        const ratings = (
          await db.query<{ rating: string; played: number }>(
            `select rating,played from club_app.elo_ratings where season_id='${seasonId}'`,
          )
        ).rows;
        expect(ratings).toHaveLength(25);
        expect(
          ratings.every(
            (r) => Number.isFinite(Number(r.rating)) && r.played > 0,
          ),
        ).toBe(true);
      });
    },
  );
});
describe("300-case review: invalid score rejection in domain and SQL (20)", () => {
  it.each(invalidScores)("$name", async ({ a, b, target }) => {
    expect(() => validateScore(a, b, target)).toThrow();
    await expect(
      transaction(admins[0], "aal2", async () => {
        await db.exec(
          `select club_app.correct_score('${club}','${gameIds.get(target)}',${a},${b},1,'Synthetic invalid score review')`,
        );
      }),
    ).rejects.toThrow(/score/i);
    expect(
      (
        await db.query(
          `select revision from club_app.matches where id='${gameIds.get(target)}'`,
        )
      ).rows,
    ).toEqual([{ revision: 1 }]);
  });
});

describe("300-case review: each of the 25 players has isolated private records (25)", () => {
  it.each(players.map((id, i) => ({ id, name: `Player ${i + 1}` })))(
    "$name sees only their own contacts, intake, signatures, and match history",
    async ({ id }) => {
      const expectedGames = (
        await db.query<{ id: string }>(
          `select id from club_app.matches where session_id='${sessionId}' and ('${id}'=any(side_a) or '${id}'=any(side_b)) order by id`,
        )
      ).rows.map((r) => r.id);
      await transaction(id, "aal1", async () => {
        expect(
          (await db.query(`select id from club_app.members`)).rows,
        ).toEqual([{ id }]);
        expect(
          (
            await db.query(
              `select user_id from club_app.member_intake where club_id='${club}'`,
            )
          ).rows,
        ).toEqual([{ user_id: id }]);
        expect(
          (
            await db.query(
              `select user_id from club_app.participant_eligibility where club_id='${club}'`,
            )
          ).rows,
        ).toEqual([{ user_id: id }]);
        expect(
          (
            await db.query(
              `select participant_id from club_app.signature_receipts where club_id='${club}'`,
            )
          ).rows,
        ).toEqual([{ participant_id: id }]);
        const history = (
          await db.query<{ id: string }>(
            "select * from club_app.my_match_history(0)",
          )
        ).rows;
        expect(history.map((r) => r.id).sort()).toEqual(expectedGames);
        expect(
          history.every(
            (r) =>
              !Object.keys(r).some((k) =>
                /email|phone|birth|emergency|payment/.test(k),
              ),
          ),
        ).toBe(true);
      });
    },
  );
});
const actors = [
  { name: "ordinary member", id: players[8], aal: "aal2" },
  { name: "scorekeeper", id: players[0], aal: "aal2" },
  { name: "admin without MFA", id: admins[0], aal: "aal1" },
  { name: "unrelated identity", id: fixtureId(99), aal: "aal2" },
];
const actions = [
  {
    name: "save seeding",
    sql: () =>
      `select club_app.set_seeding('${club}','${seasonId}',array[${players.map((p) => `'${p}'`).join(",")}]::uuid[],1,'Synthetic prohibited seed change')`,
  },
  {
    name: "publish agreement",
    sql: () =>
      `select club_app.publish_agreement('${club}','${seasonId}',repeat('Synthetic review only. ',20),'Synthetic review reference',1)`,
  },
  {
    name: "correct score",
    sql: () =>
      `select club_app.correct_score('${club}','${gameIds.get(21)}',21,0,1,'Synthetic prohibited correction')`,
  },
  {
    name: "cancel session",
    sql: () => `select club_app.cancel_session('${club}','${sessionId}',5)`,
  },
  {
    name: "restart rounds",
    sql: () =>
      `select club_app.restart_round('${club}','${sessionId}',3,5,'${matchRevisions}'::jsonb,'Synthetic prohibited restart')`,
  },
  {
    name: "verify payment",
    sql: () =>
      `select club_app.verify_intake_payment('${club}','${seasonId}','${players[0]}',0,'Synthetic prohibited verification')`,
  },
  {
    name: "review identity",
    sql: () =>
      `select club_app.review_eligibility('${club}','${seasonId}','${players[0]}',1,null,'Synthetic prohibited identity review',true)`,
  },
  {
    name: "invite players",
    sql: () =>
      `select club_app.invite_participants('${club}','${seasonId}',array['stranger@example.invalid'],'regular','Synthetic prohibited invitation')`,
  },
  {
    name: "assign courts",
    sql: () =>
      `select club_app.assign_reviewed_courts('${club}','${sessionId}',5,'${JSON.stringify([{ court_id: courts[0], players: players.slice(0, 4) }])}'::jsonb,5,'Synthetic prohibited assignments',array[]::uuid[])`,
  },
  {
    name: "approve player",
    sql: () =>
      `select club_app.approve_member('${club}','${seasonId}','${players[0]}')`,
  },
];
describe("300-case review: role and MFA matrix (40)", () => {
  it.each(
    actors.flatMap((actor) =>
      actions.map((action) => ({
        name: `${actor.name} cannot ${action.name}`,
        actor,
        action,
      })),
    ),
  )("$name", async ({ actor, action }) => {
    await expect(
      transaction(actor.id, actor.aal, () => db.exec(action.sql())),
    ).rejects.toMatchObject({ code: "42501" });
    expect(
      (
        await db.query(
          `select status,revision from club_app.sessions where id='${sessionId}'`,
        )
      ).rows,
    ).toEqual([{ status: "completed", revision: 5 }]);
  });
});
