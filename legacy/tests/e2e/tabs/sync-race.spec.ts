// A slow background refresh must never undo what the page has just saved (p52). The page refreshes every 20 seconds; a
// reply that left the database before a save and arrives after it is older than what the page already holds, so the
// page keeps its own newer session: the saved scores stay, the next save is not refused as out of date, and the save
// that completes a round still advances it. Replies that really are newer (another device) and replies for a new
// session (whose version numbers start again) are applied as before. The stand-in holds one reply to make the race exact.
import { test, expect, type Page } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { rng, combos, target } from "./gen";
import { kvOf } from "./checks";
import { ladderLeague, playCourt } from "./ladder";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

/** Hold the next read of the running session: `served` resolves once its (older) reply is fixed; `release` delivers it. */
function holdNextRead() {
  let release!: () => void, served!: () => void;
  const until = new Promise<void>((r) => (release = r)), taken = new Promise<void>((r) => (served = r));
  ctx.state.holdRead = { key: "current_session", until, served };
  return { release, taken };
}
/** The organizer enters and saves every game of one court on the Scores page. */
async function enterCourt(page: Page, c: number, ids: number[], r: () => number) {
  await page.evaluate(() => nav("scores"));
  await page.locator("#sc-sel").selectOption(String(c));
  const T = target(ids.length), plan: [number, number][] = [];
  for (let g = 1; g <= combos(ids).length; g++) {
    if (ids.length === 2 && g === 3 && (plan[0][0] > plan[0][1]) === (plan[1][0] > plan[1][1])) break;
    const lo = Math.floor(r() * (T - 1)), aWins = r() < 0.5; plan.push(aWins ? [T, lo] : [lo, T]);
  }
  for (let g = 1; g <= plan.length; g++) { await page.locator(`#si_${c}_${g}_a`).fill(String(plan[g - 1][0])); await page.locator(`#si_${c}_${g}_b`).fill(String(plan[g - 1][1])); }
  await page.getByRole("button", { name: `💾 Save All Court ${c} Scores` }).click();
  await expect(page.locator("#_t")).toHaveText(`Court ${c} saved!`);
  return plan.length;
}
const onPage = (page: Page, c: number) => page.evaluate((x) => Object.keys(S.current.scores).filter((k) => k.startsWith(`c${x}_y${S.current.cycle}_`)).length, c);

test("Sync race · a slow refresh that left before a save does not undo the save on screen", async () => {
  const L = ladderLeague(0b000111, 68001, ctx.dates), r = rng(6801);
  await load(ctx, L);
  const page = ctx.page, h = holdNextRead();
  const refresh = page.evaluate(() => loadAll());
  await h.taken;
  const n = await enterCourt(page, 1, L.current!.assignments[1], r), v = ctx.state.state["current_session"].version;
  h.release(); await refresh;
  expect(await onPage(page, 1), "Court 1's scores are still on the page").toBe(n);
  expect(await page.evaluate(() => _stateVersion["current_session"]), "the page still knows the saved version").toBe(v);
});

test("Sync race · after a slow refresh, the next save is not refused as out of date", async () => {
  const L = ladderLeague(0b000111, 68002, ctx.dates), r = rng(6802);
  await load(ctx, L);
  const page = ctx.page, h = holdNextRead();
  const refresh = page.evaluate(() => loadAll());
  await h.taken;
  await enterCourt(page, 1, L.current!.assignments[1], r);
  h.release(); await refresh;
  const n2 = await enterCourt(page, 2, L.current!.assignments[2], r);
  expect(Object.keys(kvOf(ctx, "current_session").scores).filter((k) => k.startsWith("c2_y1_")), "Court 2 saved in the database").toHaveLength(n2);
  expect(Object.keys(kvOf(ctx, "current_session").scores).filter((k) => k.startsWith("c1_y1_")).length, "Court 1 kept").toBeGreaterThan(0);
});

test("Sync race · the save that completes the round still advances it when a slow refresh lands in between", async () => {
  const L = ladderLeague(0b000111, 68003, ctx.dates), r = rng(6803), cur = L.current!;
  for (const c of [1, 2]) playCourt(cur.scores, c, cur.assignments[c], 1, r);
  await load(ctx, L);
  const page = ctx.page, h = holdNextRead();
  const refresh = page.evaluate(() => loadAll());
  await h.taken;
  await enterCourt(page, 3, cur.assignments[3], r);
  h.release(); await refresh;   // lands before the half-second advance check
  await expect.poll(() => kvOf(ctx, "current_session").cycle, { message: "the round advanced by itself", timeout: 15000 }).toBe(2);
});

test("Sync race · a newer reply from another device is applied", async () => {
  const L = ladderLeague(0b000111, 68004, ctx.dates), r = rng(6804);
  await load(ctx, L);
  const page = ctx.page;
  await enterCourt(page, 1, L.current!.assignments[1], r);
  // Another device saves Court 2 after that.
  const row = ctx.state.state["current_session"], other = JSON.parse(row.value);
  playCourt(other.scores, 2, other.assignments[2], 1, r);
  ctx.state.state["current_session"] = { value: JSON.stringify(other), version: row.version + 1 };
  await page.evaluate(() => loadAll());
  expect(await onPage(page, 2), "the other device's Court 2 scores").toBeGreaterThan(0);
  expect(await onPage(page, 1), "this page's Court 1 scores").toBeGreaterThan(0);
  expect(await page.evaluate(() => _stateVersion["current_session"])).toBe(row.version + 1);
});

test("Sync race · a new session replaces the one this page knew, even though its version numbers start again", async () => {
  const L = ladderLeague(0b000111, 68005, ctx.dates);
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => { _stateVersion["current_session"] = 999; });   // the page has followed a long night
  const next = { ...structuredClone(L.current!), id: L.current!.id + 1, number: L.current!.number + 1, scores: {} };
  ctx.state.state["current_session"] = { value: JSON.stringify(next), version: 1 };
  await page.evaluate(() => loadAll());
  expect(await page.evaluate(() => S.current.id), "the new session is shown").toBe(next.id);
  expect(await page.evaluate(() => _stateVersion["current_session"])).toBe(1);
});
