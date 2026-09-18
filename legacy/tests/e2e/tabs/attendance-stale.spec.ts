// From the organizer, 18 September: "the attendance marking, after I mark its going away … or cancels my selection
// after few seconds". Their page had been open since the night before, so the version it stamps on a save was behind
// the database (25 against 35). Every save was refused as "Stale state: refresh before saving", the page reloaded, and
// the mark vanished with nothing recorded. A mark must not disappear: the page reloads and applies it to the fresh
// state, and only says it failed if that fails too.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

for (const [label, live] of [["a finished night", "complete"], ["a night in progress", "r2-partial"]] as const) {
  test(`Attendance on ${label} · a mark still lands when the page's version is behind`, async () => {
    const L: League = genLeague(61000 + label.length, { ...variety(982), regulars: 16, spares: 0, pending: 0, live, sessions: 1, dates: ctx.dates } as GenOpts);
    test.skip(!L.current, "needs a session");
    await load(ctx, L);
    const page = ctx.page;
    const seated = Object.values(L.current!.assignments).flat()[0] as number;

    // Another device saves: the row moves on and this page's stamp is now behind — exactly the organizer's case.
    const row = ctx.state.state["current_session"];
    row.version += 1;

    await page.evaluate(() => { nav("admin"); showSec("admin", "a-att"); });
    await page.locator(`#sec-a-att [onclick^="markAttForTab(${seated},'absent'"]`).first().click();

    await expect.poll(() => {
      const r = ctx.state.state["current_session"];
      return r ? (JSON.parse(r.value).attendance || {})[seated] : "(no row)";
    }, { message: "the mark reaches the database", timeout: 15000 }).toBe("absent");
    await expect.poll(() => page.evaluate((id) => (S.current?.attendance || {})[id], seated), { message: "and the page shows it" }).toBe("absent");
  });
}
