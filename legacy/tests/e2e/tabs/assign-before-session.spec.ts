// p93: the drag-and-drop court board works before a session, and shows the numbers the organizer decides on.
// "dont I have the flexibility of moving players from one court to another? ... Is this the right place to do the court
// assignments?" — it was not: Admin → Assign refused to work until a session had started, leaving only the Courts tab
// panel, two dialogs deep and one player at a time. And: "I move a player down based on thier wins, if wins tie then
// look at the points scored not ELO."
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

function seasonLeague(seed: number) {
  const opts = { ...variety(31), regulars: 24, spares: 2, pending: 0, live: "none", sessions: 2 } as GenOpts;
  const L: League = genLeague(seed, { ...opts, dates: ctx.dates });
  const regs = L.players.filter((p) => p.approved && !p.waitlisted && p.membership_type !== "spare");
  L.rsvps = regs.map((p) => ({ session_number: L.upcoming, player_id: p.id, response: "coming",
    updated_at: new Date(L.nowMs - 86400e3).toISOString() })) as League["rsvps"];
  return L;
}
const openBoard = async (page: Ctx["page"]) => page.evaluate(() => { nav("admin"); showSec("admin", "a-assign"); });

test("the board arranges tonight's courts before a session", async () => {
  await load(ctx, seasonLeague(62001));
  const page = ctx.page;
  await openBoard(page);
  const board = page.locator("#assign-ui");
  await expect(board, "it no longer refuses until a session starts").not.toContainText("Start a session first");
  await expect(board).toContainText("Tonight's starting courts.");

  // The board shows tonight's line-up, court by court.
  const shown = await board.evaluate((el) => {
    const out: Record<string, number[]> = {};
    el.querySelectorAll(".dnd-court").forEach((d) => { out[d.getAttribute("data-court")!] = [...d.querySelectorAll(".dnd-player")].map((p) => Number(p.getAttribute("data-pid"))); });
    return out;
  });
  const lineup = await page.evaluate(() => upcomingLineup().assign as Record<string, number[]>);
  for (let c = 1; c <= 6; c++) expect(shown[String(c)].slice().sort((a, b) => a - b), `Court ${c}`).toEqual((lineup[c] || []).slice().sort((a, b) => a - b));
});

test("each court lists its players by wins, then points scored", async () => {
  await load(ctx, seasonLeague(62002));
  const page = ctx.page;
  await openBoard(page);
  const board = page.locator("#assign-ui");
  const rec = await page.evaluate(() => seasonRecord() as Record<string, { w: number; pts: number }>);
  for (let c = 1; c <= 6; c++) {
    const ids = await board.locator(`.dnd-court[data-court="${c}"] .dnd-player`).evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-pid"))));
    if (ids.length < 2) continue;
    const want = [...ids].sort((x, y) => (rec[y]?.w ?? 0) - (rec[x]?.w ?? 0) || (rec[y]?.pts ?? 0) - (rec[x]?.pts ?? 0) || x - y);
    expect(ids, `Court ${c}: most wins first, then most points — the bottom player is the one to move down`).toEqual(want);
    // The two numbers the decision is made on are on the chip.
    const first = board.locator(`.dnd-court[data-court="${c}"] .dnd-player`).first();
    await expect(first.locator(".dnd-rec")).toHaveText(`${rec[ids[0]]?.w ?? 0}W · ${rec[ids[0]]?.pts ?? 0} pts`);
  }
});

test("moving a player on the board sets their court, and is not a court drop", async () => {
  await load(ctx, seasonLeague(62003));
  const page = ctx.page;
  await openBoard(page);
  const board = page.locator("#assign-ui");
  const c3 = await board.locator('.dnd-court[data-court="3"] .dnd-player').evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-pid"))));
  const weakest = c3[c3.length - 1];                    // the bottom of Court 3 by wins then points
  const before = await page.evaluate((id) => (computePlayerStreakAndImprovement()[id] || {}).courtClimb, weakest);

  await page.evaluate((id) => assignMove(id, 4), weakest);
  expect(await page.evaluate((id) => S.players.find((p: any) => p.id === id).currentCourt, weakest), "the organizer's decision is written").toBe(4);
  expect(await page.evaluate((id) => (computePlayerStreakAndImprovement()[id] || {}).courtClimb, weakest), "and it is not a drop").toBe(before);
  await openBoard(page);
  await expect(board.locator('.dnd-court[data-court="4"]'), "the board follows").toContainText(await page.evaluate((id) => S.players.find((p: any) => p.id === id).name, weakest));
});
