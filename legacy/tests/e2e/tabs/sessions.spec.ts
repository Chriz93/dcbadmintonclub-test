// Standings → Sessions: each finished night, court by court, with placement, movement arrow and record, on 100 leagues.
import { test, expect } from "@playwright/test";
import { openAs, load, norm, inOrder, type Ctx } from "./harness";
import { genLeague, variety } from "./gen";
import { sessionsTab } from "./oracle";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await ctx?.page.close(); });
for (let i = 0; i < 100; i++) {
  test(`Sessions ${String(i + 1).padStart(3, "0")} · ${genLeague(4000 + i, variety(i)).title}`, async () => {
    const L = genLeague(4000 + i, { ...variety(i), dates: ctx.dates });
    await load(ctx, L);
    const exp = sessionsTab(L), page = ctx.page;
    if (!exp.length) { await expect(page.locator("#sec-sessstand")).toContainText("No completed sessions yet"); return; }
    const cards = (await page.locator("#sec-sessstand .card").allInnerTexts()).map(norm);
    expect(cards.length, "one card per finished session, newest first").toBe(exp.length);
    exp.forEach((e, k) => {
      expect(cards[k], `card ${k + 1}: title`).toContain(e.title);
      inOrder(cards[k], e.courts.flat(), `card ${k + 1} (${e.title})`);
    });
    expect(cards.join(" ")).not.toContain("2026, 2026");
  });
}
