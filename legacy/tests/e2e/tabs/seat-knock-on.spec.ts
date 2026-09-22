// p89: seating a player before a session says what it did to the rest of the courts.
// Reported by the organizer: "when I add a player to court 4, another player who is on court 5 automatically jumps to
// court4". The courts were right — tonight's line-up is worked out from the court each player earned plus the seating
// rules, and "nobody plays alone" had moved that player off an otherwise empty Court 4. Seating a second player there
// removes the reason, so he returns to the court he earned. Nothing said so: seating a regular gave no message at all.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

/** Courts 1,2,3,5,6 have four players coming; Court 4 has exactly one, so the rules move that one up to Court 5. */
function leagueWithLonePlayerOnCourt4(seed: number) {
  const opts = { ...variety(31), regulars: 24, spares: 0, pending: 0, live: "none", sessions: 1 } as GenOpts;
  const L: League = genLeague(seed, { ...opts, dates: ctx.dates });
  const regs = L.players.filter((p) => p.approved && !p.waitlisted && p.membership_type !== "spare");
  regs.forEach((p, i) => { p.current_court = Math.min(6, Math.floor(i / 4) + 1); });
  const lone = regs[12];                       // the first player whose earned court is 4
  L.rsvps = regs.map((p) => ({ session_number: L.upcoming, player_id: p.id,
    response: p.current_court === 4 && p.id !== lone.id ? "notcoming" : "coming",
    updated_at: new Date(L.nowMs - 86400e3).toISOString() })) as League["rsvps"];
  return { L, lone, spare: regs.find((p) => p.current_court === 6)! };
}

test("seating a player on the empty court says who else the rules moved", async () => {
  const { L, lone, spare } = leagueWithLonePlayerOnCourt4(57001);
  await load(ctx, L);
  const page = ctx.page, toast = page.locator("#_t");
  await page.evaluate(() => nav("courts"));

  // Where the rules put everyone before the organizer touches anything.
  const before = await page.evaluate(() => upcomingSeats() as Record<string, number>);
  expect(before[lone.id], "nobody plays alone, so the lone player is not on Court 4").toBe(5);
  await expect(page.locator("#lineup-notes"), "and the notes say why").toContainText(`${lone.name} would be the only player on Court 4`);

  await page.evaluate((id) => setPlayerCourt(id, 4), spare.id);

  // The message names the seat that was set AND the player who moved with it, marked as going back to their own court.
  await expect(toast).toContainText(`${spare.name} is on Court 4`);
  await expect(toast, "the knock-on is named instead of happening in silence").toContainText(`${lone.name.split(" ")[0]} C5→C4 (earned)`);

  const after = await page.evaluate(() => upcomingSeats() as Record<string, number>);
  expect(after[lone.id], "back on the court they earned, now that Court 4 is not empty").toBe(4);
  expect(after[spare.id]).toBe(4);
  // Nobody else was disturbed by the change.
  const others = Object.keys(after).map(Number).filter((id) => id !== lone.id && id !== spare.id && before[id] !== after[id]);
  expect(others, "only the two players involved changed court").toEqual([]);
});

test("a seat change that moves nobody else says only what it did", async () => {
  const { L } = leagueWithLonePlayerOnCourt4(57002);
  await load(ctx, L);
  const page = ctx.page, toast = page.locator("#_t");
  await page.evaluate(() => nav("courts"));
  // Court 1 has four; moving one of them to Court 2 (which has four) leaves no court alone or over five.
  const before = await page.evaluate(() => upcomingSeats() as Record<string, number>);
  const onC1 = Object.keys(before).map(Number).filter((id) => before[id] === 1);
  const who = L.players.find((p) => p.id === onC1[0])!;
  await page.evaluate((id) => setPlayerCourt(id, 2), who.id);
  await expect(toast).toContainText(`${who.name} is on Court 2`);
  await expect(toast, "nothing else moved, so nothing else is claimed").not.toContainText("also moved");
});
