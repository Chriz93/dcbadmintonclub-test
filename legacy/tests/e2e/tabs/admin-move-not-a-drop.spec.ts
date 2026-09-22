// p92: a court change the organizer makes by hand is not counted as a court drop.
// The organizer's rule: "moving a player rewrites the court they have earned ... its upto the admin to make that
// decision, so I can reorgranise the courts, it should not show as a drop in thier stats or anything."
// Everything a player did on court — rating, record, best court reached — was already untouched by a manual move;
// the court-climb figure was not, because it is measured against the court they are on now.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

type Snap = { court: number; highest: number; W: number; L: number; elo: number; climb: number };
const snap = (page: Ctx["page"], id: number) => page.evaluate((pid) => {
  const p = S.players.find((x: any) => x.id === pid);
  const st = computePlayerStreakAndImprovement()[pid] || {};
  return { court: p.currentCourt, highest: p.highestCourt, W: p.seasonWins, L: p.seasonLosses,
    elo: computeEloRatings()[pid], climb: st.courtClimb } as Snap;
}, id);

function seasonLeague(seed: number) {
  const opts = { ...variety(31), regulars: 24, spares: 0, pending: 0, live: "none", sessions: 2 } as GenOpts;
  const L: League = genLeague(seed, { ...opts, dates: ctx.dates });
  const regs = L.players.filter((p) => p.approved && !p.waitlisted && p.membership_type !== "spare");
  L.rsvps = regs.map((p) => ({ session_number: L.upcoming, player_id: p.id, response: "coming",
    updated_at: new Date(L.nowMs - 86400e3).toISOString() })) as League["rsvps"];
  const first = L.sessions[0] as any;
  const seatedFirst = new Set<number>(Object.values((first.initialAssignments || first.assignments) as Record<string, number[]>).flat());
  // Court climb is measured from the first session's courts, so the player must have played it.
  const who = regs.find((p) => seatedFirst.has(p.id) && p.current_court > 1 && p.current_court < 5)!;
  return { L, who };
}

test("moving a player down for a strong spare costs them nothing in the standings", async () => {
  const { L, who } = seasonLeague(61001);
  await load(ctx, L);
  const page = ctx.page;
  const before = await snap(page, who.id);
  const down = Math.min(6, before.court + 2);

  await page.evaluate(([id, c]) => setPlayerCourt(id, c), [who.id, down] as const);
  const after = await snap(page, who.id);

  expect(after.court, "the organizer's decision stands: the earned court is rewritten").toBe(down);
  expect(after.climb, "but it is not recorded as a court drop").toBe(before.climb);
  expect(after.elo, "the rating is untouched").toBe(before.elo);
  expect([after.W, after.L], "the record is untouched").toEqual([before.W, before.L]);
  expect(after.highest, "the best court they reached is untouched").toBe(before.highest);
});

test("a move up by hand is not counted as a climb either", async () => {
  const { L, who } = seasonLeague(61002);
  await load(ctx, L);
  const page = ctx.page;
  const before = await snap(page, who.id);
  const up = Math.max(1, before.court - 1);
  await page.evaluate(([id, c]) => setPlayerCourt(id, c), [who.id, up] as const);
  const after = await snap(page, who.id);
  expect(after.court).toBe(up);
  expect(after.climb, "a court the organizer gave is not a court climbed").toBe(before.climb);
});

test("courts won on court still count, on top of the organizer's moves", async () => {
  const { L, who } = seasonLeague(61003);
  await load(ctx, L);
  const page = ctx.page;
  const before = await snap(page, who.id);
  // The organizer moves them down one, then they win their way back up two: a net climb of one.
  await page.evaluate(([id, c]) => setPlayerCourt(id, c), [who.id, Math.min(6, before.court + 1)] as const);
  const moved = await snap(page, who.id);
  expect(moved.climb).toBe(before.climb);
  // A rotation putting them two courts higher is play, and play is counted.
  await page.evaluate(([id, c]) => { const p = S.players.find((x: any) => x.id === id); p.currentCourt = c; }, [who.id, Math.max(1, moved.court - 2)] as const);
  const played = await snap(page, who.id);
  expect(played.climb, "two courts won on court, on top of the courtesy move").toBe(before.climb + 2);
});
