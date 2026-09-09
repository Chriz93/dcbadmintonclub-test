import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  matchdayFixture,
  club,
  sessionId,
  players,
  admins,
  identity,
} from "../scripts/matchday-fixture";
let db: PGlite;
let games: {
  id: string;
  round: number;
  game: number;
  court: number;
  side_a: string[];
  side_b: string[];
  target: number;
}[];
let plan: string;
const slots = Array.from({ length: 80 }, (_, i) => ({
  index: i,
  round: Math.floor(i / 20) + 1,
  slot: (i % 20) + 1,
}));
async function rehearsal(
  setup: () => Promise<unknown>,
  actor: string,
  run: () => Promise<unknown>,
) {
  await db.exec("begin;");
  try {
    await setup();
    await db.exec("set local role authenticated;" + identity(actor, "aal2"));
    await run();
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
  games = (
    await db.query<(typeof games)[number]>(
      `select m.id,m.round,m.game,c.number court,m.side_a,m.side_b,m.target from club_app.matches m join club_app.courts c on c.id=m.court_id where m.session_id='${sessionId}' order by m.round,c.number,m.game`,
    )
  ).rows;
  plan = JSON.stringify(
    (
      await db.query<{ plan: unknown }>(
        `select jsonb_agg(x) plan from (select court_id,jsonb_agg(user_id order by ordinal) players from club_app.assignments where session_id='${sessionId}' and round=4 group by court_id) x`,
      )
    ).rows[0].plan,
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});

describe("database round gates and participant scoring", () => {
  it.each(slots)(
    "R$round game slot $slot cannot disappear before session completion",
    async ({ index }) => {
      await rehearsal(
        async () => {
          await db.exec(
            `update club_app.sessions set status='active' where id='${sessionId}';delete from club_app.matches where id='${games[index].id}';`,
          );
        },
        admins[0],
        async () => {
          await expect(
            db.query(`select club_app.complete_session($1,$2,5)`, [
              club,
              sessionId,
            ]),
          ).rejects.toThrow(/All scheduled games/);
        },
      );
    },
  );
  it.each(slots.slice(60))(
    "R4 game slot $slot must be scored before publishing R5",
    async ({ index }) => {
      await rehearsal(
        async () => {
          await db.exec(
            `update club_app.sessions set status='active' where id='${sessionId}';update club_app.matches set score_a=null,score_b=null where id='${games[index].id}';`,
          );
        },
        admins[0],
        async () => {
          await expect(
            db.query(
              `select club_app.assign_courts($1,$2,5,$3::jsonb,5,'Reviewed next round')`,
              [club, sessionId, plan],
            ),
          ).rejects.toThrow(/All scheduled games/);
        },
      );
    },
  );
  it.each(slots.slice(0, 20))(
    "ordinary participant can save game slot $slot once, including either team",
    async ({ index }) => {
      const g = games[index],
        actor = (index % 2 ? g.side_b : g.side_a)[index % 2];
      await rehearsal(
        async () => {
          await db.exec(
            `update club_app.sessions set status='active' where id='${sessionId}';update club_app.matches set score_a=null,score_b=null,revision=0 where id='${g.id}';update club_app.memberships set role='member' where club_id='${club}' and user_id='${actor}';`,
          );
        },
        actor,
        async () => {
          expect(
            (
              await db.query(
                `select club_app.submit_score($1,$2,$3,10,0) revision`,
                [club, g.id, g.target],
              )
            ).rows,
          ).toEqual([{ revision: 1 }]);
          expect(
            (
              await db.query(
                `select score_a,score_b,revision from club_app.matches where id=$1`,
                [g.id],
              )
            ).rows,
          ).toEqual([{ score_a: g.target, score_b: 10, revision: 1 }]);
          await expect(
            db.query(`select club_app.submit_score($1,$2,10,$3,1)`, [
              club,
              g.id,
              g.target,
            ]),
          ).rejects.toThrow(/administrator correction/);
        },
      );
    },
  );
  it.each(slots.slice(0, 20))(
    "ordinary nonparticipant cannot submit game slot $slot",
    async ({ index }) => {
      const g = games[index],
        actor = players.find((id) => ![...g.side_a, ...g.side_b].includes(id))!;
      await rehearsal(
        async () => {
          await db.exec(
            `update club_app.sessions set status='active' where id='${sessionId}';update club_app.matches set score_a=null,score_b=null,revision=0 where id='${g.id}';update club_app.memberships set role='member' where club_id='${club}' and user_id='${actor}';`,
          );
        },
        actor,
        async () => {
          await expect(
            db.query(`select club_app.submit_score($1,$2,$3,10,0)`, [
              club,
              g.id,
              g.target,
            ]),
          ).rejects.toThrow(/Forbidden/);
        },
      );
    },
  );
  it("rejects skipping a round even through the admin RPC", async () => {
    await rehearsal(
      () =>
        db.exec(
          `update club_app.sessions set status='active' where id='${sessionId}'`,
        ),
      admins[0],
      async () => {
        await expect(
          db.query(
            `select club_app.assign_courts($1,$2,6,$3::jsonb,5,'Reviewed next round')`,
            [club, sessionId, plan],
          ),
        ).rejects.toThrow(/skip a round/);
      },
    );
  });
  it("requires a reviewed restart before changing earlier assignments", async () => {
    await rehearsal(
      () =>
        db.exec(
          `update club_app.sessions set status='active' where id='${sessionId}'`,
        ),
      admins[0],
      async () => {
        await expect(
          db.query(
            `select club_app.assign_courts($1,$2,2,$3::jsonb,5,'Reviewed earlier round')`,
            [club, sessionId, plan],
          ),
        ).rejects.toThrow(/Later rounds exist/);
      },
    );
  });
  it("detects invalid partner coverage even with every score saved", async () => {
    await rehearsal(
      () =>
        db.exec(
          `update club_app.sessions set status='active' where id='${sessionId}';update club_app.matches set side_a=(select side_a from club_app.matches where id='${games[0].id}'),side_b=(select side_b from club_app.matches where id='${games[0].id}') where id='${games[1].id}';`,
        ),
      admins[0],
      async () => {
        await expect(
          db.query(`select club_app.complete_session($1,$2,5)`, [
            club,
            sessionId,
          ]),
        ).rejects.toThrow(/partner rotation/);
      },
    );
  });
  it("keeps all new privileged implementations inaccessible", async () => {
    const names = [
      "assert_round_complete(uuid,uuid,integer)",
      "correct_score_before_preview_guard(uuid,uuid,integer,integer,integer,text)",
      "assign_courts_before_round_guard(uuid,uuid,integer,jsonb,integer,text)",
      "complete_session_before_round_guard(uuid,uuid,integer)",
    ];
    for (const role of ["anon", "authenticated", "service_role"])
      for (const name of names)
        expect(
          (
            await db.query(
              `select has_function_privilege($1,$2,'execute') allowed`,
              [role, `club_app.${name}`],
            )
          ).rows,
        ).toEqual([{ allowed: false }]);
  });
});

it("a live correction invalidates an already reviewed movement plan", async () => {
  await rehearsal(
    () =>
      db.exec(
        `update club_app.sessions set status='active' where id='${sessionId}'`,
      ),
    admins[0],
    async () => {
      const game = games.at(-1)!;
      await db.query(
        `select club_app.correct_score($1,$2,10,$3,1,'Correct winner before moving')`,
        [club, game.id, game.target],
      );
      expect(
        (
          await db.query(`select revision from club_app.sessions where id=$1`, [
            sessionId,
          ])
        ).rows,
      ).toEqual([{ revision: 6 }]);
      await expect(
        db.query(
          `select club_app.assign_courts($1,$2,5,$3::jsonb,5,'Stale preview must fail')`,
          [club, sessionId, plan],
        ),
      ).rejects.toThrow(/Revision conflict/);
    },
  );
});
