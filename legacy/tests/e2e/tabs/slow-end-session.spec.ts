// End Session waits until the last round is saved (p63). Found on a slow test connection: once the last round's scores
// were in, the page showed the session complete while that round was still being saved; End Session then sent the older
// version and was refused ("Stale state: refresh before ending"). Each case holds the round's save at its statistics
// rebuild, as a slow connection would, and fails on the page without the fix. endSession's own answer, for a way in
// that reaches it while the round is still being saved, is checked in unit/slow-replies.test.mjs.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety } from "./gen";
import { courtGames, scoreCourt } from "../helpers";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

const nn = (i: number) => String(i + 1).padStart(2, "0");
const ended = () => JSON.parse(ctx.state.state["completed_sessions"]?.value || "[]").length;

for (let i = 0; i < 6; i++) {
  test(`End Session ${nn(i)} · off, with the reason, until the last round is saved; then it ends cleanly`, async () => {
    const L = genLeague(56200 + i, { ...variety(56200 + i), regulars: 8 + ((i * 7) % 19), spares: 1, pending: 0, live: "r2-partial", sessions: 1 + (i % 4), dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page, before = ended();
    await page.evaluate(() => nav("scores"));
    const open = await page.evaluate(() => Object.entries(S.current.assignments as Record<string, number[]>).filter(([c, ids]) => ids.length >= 2 && !isCourtDone(+c)).map(([c]) => +c));
    expect(open.length, "the last round has courts still to score").toBeGreaterThan(0);
    // Hold the last round's save at its statistics rebuild: the session shows complete, the save is still under way.
    await page.evaluate(() => {
      const w = window as unknown as { __held: boolean; __go: Promise<void>; __release: () => void; rebuildStats: () => Promise<void> };
      w.__held = false; w.__go = new Promise((r) => (w.__release = r));
      const orig = w.rebuildStats;
      w.rebuildStats = async () => { if (_autoAdvancing) { w.__held = true; await w.__go; } return orig(); };
    });
    const scores = async (c: number) => {
      const n = await page.evaluate((x) => S.current.assignments[x].length, c), t = await page.evaluate((x) => courtTarget(x), n), games = await courtGames(page, c);
      // Two players: three games with split winners, so Game 3 is played whatever was saved before (best of three).
      return games.map((_, k) => (n === 2 && k === 1 ? [t - 6, t] : [t, Math.max(0, t - 6 - k)]) as [number, number]);
    };
    for (const c of open) await scoreCourt(page, c, await scores(c));
    await expect.poll(() => page.evaluate(() => (window as unknown as { __held: boolean }).__held), { message: "the last round's save is under way" }).toBe(true);
    expect(await page.evaluate(() => S.current.completed), "the session already shows complete").toBe(true);
    await page.selectOption("#sc-sel", String(open[0]));
    const end = page.locator("#score-area button:has-text('End Session')");
    await expect(end, "End Session is off while the round is saved").toBeDisabled();
    await expect(end).toHaveAttribute("title", "The last round is still being saved. End the session when this button turns on.");
    expect(ended(), "nothing ended yet").toBe(before);
    await page.evaluate(() => (window as unknown as { __release: () => void }).__release());
    await expect(end, "End Session turns on when the round is saved").toBeEnabled();
    await end.click();
    await expect.poll(ended, { message: "the session is saved to history", timeout: 15000 }).toBe(before + 1);
    await expect(page.locator("#_t")).not.toContainText("Stale state");
  });
}
