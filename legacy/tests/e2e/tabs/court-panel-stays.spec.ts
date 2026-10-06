// p95: the court panel stays open while the organizer arranges it, and says what it did in court terms.
// From the organizer: "Courts Add player/remove is not working properly". It closed on every click, so adding four
// players to a court meant opening the court four times; and removing a player reported "Answer updated for X",
// the wording of an RSVP change, saying nothing about the court or about what the player keeps.
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
  L.rsvps = regs.map((p) => ({ session_number: L.upcoming, player_id: p.id, response: "coming",
    updated_at: new Date(L.nowMs - 86400e3).toISOString() })) as League["rsvps"];
  return L;
}
const seats = (page: Ctx["page"]) => page.evaluate(() => upcomingSeats() as Record<string, number>);

test("players can be added one after another without reopening the court", async () => {
  await load(ctx, league(63001));
  const page = ctx.page, modal = page.locator("#modal.open");
  await page.evaluate(() => nav("courts"));
  await page.evaluate(() => showCourtDetail(5));

  const added: number[] = [];
  for (let n = 0; n < 3; n++) {
    await page.locator("#modal.open button:has-text('+ Add Player to Court')").click();
    const value = await page.locator("#modal-player-sel option").nth(1).getAttribute("value");
    await page.selectOption("#modal-player-sel", value!);
    await page.locator("#modal.open button:has-text('Add to Court 5')").click();
    // The panel comes straight back on Court 5, so the next player can be added without starting over.
    await expect(modal, `add ${n + 1}: the panel is still open`).toBeVisible();
    await expect(page.locator("#modal-title"), `add ${n + 1}: still on Court 5`).toHaveText("Court 5");
    added.push(Number(value));
  }
  const after = await seats(page);
  // p97: Court 5 starts with four, so the first player added fills it; the next two take it over five and the courts are
  // settled as at the gym — the weakest on it moves down (which may be one of the players just added). What must hold is
  // that every player the organizer added is in tonight's line-up, and that no court is left holding more than five.
  expect(after[added[0]], `player ${added[0]} is on Court 5`).toBe(5);
  for (const id of added) expect(after[id], `player ${id} is in tonight's line-up`).toBeGreaterThan(0);
  const lineup = await page.evaluate(() => upcomingLineup().assign as Record<string, number[]>);
  expect(lineup[5].length, "Court 5 is full, not overfull").toBe(5);
  for (let c = 1; c <= 6; c++) expect(lineup[c].length === 1 || lineup[c].length > 5, `Court ${c} is a real court`).toBe(false);
  // And the panel on screen lists the ones Court 5 kept, without the organizer reopening anything.
  for (const id of added.filter((x) => after[x] === 5)) {
    const name = await page.evaluate((x) => S.players.find((p: any) => p.id === x).name, id);
    await expect(modal).toContainText(name);
  }
});

test("removing a player keeps the panel open and says what it cost them", async () => {
  await load(ctx, league(63002));
  const page = ctx.page, modal = page.locator("#modal.open"), toast = page.locator("#_t");
  await page.evaluate(() => nav("courts"));
  await page.evaluate(() => showCourtDetail(3));
  const before = await page.evaluate(() => (upcomingLineup().assign as Record<string, number[]>)[3]);
  const who = await page.evaluate((id) => S.players.find((p: any) => p.id === id), before[0]);

  await page.locator("#modal.open button:has-text('Remove')").first().click();
  await expect(toast, "it says what happened to the court, not to an RSVP")
    .toHaveText(`${who.name} is off Court 3 for Session ${await page.evaluate(() => upcomingSessionNumber())} — they keep Court ${who.currentCourt}`);
  await expect(modal, "the panel is still open on the court being arranged").toBeVisible();
  await expect(page.locator("#modal-title")).toHaveText("Court 3 — 🥉 3rd Court");
  await expect(modal, "and the removed player is gone from it").not.toContainText(who.name);
  expect((await seats(page))[who.id], "they are out of tonight's line-up").toBeUndefined();
  // Their earned court is untouched: this costs them nothing.
  expect(await page.evaluate((id) => S.players.find((p: any) => p.id === id).currentCourt, who.id)).toBe(who.currentCourt);
});
