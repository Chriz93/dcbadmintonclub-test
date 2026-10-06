// p99: the organizer gives a drop-in their starting points and their starting court. From the organizer: "if a drop in
// player comes, admin gets the right to assign him some points and give him a starting court."
// Before this a player's starting rating came only from the court they first played on (1500 on Court 1 down to 1000 on
// Court 6), so a strong drop-in seated low started hundreds of points under their level and climbed out of a hole.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";
import { eloReference } from "../helpers";
import { kvOf } from "./checks";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

function league(seed: number) {
  const opts = { ...variety(13), regulars: 20, spares: 2, pending: 0, live: "none", sessions: 1 } as GenOpts;
  const L: League = genLeague(seed, { ...opts, dates: ctx.dates });
  const at = new Date(L.nowMs - 86400e3).toISOString();
  L.rsvps = L.players.filter((p) => p.approved && !p.waitlisted && p.membership_type !== "spare" && p.current_court > 0)
    .map((p) => ({ session_number: L.upcoming, player_id: p.id, response: "coming", note: "", updated_at: at })) as League["rsvps"];
  return L;
}
const openBoard = async (page: Ctx["page"]) => page.evaluate(() => { nav("admin"); showSec("admin", "a-assign"); });
/** Choose the player, type the number and the court, then save — waiting for each box to hold what was typed, because
 *  choosing a player fills both boxes in (dropInPick) and saving re-draws the card. */
async function fillAndSave(page: Ctx["page"], id: number, points: string, court?: string) {
  await page.selectOption("#di-player", String(id));
  await page.fill("#di-points", points);
  await expect(page.locator("#di-points")).toHaveValue(points);
  if (court !== undefined) { await page.selectOption("#di-court", court); await expect(page.locator("#di-court")).toHaveValue(court); }
  await page.click("#di-save");
}
/** Someone who has played this season, so a starting number actually changes their rating. */
const played = (L: League) => L.players.find((p) => Object.values(L.sessions[0].scores).some((sc) => [sc.a1, sc.a2, sc.b1, sc.b2].includes(p.id)))!;

test("the card asks for a player, their points and their court, and fills in what they have now", async () => {
  const L = league(99001);
  await load(ctx, L);
  const page = ctx.page;
  await openBoard(page);
  const card = page.locator("#drop-in");
  await expect(card).toContainText("Drop-in or returning player");
  await expect(card).toContainText("Court 1 is 1500 points, each court below is 100 fewer");
  const p = played(L);
  await page.selectOption("#di-player", String(p.id));
  await expect(page.locator("#di-court"), "the court they are on now").toHaveValue(String(p.current_court || 0));
  await expect(page.locator("#di-points"), "no number set yet, so the box is empty").toHaveValue("");
  const want = 1500 - (Math.min(6, Math.max(1, p.current_court || 6)) - 1) * 100;
  await expect(page.locator("#di-points"), "and it says what the court itself gives them")
    .toHaveAttribute("placeholder", `${want} on Court ${p.current_court > 0 ? p.current_court : 6}`);
});

test("the points the organizer sets are the points the player starts from", async () => {
  const L = league(99002);
  await load(ctx, L);
  const page = ctx.page;
  await openBoard(page);
  const p = played(L);
  await fillAndSave(page, p.id, "1740");
  await expect(page.locator("#_t")).toContainText(`${p.name} starts on 1740 points`);
  expect(kvOf(ctx, "player_seed_points"), "the number is stored, and only that number").toEqual({ [String(p.id)]: 1740 });
  // Every rating on the page equals the independent reference seeded the same way — only the start moved.
  const want = eloReference(L.players as never, L.sessions as never, undefined, { [p.id]: 1740 });
  expect(await page.evaluate(() => computeEloRatings()), "every rating matches the independent reference").toEqual(want);
  expect(want[p.id], "and their rating starts from 1740, not the court's own number").not.toBe(1500 - (p.current_court - 1) * 100);
});

test("a court set with the points is written as a seat change, and is not a court drop", async () => {
  const L = league(99003);
  await load(ctx, L);
  const page = ctx.page;
  await openBoard(page);
  const p = L.players.find((x) => x.approved && !x.waitlisted && x.current_court > 2 && x.current_court < 6)!;
  const climb = await page.evaluate((id) => (computePlayerStreakAndImprovement()[id] || {}).courtClimb, p.id);
  await fillAndSave(page, p.id, "1450", "2");
  await expect(page.locator("#_t")).toContainText(`${p.name} starts on 1450 points`);
  await expect.poll(() => page.evaluate((id) => S.players.find((x: { id: number }) => x.id === id).currentCourt, p.id), { message: "the court is set" }).toBe(2);
  expect(kvOf(ctx, "player_seed_points")[String(p.id)], "and the points with it").toBe(1450);
  expect(await page.evaluate((id) => (computePlayerStreakAndImprovement()[id] || {}).courtClimb, p.id), "the organizer's move is not a drop").toBe(climb);
});

test("a number outside 800 to 2000 is refused, and nothing is written", async () => {
  const L = league(99004);
  await load(ctx, L);
  const page = ctx.page;
  await openBoard(page);
  const p = played(L);
  for (const bad of ["10", "5000", "799", "2001"]) {
    await fillAndSave(page, p.id, bad);
    await expect(page.locator("#_t"), `${bad} points`).toContainText("Starting points must be between 800 and 2000");
    expect(kvOf(ctx, "player_seed_points"), `${bad} was not stored`).toBeNull();
  }
});

test("saving with no player chosen says so", async () => {
  const L = league(99005);
  await load(ctx, L);
  const page = ctx.page;
  await openBoard(page);
  await page.click("#di-save");
  await expect(page.locator("#_t")).toContainText("Choose a player");
  expect(kvOf(ctx, "player_seed_points")).toBeNull();
});

test("clearing puts the player back on the court's own starting points", async () => {
  const L = league(99006);
  await load(ctx, L);
  const page = ctx.page;
  await openBoard(page);
  const p = played(L);
  await fillAndSave(page, p.id, "1900");
  await expect(page.locator("#_t")).toContainText(`${p.name} starts on 1900 points`);
  await openBoard(page);
  await expect(page.locator("#di-set"), "the card lists what the organizer set").toContainText(`${p.name} 1900`);
  // Choosing them again shows the number back, so saving without typing changes nothing.
  await page.selectOption("#di-player", String(p.id));
  await expect(page.locator("#di-points")).toHaveValue("1900");
  await page.locator(`#di-set .di-clear[data-pid="${p.id}"]`).click();
  await expect(page.locator("#_t")).toContainText("is back on the court's own starting points");
  expect(kvOf(ctx, "player_seed_points"), "the number is gone, not set to zero").toEqual({});
  expect(await page.evaluate(() => computeEloRatings()), "and the ratings are the court-seeded ones again")
    .toEqual(eloReference(L.players as never, L.sessions as never));
  // clearDropIn is idempotent: clearing a player who has no number set changes nothing and says so.
  await page.evaluate((id) => clearDropIn(id), p.id);
  await expect(page.locator("#_t")).toContainText(`${p.name} is back on the court's own starting points`);
  expect(kvOf(ctx, "player_seed_points")).toEqual({});
});
