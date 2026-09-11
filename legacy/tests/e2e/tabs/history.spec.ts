// Standings → History: a card per night with rounds and games; opening one shows every game and the moves after each round.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, norm, inOrder, type Ctx } from "./harness";
import { genLeague, variety } from "./gen";
import { history } from "./oracle";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
for (let i = 0; i < 100; i++) {
  test(`History ${String(i + 1).padStart(3, "0")} · ${genLeague(5000 + i, variety(i)).title}`, async () => {
    const L = genLeague(5000 + i, { ...variety(i), dates: ctx.dates });
    await load(ctx, L);
    const exp = history(L), page = ctx.page;
    if (!exp.length) { await expect(page.locator("#sec-hist")).toContainText("No completed sessions yet"); return; }
    await page.evaluate(() => nav("standings"));
    await page.locator("#page-standings .ptab").filter({ hasText: /History$/ }).click();
    const cards = page.locator("#sec-hist .card");
    await expect(cards).toHaveCount(exp.length);
    for (let k = 0; k < exp.length; k++) {
      const t = norm(await cards.nth(k).innerText());
      expect(t, `card ${k + 1}`).toContain(exp[k].head);
      expect(t, `card ${k + 1}: rounds`).toContain(`${exp[k].rounds} rounds`);
      expect(t, `card ${k + 1}: games`).toContain(`${exp[k].games} games`);
    }
    // Open one card (a different one each case) and read the whole night back.
    const k = i % exp.length;
    await cards.nth(k).locator("div").first().click();
    // textContent: the round headings are styled uppercase on screen.
    const opened = norm((await page.locator("#sec-hist .card").nth(k).textContent()) || "");
    inOrder(opened, exp[k].lines, `opened card ${k + 1}`);
    await cards.nth(k).locator("div").first().click();
    expect(norm(await page.locator("#sec-hist .card").nth(k).innerText())).toContain("Tap to expand scores");
  });
}
