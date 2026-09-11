// Standings → Court history: one row per player, one cell per finished night with the court they ended on.
import { test, expect } from "@playwright/test";
import { openAs, load, type Ctx } from "./harness";
import { genLeague, variety } from "./gen";
import { courtHistory } from "./oracle";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await ctx?.page.close(); });
for (let i = 0; i < 100; i++) {
  test(`Court history ${String(i + 1).padStart(3, "0")} · ${genLeague(6000 + i, variety(i)).title}`, async () => {
    const L = genLeague(6000 + i, { ...variety(i), dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page;
    if (!L.sessions.length) { await expect(page.locator("#sec-heat")).toContainText("No sessions yet"); return; }
    const exp = courtHistory(L);
    const rows = await page.$$eval("#sec-heat .heatmap-row", (rs) => rs.map((r) => ({ name: r.querySelector(".heatmap-name")?.textContent || "", cells: [...r.querySelectorAll(".hm-cell")].map((c) => c.textContent || "") })));
    expect(rows, "names and courts, row by row").toEqual(exp);
    const head = await page.locator("#sec-heat .card > div").nth(1).locator("div").allInnerTexts();
    expect(head, "one column per finished session").toEqual(L.sessions.map((s) => `S${s.number}`));
  });
}
