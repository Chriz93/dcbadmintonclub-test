// p90: seating a regular who was taken off a court puts them back in tonight's line-up.
// The organizer's report: a high-calibre spare arrived, so Rahul was taken off Court 3 to make room; taking a regular
// off marks them "not coming", and the line-up drops everyone who is not coming before it reads anyone's court. So
// "add Rahul to Court 4" wrote his court and changed nothing on screen — and p89's message then claimed he was on
// Court 4 while the grid showed him nowhere.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

function league(seed: number) {
  const opts = { ...variety(31), regulars: 24, spares: 0, pending: 0, live: "none", sessions: 1 } as GenOpts;
  const L: League = genLeague(seed, { ...opts, dates: ctx.dates });
  const regs = L.players.filter((p) => p.approved && !p.waitlisted && p.membership_type !== "spare");
  regs.forEach((p, i) => { p.current_court = Math.min(6, Math.floor(i / 4) + 1); });
  L.rsvps = regs.map((p) => ({ session_number: L.upcoming, player_id: p.id, response: "coming",
    updated_at: new Date(L.nowMs - 86400e3).toISOString() })) as League["rsvps"];
  return { L, regs };
}

test("a player taken off a court can be seated again, and lands where the message says", async () => {
  const { L, regs } = league(58001);
  const rahul = regs[8];                 // earned Court 3
  await load(ctx, L);
  const page = ctx.page, toast = page.locator("#_t");
  await page.evaluate(() => nav("courts"));
  expect((await page.evaluate(() => upcomingSeats() as Record<string, number>))[rahul.id], "starts on the court he earned").toBe(3);

  // The organizer takes him off to make room for a spare: that marks him not coming.
  await page.evaluate((id) => adminSetVote(id, "notcoming"), rahul.id);
  await expect(toast).toContainText(`Answer updated for ${rahul.name}`);
  expect((await page.evaluate(() => upcomingSeats() as Record<string, number>))[rahul.id], "off the courts while not coming").toBeUndefined();

  // Seating him on Court 4 must bring him back — this did nothing at all before p90.
  await page.evaluate((id) => setPlayerCourt(id, 4), rahul.id);
  const seats = await page.evaluate(() => upcomingSeats() as Record<string, number>);
  expect(seats[rahul.id], "back in the line-up, on the court he was given").toBe(4);
  await expect(toast).toContainText(`${rahul.name} is on Court 4`);
  // He is playing tonight, so the line-up no longer lists him as not coming.
  await expect(page.locator("#lineup-notes")).not.toContainText(`${rahul.name} is not coming`);
});

test("the message names the court the player actually landed on", async () => {
  const { L, regs } = league(58002);
  // Court 4's players are all away, so a single player seated there cannot stay: nobody plays alone.
  const away = regs.filter((p) => p.current_court === 4);
  const rahul = regs[8];
  await load(ctx, L);
  const page = ctx.page, toast = page.locator("#_t");
  await page.evaluate(() => nav("courts"));
  for (const p of away) await page.evaluate((id) => adminSetVote(id, "notcoming"), p.id);

  await page.evaluate((id) => setPlayerCourt(id, 4), rahul.id);
  const seats = await page.evaluate(() => upcomingSeats() as Record<string, number>);
  expect(seats[rahul.id], "the rules moved him off the empty court").not.toBe(4);
  await expect(toast, "the message reports where he is, not where he was asked to go")
    .toContainText(`${rahul.name} is on Court ${seats[rahul.id]}, not Court 4`);
  await expect(toast).toContainText("nobody plays alone");
});
