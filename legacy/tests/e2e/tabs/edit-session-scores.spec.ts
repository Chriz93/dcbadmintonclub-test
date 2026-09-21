// Correcting a score after the round has been worked out (p87), replaying the mistake the organizer actually made:
// "I mistakenly entered a score on court 6 round 2. It is supposed to be Bao who is moving to court 5."
// The night is the 16 September session from the production backup, with the players' names replaced. On Court 6 the
// recorded result sent Player 15 up; the corrected result sends Player 25 up. Saving the correction must re-run the
// rotation so the movement, the courts and the season totals all follow the real result — and must leave every other
// court of that round exactly as it was.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";
import fixture from "../fixtures/session-2026-09-16.json";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

const JOSEPH = 112, RYAN = 121, BAO = 131, SAM = 138;   // Court 6, Round 2 — the four who played it

test("a corrected Court 6 score sends the right player up, and leaves the other courts alone", async () => {
  const opts: GenOpts = { ...variety(3), regulars: 24, spares: 0, pending: 0, live: "none", sessions: 0 };
  const L: League = genLeague(56002, { ...opts, dates: ctx.dates });
  const session = JSON.parse(JSON.stringify(fixture.session)) as any;
  const ladder: Record<number, number> = {};
  for (const [c, ids] of Object.entries(session.initialAssignments as Record<string, number[]>)) for (const id of ids) ladder[id] = +c;
  L.players = fixture.players.map((p) => ({ ...(L.players[0] as any), id: p.id, name: p.name, email: `p${p.id}@example.invalid`,
    approved: true, waitlisted: false, membership_type: "regular", current_court: ladder[p.id] ?? 0, highest_court: ladder[p.id] ?? 0,
    season_wins: 0, season_losses: 0, games_played: 0, no_show_count: 0 })) as League["players"];
  L.current = session;
  await load(ctx, L);
  const page = ctx.page, toast = page.locator("#_t");

  // What the app recorded from the wrong entry.
  const before = await page.evaluate(() => JSON.parse(JSON.stringify(S.current.movements)));
  const lastRound = before.length;
  expect(before[lastRound - 1].mv[String(RYAN)], "the mistake sent Player 15 up").toBe("up");
  expect(before[lastRound - 1].mv[String(BAO)]).toBe("stay");

  await page.evaluate(() => { nav("admin"); showSec("admin", "a-edit"); });
  const card = page.locator("#score-edit");
  await expect(card, "the editor names the session it will change").toContainText("Edit scores — Session 1 (tonight)");
  await card.locator("#ed-round").selectOption(String(lastRound));
  await card.locator("#ed-court").selectOption("6");
  await expect(card, "a round that has been worked out says the correction re-runs it")
    .toContainText(`Round ${lastRound} has already been worked out.`);

  // A score that is not a finished game is refused, and nothing is written.
  await card.locator("#ed_1_a").fill("21"); await card.locator("#ed_1_b").fill("21");
  await card.locator("#ed-save").click();
  await expect(toast).toContainText("Tied 21–21 is not a finished game");
  expect(await page.evaluate(() => S.current.movements.length), "a refused correction changes nothing").toBe(lastRound);

  // The scores as they were actually played: 21-13, 21-12, 11-21.
  for (const [g, a, b] of [[1, "21", "13"], [2, "21", "12"], [3, "11", "21"]] as const) {
    await card.locator(`#ed_${g}_a`).fill(a); await card.locator(`#ed_${g}_b`).fill(b);
  }
  await card.locator("#ed-save").click();
  await expect(toast).toHaveText(`Court 6, Round ${lastRound} corrected — the session was worked out again`);

  const after = await page.evaluate(() => JSON.parse(JSON.stringify({ mv: S.current.movements, a: S.current.assignments, sc: S.current.scores })));
  // Bao topped the court on points, so Bao is the one who goes up.
  expect(after.mv[lastRound - 1].mv[String(BAO)], "Bao moves up to Court 5").toBe("up");
  expect(after.mv[lastRound - 1].mv[String(RYAN)], "Ryan no longer moves up").toBe("stay");
  expect(after.a["5"], "Bao is on Court 5 for next week").toContain(BAO);
  expect(after.a["6"], "Ryan stays on Court 6").toContain(RYAN);
  // The corrected scores are the ones stored, winners included.
  expect(after.sc[`c6_y${lastRound}_g1`]).toMatchObject({ sA: 21, sB: 13, w: "A" });
  expect(after.sc[`c6_y${lastRound}_g3`]).toMatchObject({ sA: 11, sB: 21, w: "B" });
  // Sam lost all three; Joseph, Ryan and Bao won two each.
  const wins = after.mv[lastRound - 1].wins;
  expect([wins[JOSEPH], wins[RYAN], wins[BAO], wins[SAM]]).toEqual([2, 2, 2, 0]);

  // Every other court of that round is untouched — a correction on Court 6 is a correction on Court 6.
  const others = Object.entries(before[lastRound - 1].mv as Record<string, string>)
    .filter(([id]) => ![JOSEPH, RYAN, BAO, SAM].includes(+id))
    .filter(([id, dir]) => after.mv[lastRound - 1].mv[id] !== dir)
    .map(([id, dir]) => `${id}: was ${dir}, now ${after.mv[lastRound - 1].mv[id]}`);
  expect(others, "no other player's movement changed").toEqual([]);
  expect(after.mv.length, "the night still has the rounds it had").toBe(lastRound);
});

test("with a session live, a finished session is not offered for editing", async () => {
  const opts: GenOpts = { ...variety(5), regulars: 20, spares: 0, pending: 0, live: "r1-partial", sessions: 3 };
  const L: League = genLeague(56003, { ...opts, dates: ctx.dates });
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => { nav("admin"); showSec("admin", "a-edit"); });
  const card = page.locator("#score-edit");
  await expect(card, "the live session is the one on offer").toContainText(`Edit scores — Session ${L.current!.number} (tonight)`);
  await expect(card).toContainText("A night that is already finished is left alone once the next one has started.");
});
