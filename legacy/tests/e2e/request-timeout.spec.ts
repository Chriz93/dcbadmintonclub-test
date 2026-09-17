// p73: a request the database never answers is given up on. On 15 September a score save wedged the league's lock in
// the database; on the page the request had no time limit, so Save span until the browser gave up minutes later and
// every later request queued behind it. Now a write is given 25 seconds and a read 12, after which the page stops
// waiting and says so — a write that timed out is reported as "nothing was saved", never as success.
import { test, expect } from "@playwright/test";
import { installMock, freshState, ORGANIZER } from "./mock-supabase";
import { signIn, unlockOrganizer } from "./helpers";

test.describe("a request that is never answered", () => {
  test("a held save is given up on and reported as not saved; a held read says to try again", async ({ page }) => {
    const state = freshState();
    await installMock(page, state);
    page.on("dialog", (d) => d.accept());
    await page.goto("/"); await signIn(page, ORGANIZER); await unlockOrganizer(page);
    await page.evaluate(() => { REQUEST_LIMIT_MS = 600; READ_LIMIT_MS = 400; });   // the same code path, in a test's time

    // A write the database never answers: the page stops waiting and says nothing was saved.
    state.holdRpc = { fn: "save_court_scores", until: new Promise<void>(() => {}), served: () => {} };
    const started = Date.now();
    const write = await page.evaluate(async () => {
      try { await rpc("save_court_scores", { p_court: 1, p_cycle: 1, p_scores: {}, p_expected: 1, p_session: "x", p_lineup: [] }); return "no error"; }
      catch (e: any) { return `${e.message} | status=${e.status} | timedOut=${e.timedOut === true}`; }
    });
    const took = Date.now() - started;
    expect(write, "the write is reported as not saved").toBe("The league database did not answer in time — nothing was saved. Check the court and save again. | status=504 | timedOut=true");
    expect(took, "it gives up in about the limit, not minutes").toBeLessThan(10000);
    expect(await page.evaluate(() => _writesOpen), "the page is not left with a save in flight").toBe(0);

    // A read the database never answers: the page stops waiting and asks to try again.
    state.holdRest = { path: "/rest/v1/players", until: new Promise<void>(() => {}) };
    const read = await page.evaluate(async () => {
      try { await sbG("players"); return "no error"; } catch (e: any) { return `${e.message} | timedOut=${e.timedOut === true}`; }
    });
    expect(read, "the read asks to try again").toBe("The league database did not answer in time — check the connection and try again. | timedOut=true");
    state.holdRest = undefined;   // release it, so the page can load normally again
  });
});
