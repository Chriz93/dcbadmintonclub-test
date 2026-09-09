import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  matchdayFixture,
  club,
  seasonId,
  sessionId,
  players,
  admins,
  identity,
  courts,
} from "../scripts/matchday-fixture";
import {
  snapshotSchema,
  lineups,
  savedMovements,
  roundProgress,
  stats,
  partners,
  summaryText,
  seasonHighlights,
  type LeagueData,
} from "../src/league/data";
import { nextRoundPlacement } from "../src/domain/placement";
let db: PGlite, baseline: LeagueData;
const q = (v: unknown) =>
  `'${(typeof v === "string" ? v : JSON.stringify(v)).replaceAll("'", "''")}'`;
async function as(id: string, sql: string, aal = "aal1") {
  await db.exec(
    "savepoint actor;set local role authenticated;" + identity(id, aal),
  );
  try {
    const result = await db.exec(sql);
    await db.exec("reset role;release savepoint actor;");
    return result;
  } catch (e) {
    await db.exec(
      "rollback to savepoint actor;reset role;release savepoint actor;",
    );
    throw e;
  }
}
async function snapshot(id = players[0]) {
  return snapshotSchema.parse(
    (
      await as(
        id,
        `select club_app.league_snapshot('${club}','${seasonId}') data`,
        id === admins[0] ? "aal2" : "aal1",
      )
    )[0].rows[0].data,
  );
}
function finalPlan(data = baseline) {
  const old = lineups(data, sessionId, 4);
  return nextRoundPlacement(
    old,
    data.matches
      .filter((m) => m.round === 4)
      .map((m) => ({
        game: {
          a: m.a,
          b: m.b,
          rest: old[courts.indexOf(m.court_id)].filter(
            (id) => ![...m.a, ...m.b].includes(id),
          ),
          target: m.target,
        },
        a: m.scoreA!,
        b: m.scoreB!,
      })),
  ).map((players, i) => ({ court_id: courts[i], players }));
}
const finalize = (plan = finalPlan(), rev = 5, id = admins[0], aal = "aal2") =>
  as(
    id,
    `select club_app.finalize_session('${club}','${sessionId}',${rev},${q(plan)}::jsonb,'Reviewed final movement',${q(Object.fromEntries(baseline.matches.map((m) => [m.id, m.revision])))}::jsonb)`,
    aal,
  );
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
  await db.exec("begin");
  baseline = await snapshot();
  await db.exec("rollback");
}, 60000);
afterAll(async () => await db?.close());
beforeEach(async () => await db.exec("begin"));
afterEach(async () => await db.exec("rollback"));
it("projects a complete 25-player season with 80 games and 100 durable rating events", () => {
  expect(baseline.players).toHaveLength(25);
  expect(baseline.matches).toHaveLength(80);
  expect(baseline.history).toHaveLength(100);
  expect(baseline.finals).toEqual([]);
  expect(baseline.history.reduce((n, h) => n + h.games, 0)).toBe(320);
});
it.each(players)(
  "keeps rating chain, personal totals and partners consistent for %s",
  (id) => {
    const events = baseline.history.filter((h) => h.id === id),
      player = baseline.players.find((p) => p.id === id)!;
    expect(events[0].before).toBe(player.initialRating);
    events
      .slice(1)
      .forEach((e, i) => expect(e.before).toBeCloseTo(events[i].after, 9));
    expect(events.at(-1)!.after).toBeCloseTo(player.rating, 9);
    const record = stats(baseline, id);
    expect(record.played).toBe(player.played);
    expect(record.wins + record.losses).toBe(record.played);
    expect(partners(baseline, id).reduce((sum, p) => sum + p.played, 0)).toBe(
      record.played,
    );
  },
);
it("projects no personal/contact/payment/agreement data", () => {
  const serialized = JSON.stringify(baseline);
  for (const key of [
    "email",
    "phone",
    "legal_name",
    "guardian",
    "signature",
    "payment",
    "birth",
    "address",
  ])
    expect(serialized).not.toContain(`"${key}`);
});
it("returns a compact unchanged response only for the same visible data", async () => {
  const data = (
    await as(
      players[0],
      `select club_app.league_snapshot('${club}','${seasonId}','${baseline.version}') data`,
    )
  )[0].rows[0].data;
  expect(data).toEqual({ version: baseline.version, unchanged: true });
});
it("rejects another club or season", async () => {
  await expect(
    as(
      players[0],
      `select club_app.league_snapshot('${admins[0]}','${seasonId}')`,
    ),
  ).rejects.toThrow("Forbidden");
  await expect(
    as(players[0], `select club_app.league_snapshot('${club}','${admins[0]}')`),
  ).rejects.toThrow("Season unavailable");
});
it.each([1, 2, 3, 4])(
  "recognizes all 20 games and published history in round %i",
  (r) => {
    expect(roundProgress(baseline, sessionId, r)).toMatchObject({
      state: "ready",
      completed: 20,
      expected: 20,
    });
    expect(savedMovements(baseline, sessionId, r)).toHaveLength(
      r === 4 ? 0 : 25,
    );
  },
);
it("publishes all 25 final movements without changing ratings or played assignments", async () => {
  await finalize();
  const data = await snapshot();
  expect(data.finals).toHaveLength(25);
  expect(savedMovements(data, sessionId, 4)).toHaveLength(25);
  expect(data.assignments).toEqual(baseline.assignments);
  expect(data.history).toEqual(baseline.history);
  expect(data.version).not.toBe(baseline.version);
  expect(summaryText(data, sessionId, 4)).toContain("Published movements:");
});
it.each([
  "duplicate-player",
  "missing-player",
  "duplicate-court",
  "foreign-court",
  "missing-array",
  "over-capacity",
  "single-player",
])("rejects malformed final plan %s atomically", async (kind) => {
  const plan = finalPlan();
  if (kind === "duplicate-player") plan[0].players[0] = plan[1].players[0];
  if (kind === "missing-player") plan[0].players.pop();
  if (kind === "duplicate-court") plan[0].court_id = plan[1].court_id;
  if (kind === "foreign-court") plan[0].court_id = admins[0];
  if (kind === "missing-array")
    delete (plan[0] as { players?: string[] }).players;
  if (kind === "over-capacity")
    plan[0].players.push(...plan[5].players.splice(0, 2));
  if (kind === "single-player")
    plan[1].players.push(...plan[0].players.splice(1));
  await expect(finalize(plan)).rejects.toThrow();
  expect((await snapshot()).finals).toEqual([]);
});
it("requires current revision and administrator MFA for final placement", async () => {
  await expect(finalize(finalPlan(), 4)).rejects.toThrow("Revision conflict");
  await expect(finalize(finalPlan(), 5, players[0])).rejects.toThrow(
    "Administrator",
  );
  await expect(finalize(finalPlan(), 5, admins[0], "aal1")).rejects.toThrow(
    "Administrator",
  );
  await finalize();
  await expect(finalize()).rejects.toThrow("Revision conflict");
});
it("invalidates finals on restart and restores them with the reviewed undo", async () => {
  await finalize();
  const prior = await snapshot();
  const versions = Object.fromEntries(
    baseline.matches
      .filter((m) => m.round === 4)
      .map((m) => [m.id, m.revision]),
  );
  await as(
    admins[0],
    `select club_app.restart_round('${club}','${sessionId}',4,6,${q(versions)},'Review fourth round')`,
    "aal2",
  );
  expect(
    (await db.query("select * from club_app.final_placements")).rows,
  ).toHaveLength(0);
  expect((await snapshot()).history).toHaveLength(0);
  const event = (
    await db.query<{ id: number }>(
      `select id from club_app.audit_events where action='round.restarted' order by id desc limit 1`,
    )
  ).rows[0].id;
  await as(
    admins[0],
    `select club_app.undo_round_restart('${club}',${event},7,'Restore reviewed round')`,
    "aal2",
  );
  const restored = await snapshot();
  expect(restored.finals).toEqual(prior.finals);
  expect(restored.history).toEqual(prior.history);
});
it("accepts a participant correction request, keeps it private, and replays ELO on acceptance", async () => {
  const m = baseline.matches.find((m) => m.a.includes(players[0]))!;
  const sql = `select club_app.request_match_review('${club}','${m.id}',${m.revision},${m.scoreB},${m.scoreA},'Teams were entered backwards') id`;
  const id = (await as(players[0], sql))[0].rows[0].id;
  expect((await snapshot()).reviews).toHaveLength(1);
  expect((await snapshot(players[24])).reviews).toHaveLength(0);
  await expect(as(players[0], sql)).rejects.toThrow("open review");
  await as(
    admins[0],
    `select club_app.resolve_match_review('${club}',${q(id)},1,true,'Reviewed with both teams')`,
    "aal2",
  );
  const data = await snapshot();
  expect(data.reviews[0].status).toBe("accepted");
  expect(data.matches.find((g) => g.id === m.id)!.scoreA).toBe(m.scoreB);
  expect(data.history).not.toEqual(baseline.history);
  expect(data.history).toHaveLength(100);
});
it("rejects nonparticipants and stale proposals, and allows a reasoned decline", async () => {
  const m = baseline.matches[0],
    outsider = players.find((p) => ![...m.a, ...m.b].includes(p))!;
  const request = (rev: number) =>
    `select club_app.request_match_review('${club}','${m.id}',${rev},${m.scoreB},${m.scoreA},'Teams were reversed') id`;
  await expect(as(outsider, request(m.revision))).rejects.toThrow("own game");
  await expect(as(m.a[0], request(0))).rejects.toThrow("Revision conflict");
  const id = (await as(m.a[0], request(m.revision)))[0].rows[0].id;
  await as(
    admins[0],
    `select club_app.correct_score('${club}','${m.id}',${m.scoreB},${m.scoreA},${m.revision},'Updated independently')`,
    "aal2",
  );
  await expect(
    as(
      admins[0],
      `select club_app.resolve_match_review('${club}',${q(id)},1,true,'Review and accept this')`,
      "aal2",
    ),
  ).rejects.toThrow("Revision conflict");
  await as(
    admins[0],
    `select club_app.resolve_match_review('${club}',${q(id)},1,false,'Already corrected independently')`,
    "aal2",
  );
  expect((await snapshot(admins[0])).reviews[0].status).toBe("declined");
});
it("only publishes Q&A after an administrator answer and rejects stale edits", async () => {
  const id = (
    await as(
      players[0],
      `select club_app.ask_league_question('${club}','How are exact ties decided?') id`,
    )
  )[0].rows[0].id;
  expect((await snapshot()).questions).toHaveLength(1);
  expect((await snapshot(players[1])).questions).toHaveLength(0);
  await expect(
    as(
      players[0],
      `select club_app.answer_league_question('${club}',${q(id)},1,'Win rate then points')`,
    ),
  ).rejects.toThrow("Administrator");
  await as(
    admins[0],
    `select club_app.answer_league_question('${club}',${q(id)},1,'Win rate, normalized points, stable player ID.')`,
    "aal2",
  );
  expect((await snapshot(players[1])).questions[0].answer).toContain(
    "stable player ID",
  );
  await expect(
    as(
      admins[0],
      `select club_app.answer_league_question('${club}',${q(id)},1,'Stale answer text')`,
      "aal2",
    ),
  ).rejects.toThrow("Revision conflict");
});
it.each([
  "rating_history",
  "final_placements",
  "match_reviews",
  "league_questions",
])("denies direct member writes to %s", async (table) => {
  await expect(as(players[0], `delete from club_app.${table}`)).rejects.toThrow(
    "permission denied",
  );
});

