import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  matchdayFixture,
  club,
  seasonId,
  sessionId,
  players,
  admins,
  identity,
  fixtureId,
} from "../scripts/matchday-fixture";
import { allocate, rotation, rankings, moveCourts } from "../src/domain/courts";
let db: PGlite;
async function as(id: string, sql: string, aal = "aal2") {
  await db.exec("begin;set local role authenticated;" + identity(id, aal));
  try {
    const result = await db.exec(sql);
    await db.exec("commit");
    return result;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;`,
  );
  for (const f of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("migrations/" + f, "utf8"));
  await db.exec("begin;" + matchdayFixture() + "commit;");
}, 60000);
afterAll(async () => await db?.close());
it("completes 25 signed, approved players through four six-court rounds and 80 games", async () => {
  for (const [table, n] of [
    ["signature_receipts", 25],
    ["initial_seeds", 25],
    ["assignments", 100],
    ["matches", 80],
    ["rankings", 25],
  ] as const)
    expect(
      (
        await db.query(
          `select * from club_app.${table} where club_id='${club}'`,
        )
      ).rows,
    ).toHaveLength(n);
  expect(
    (
      await db.query(
        `select status,revision from club_app.sessions where id='${sessionId}'`,
      )
    ).rows,
  ).toEqual([{ status: "completed", revision: 5 }]);
  expect(
    (
      await db.query(
        `select * from club_app.matches where score_a is null or score_b is null`,
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (await db.query(`select * from club_app.notification_deliveries`)).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        `select sum(played)::int n from club_app.rankings where season_id='${seasonId}'`,
      )
    ).rows,
  ).toEqual([{ n: 320 }]);
});
it("matches SQL standings to independent sums, with 15-point five-player courts", async () => {
  const games = (
    await db.query<{
      side_a: string[];
      side_b: string[];
      score_a: number;
      score_b: number;
      target: number;
    }>(`select * from club_app.matches where session_id='${sessionId}'`)
  ).rows;
  const expected = rankings(
    players,
    games.map((m) => ({
      game: { a: m.side_a, b: m.side_b, rest: [], target: m.target },
      a: m.score_a,
      b: m.score_b,
    })),
  );
  const actual = (
    await db.query<{
      user_id: string;
      played: number;
      wins: number;
      points: number;
      possible_points: number;
    }>(`select * from club_app.rankings where season_id='${seasonId}'`)
  ).rows;
  expected.forEach((p) =>
    expect(actual.find((x) => x.user_id === p.id)).toMatchObject({
      played: p.played,
      wins: p.wins,
      points: p.points,
      possible_points: p.possible,
    }),
  );
  expect(games.filter((g) => g.target === 15)).toHaveLength(20);
});
it("returns only the caller’s games, scores and partners; an admin who did not play has none", async () => {
  const rows = (
    await as(players[0], "select * from club_app.my_match_history(0)", "aal1")
  )[0].rows;
  expect(rows.length).toBeGreaterThanOrEqual(12);
  const allowed = (
    await db.query<{ id: string }>(
      `select id from club_app.matches where '${players[0]}'=any(side_a) or '${players[0]}'=any(side_b)`,
    )
  ).rows.map((x) => x.id);
  expect(rows.map((x) => x.id).sort()).toEqual(allowed.sort());
  expect(rows.every((x) => !("email" in x) && !("phone" in x))).toBe(true);
  expect(
    (await as(admins[0], "select * from club_app.my_match_history(0)"))[0].rows,
  ).toHaveLength(0);
  await expect(
    as(players[0], "select * from club_app.my_match_history(-1)"),
  ).rejects.toThrow("valid page");
});
it("requires MFA and excludes unsigned administrator identities from seeding", async () => {
  expect(
    (
      await as(
        admins[0],
        `select * from club_app.seed_candidates('${club}','${seasonId}')`,
      )
    )[0].rows,
  ).toHaveLength(25);
  await expect(
    as(
      admins[0],
      `select * from club_app.seed_candidates('${club}','${seasonId}')`,
      "aal1",
    ),
  ).rejects.toThrow("MFA");
  await expect(
    as(
      admins[0],
      `select club_app.set_seeding('${club}','${seasonId}',array['${admins[0]}']::uuid[],1,'Invalid unsigned seed')`,
    ),
  ).rejects.toThrow("current season signature");
});
it("requires a new season signature and preserves the old season receipt", async () => {
  const next = fixtureId(2, 2);
  await db.exec(
    `insert into club_app.seasons(id,club_id,name,regular_capacity,rules) values('${next}','${club}','Next synthetic season',25,'{"operationsEnabled":true,"requireIntake":true}');insert into club_app.registrations(club_id,season_id,user_id,status) values('${club}','${next}','${players[0]}','pending');`,
  );
  await as(
    admins[0],
    `select club_app.publish_agreement('${club}','${next}',repeat('New synthetic season test agreement. ',5),'Synthetic new season review',1)`,
  );
  await expect(
    as(
      admins[0],
      `select club_app.approve_member('${club}','${next}','${players[0]}')`,
    ),
  ).rejects.toThrow("Current signed agreement");
  expect(
    (
      await as(
        admins[0],
        `select * from club_app.seed_candidates('${club}','${next}')`,
      )
    )[0].rows,
  ).toHaveLength(0);
  expect(
    (
      await as(
        admins[0],
        `select * from club_app.seed_candidates('${club}','${seasonId}')`,
      )
    )[0].rows,
  ).toHaveLength(25);
});
it("rejects stale corrections and recomputes ratings without adding games", async () => {
  const game = (
    await db.query<{
      id: string;
      score_a: number;
      score_b: number;
      target: number;
    }>(`select * from club_app.matches order by id limit 1`)
  ).rows[0];
  const before = (
    await db.query<{ user_id: string; rating: string; played: number }>(
      `select user_id,rating,played from club_app.elo_ratings order by user_id`,
    )
  ).rows;
  await as(
    admins[0],
    `select club_app.correct_score('${club}','${game.id}',${game.score_b},${game.score_a},1,'Synthetic disputed score correction')`,
  );
  await expect(
    as(
      admins[0],
      `select club_app.correct_score('${club}','${game.id}',${game.target},0,1,'Stale competing correction')`,
    ),
  ).rejects.toThrow("Revision conflict");
  const changed = (
    await db.query<{ user_id: string; rating: string; played: number }>(
      `select user_id,rating,played from club_app.elo_ratings order by user_id`,
    )
  ).rows;
  expect(changed).not.toEqual(before);
  expect(changed.map((x) => x.played)).toEqual(before.map((x) => x.played));
  await as(
    admins[0],
    `select club_app.correct_score('${club}','${game.id}',${game.score_a},${game.score_b},2,'Restore synthetic original score')`,
  );
  expect(
    (
      await db.query<{ user_id: string; rating: string; played: number }>(
        `select user_id,rating,played from club_app.elo_ratings order by user_id`,
      )
    ).rows,
  ).toEqual(before);
});
it("blocks SMS preference and privileged email leasing by members", async () => {
  await expect(
    as(players[0], `select club_app.set_sms_preference('${club}',true)`),
  ).rejects.toThrow("zero-cost");
  await expect(
    as(players[0], "select * from club_app.claim_free_email_batch(20)"),
  ).rejects.toThrow("permission denied");
});
it("sweeps 2–50 players and 1–10 courts: no missing/duplicate players or singleton courts", () => {
  for (let n = 2; n <= 50; n++)
    for (let c = 1; c <= 10; c++) {
      const ids = Array.from({ length: n }, (_, i) =>
        String(i).padStart(3, "0"),
      );
      if (n > c * 5) {
        expect(() => allocate(ids, c)).toThrow();
        continue;
      }
      let plan = allocate(ids, c);
      for (let round = 0; round < 8; round++) {
        expect(plan.flat().sort()).toEqual(ids);
        expect(
          plan.every((p) => p.length === 0 || (p.length >= 2 && p.length <= 5)),
        ).toBe(true);
        const order = plan.map((p) =>
          p.length
            ? rankings(
                p,
                rotation(p).map((game) => ({
                  game,
                  a: game.target,
                  b: game.target - 1,
                })),
              ).map((x) => x.id)
            : [],
        );
        const next = moveCourts(plan, order);
        expect(next.map((p) => p.length)).toEqual(plan.map((p) => p.length));
        plan = next;
      }
    }
});
it("breaks exact standings ties deterministically regardless of input order", () => {
  const game = { a: ["a"], b: ["b"], rest: [], target: 21 };
  const results = [
    { game, a: 21, b: 10 },
    { game, a: 10, b: 21 },
  ];
  expect(rankings(["b", "a"], results).map((x) => x.id)).toEqual(["a", "b"]);
  expect(rankings(["a", "b"], [...results].reverse())).toEqual(
    rankings(["b", "a"], results),
  );
});
it("leases at most 90 emails daily and leaves SMS untouched", async () => {
  await db.exec(
    `insert into club_app.notification_deliveries(club_id,user_id,idempotency_key,template,payload,channel) select '${club}','${players[0]}','quota-'||g,'test','{}','email' from generate_series(1,100) g;insert into club_app.notification_deliveries(club_id,user_id,idempotency_key,template,payload,channel) values('${club}','${players[0]}','quota-sms','test','{}','sms');`,
  );
  for (let i = 0; i < 5; i++)
    await db.exec(
      `set role service_role;select * from club_app.claim_free_email_batch(20);reset role;`,
    );
  expect(
    (
      await db.query(
        `select reserved from club_app.free_email_usage where day=(now() at time zone 'UTC')::date`,
      )
    ).rows,
  ).toEqual([{ reserved: 90 }]);
  expect(
    (
      await db.query(
        `select channel,status,count(*)::int n from club_app.notification_deliveries group by channel,status order by channel,status`,
      )
    ).rows,
  ).toEqual([
    { channel: "email", status: "pending", n: 10 },
    { channel: "email", status: "processing", n: 90 },
    { channel: "sms", status: "pending", n: 1 },
  ]);
  expect(
    (
      await db.exec(
        "set role service_role;select * from club_app.claim_free_email_batch(20);reset role;",
      )
    )[1].rows,
  ).toHaveLength(0);
});
it("enforces the 2,500-email monthly budget even when daily capacity remains", async () => {
  // Use a frozen SQL clock only in this isolated test to make month boundaries reproducible.
  const fn = (
    await db.query<{ definition: string }>(
      `select pg_get_functiondef('club_app.claim_free_email_batch(integer)'::regprocedure) definition`,
    )
  ).rows[0].definition;
  await db.exec(
    fn
      .replace(
        "(now() AT TIME ZONE 'UTC'::text)",
        "('2026-09-30T12:00Z'::timestamptz AT TIME ZONE 'UTC'::text)",
      )
      .replace(
        "(now() at time zone 'UTC')",
        "('2026-09-30T12:00Z'::timestamptz at time zone 'UTC')",
      ),
  );
  await db.exec(
    `delete from club_app.free_email_usage;insert into club_app.free_email_usage(day,reserved) select '2026-09-01'::date+g,90 from generate_series(0,26) g;insert into club_app.free_email_usage values('2026-09-28',70);`,
  );
  expect(
    (
      await db.exec(
        "set role service_role;select * from club_app.claim_free_email_batch(20);reset role;",
      )
    )[1].rows,
  ).toHaveLength(0);
  await db.exec(fn);
});
it("keeps nonplaying administrators out of the player ELO list", async () => {
  expect(
    (
      await db.query(
        `select * from club_app.elo_ratings where season_id='${seasonId}'`,
      )
    ).rows,
  ).toHaveLength(25);
});
it("does not exhaust free email with repeated court-change notices", async () => {
  await db.exec(
    `insert into club_app.notification_preferences values('${club}','${players[0]}','email',true,now());select club_app.enqueue('${club}','${players[0]}','court-notice','assignment.changed','{}');select club_app.enqueue('${club}','${players[0]}','spare-notice','spare.confirmed','{}');`,
  );
  expect(
    (
      await db.query(
        `select * from club_app.notification_deliveries where idempotency_key='court-notice:email'`,
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        `select * from club_app.notification_deliveries where idempotency_key='spare-notice:email'`,
      )
    ).rows,
  ).toHaveLength(1);
});
it("rewinds and restores the last two rounds of the full match day exactly", async () => {
  await expect(
    db.exec(readFileSync("scripts/matchday-recovery.sql", "utf8")),
  ).resolves.toBeDefined();
  expect(
    (
      await db.query(
        `select * from club_app.matches where session_id='${sessionId}'`,
      )
    ).rows,
  ).toHaveLength(80);
});
it("accepts 30 writes per minute and rejects the 31st without changing the counter", async () => {
  const id = fixtureId(9);
  await db.exec(
    `insert into auth.users values('${id}','rate-test@example.invalid',now());`,
  );
  await as(
    id,
    `do $$declare i int;blocked boolean=false;begin
 for i in 1..30 loop perform club_app.set_sms_preference('${club}',false);end loop;
 begin perform club_app.set_sms_preference('${club}',false);exception when raise_exception then if sqlerrm='Rate limit exceeded' then blocked=true;else raise;end if;end;
 if not blocked then raise exception '31st write was accepted';end if;end $$;`,
    "aal1",
  );
  expect(
    (
      await db.query(
        `select hits from club_app.rate_limits where user_id='${id}'`,
      )
    ).rows,
  ).toEqual([{ hits: 30 }]);
});
it("refunds at exactly 72 elapsed hours but not one millisecond late", async () => {
  await db.exec("begin;");
  try {
    for (const [i, offset] of [
      "72 hours 0.001 seconds",
      "72 hours",
      "71 hours 59 minutes 59.999 seconds",
    ].entries()) {
      const id = fixtureId(3, i + 10);
      await db.exec(
        `insert into club_app.sessions(id,club_id,season_id,venue_id,starts_at,ends_at,rsvp_deadline,capacity) values('${id}','${club}','${seasonId}','${fixtureId(4)}',now()+interval '${offset}',now()+interval '${offset}'+interval '2 hours',now(),25);`,
      );
      await db.exec(
        identity(players[24], "aal1") +
          `set local role authenticated;select club_app.submit_rsvp('${club}','${id}','${players[24]}','not_attending','Synthetic boundary notice',0,gen_random_uuid());reset role;`,
      );
      const rows = (
        await db.query(
          `select cents from club_app.session_accounts where session_id='${id}' and kind='absence_refund' and status='pending'`,
        )
      ).rows;
      expect(rows).toEqual(i < 2 ? [{ cents: 1400 }] : []);
    }
  } finally {
    await db.exec("rollback");
  }
});
