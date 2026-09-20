// The rating arrow on the Rankings tab must measure the night that was played, nothing else.
// Reported by the organizer after the 16 September session: "why its showing up arrow 99? I started with 1500 and lost
// 1 point it should be down arrow with 1 point right? ... she won 4 games, and still lost -87 points."
// The arrow was the difference between two ratings computed from DIFFERENT starting lines (see p84). A round moves a
// rating by at most K=32, so no two-round night can honestly show 87 or 99 — that bound is the test.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";
import { eloReference } from "../helpers";
import fixture from "../fixtures/session-2026-09-16.json";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

const K = 32;

test("the rating arrow is the night's play, never the gap between two starting lines", async () => {
  const opts: GenOpts = { ...variety(3), regulars: 24, spares: 0, pending: 0, live: "none", sessions: 0 };
  const L: League = genLeague(56001, { ...opts, dates: ctx.dates });
  const session = fixture.session as any;
  // The ladder court each player carried into the night — production's players.current_court, which is what the old
  // code wrongly re-seeded the "before" rating from whenever it differed from the court they actually opened on.
  const ladder: Record<number, number> = {};
  for (const [c, ids] of Object.entries(session.initialAssignments as Record<string, number[]>)) for (const id of ids) ladder[id] = +c;
  L.players = fixture.players.map((p) => ({ ...(L.players[0] as any), id: p.id, name: p.name, email: `p${p.id}@example.invalid`,
    approved: true, waitlisted: false, membership_type: "regular", current_court: ladder[p.id] ?? 0, highest_court: ladder[p.id] ?? 0,
    season_wins: 0, season_losses: 0, games_played: 0, no_show_count: 0 })) as League["players"];
  L.current = session;
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => nav("rank"));

  const rounds: number = session.movements.length;                 // 2 — a night is two rounds
  const moved = await page.evaluate(() => eloChangeThisSession() as Record<string, number>);

  // 1. The hard bound. K=32 per round is the most a rating can move, so nothing may exceed 32 × rounds played.
  const overBound = Object.entries(moved).filter(([, v]) => Math.abs(v) > K * rounds)
    .map(([id, v]) => `${fixture.players.find((p) => p.id === +id)?.name}: ${v > 0 ? "+" : ""}${v} (max ±${K * rounds})`);
  expect(overBound, `no arrow may exceed ±${K * rounds} over ${rounds} rounds`).toEqual([]);

  // 2. The exact figure: the same season seeding, one session's rounds fewer.
  const all = [session] as never[];
  const now = eloReference(L.players as never, all);
  const before = eloReference(L.players as never, all, all.length - 1);
  const wrong = Object.keys(now).map(Number).filter((id) => (moved[String(id)] ?? 0) !== Math.round(now[id] - before[id]))
    .map((id) => `${fixture.players.find((p) => p.id === id)?.name}: page ${moved[String(id)] ?? 0}, played ${Math.round(now[id] - before[id])}`);
  expect(wrong, "every arrow is the rating the night's play produced").toEqual([]);

  // 3. Nobody's rating moves before a ball is hit: a player whose court in Round 1 is not their ladder court is exactly
  //    the case the old code got wrong, and their arrow must still be pure play.
  const openedElsewhere = Object.keys(now).map(Number).filter((id) => now[id] - before[id] !== 0);
  expect(openedElsewhere.length, "the night moved some ratings").toBeGreaterThan(0);

  // 4. What the organizer sees. Every arrow drawn on the page carries a number within the same bound.
  const drawn = await page.locator("#sec-rank").evaluate((el) =>
    [...(el.textContent || "").matchAll(/[▲▼]\s*([+-]?\d+)/g)].map((m) => Math.abs(parseInt(m[1]))));
  expect(drawn.length, "arrows are drawn").toBeGreaterThan(0);
  expect(Math.max(...drawn), `the biggest arrow shown is within ±${K * rounds}`).toBeLessThanOrEqual(K * rounds);
});