it("counts completed-session consistency and excludes cancelled nights", () => {
  const summary = seasonHighlights(baseline);
  expect(summary.sessions).toBe(1);
  expect(summary.players.every((p) => p.attended === 1 && p.best === 1)).toBe(
    true,
  );
  const copy = structuredClone(baseline);
  copy.sessions.push({
    ...copy.sessions[0],
    id: "cancelled",
    status: "cancelled",
  });
  expect(seasonHighlights(copy)).toEqual(summary);
  copy.sessions.push({
    ...copy.sessions[0],
    id: "missed",
    status: "completed",
  });
  expect(
    seasonHighlights(copy).players.every((p) => p.streak === 0 && p.best === 1),
  ).toBe(true);
});

it("rejects final placement review when a completed-session score changes", async () => {
  const m = baseline.matches[0];
  await as(
    admins[0],
    `select club_app.correct_score('${club}','${m.id}',${m.scoreB},${m.scoreA},${m.revision},'Independent score correction')`,
    "aal2",
  );
  await expect(finalize()).rejects.toThrow("Match revision conflict");
  expect((await snapshot()).finals).toEqual([]);
});
it("keeps the old unversioned finalization helper private", async () => {
  await expect(
    as(
      admins[0],
      `select club_app.finalize_session_before_match_guard('${club}','${sessionId}',5,${q(finalPlan())},'Bypass score review')`,
      "aal2",
    ),
  ).rejects.toThrow("permission denied");
});
