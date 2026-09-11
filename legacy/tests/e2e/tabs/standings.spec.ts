// The Standings page itself: every tab button shows its own section and only that one, the banner and the subtitle.
import { test, expect } from "@playwright/test";
import { openAs, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng } from "./gen";
import { pos } from "./oracle";

const TABS: [string, string][] = [["Leaders", "lb"], ["Rankings", "rank"], ["Stats", "pstats"], ["Sessions", "sessstand"], ["History", "hist"], ["Court history", "heat"], ["RSVP", "vote"], ["Q&A", "qa"]];
let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await ctx?.page.close(); });
for (let i = 0; i < 100; i++) {
  test(`Standings ${String(i + 1).padStart(3, "0")} · ${genLeague(7000 + i, variety(i)).title}`, async () => {
    const L = genLeague(7000 + i, { ...variety(i), dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page, r = rng(i + 1);
    await page.evaluate(() => nav("standings"));
    await expect(page.locator("#page-standings")).toHaveClass(/active/);
    await expect(page.locator("#page-standings .page-sub")).toHaveText("Season 2026–27 · Sep 15, 2026 – May 18, 2027");
    // Visit the tabs in a different order each case; after each click exactly one section is visible.
    const order = [...TABS].sort(() => r() - 0.5);
    for (const [label, sec] of order) {
      await page.locator("#page-standings .ptab").filter({ hasText: new RegExp(label.replace("&", "&") + "$") }).click();
      for (const [, other] of TABS) await expect(page.locator(`#sec-${other}`), `${label}: section ${other}`)[other === sec ? "toBeVisible" : "toBeHidden"]();
      await expect(page.locator("#page-standings .ptab.active"), `${label}: highlighted tab`).toHaveText(new RegExp(label.replace("&", "&") + "$"));
    }
    const p = pos(L);
    const banner = page.locator("#pos-standings");
    if (p) { await expect(banner).toContainText(`Player of Session ${p.number}`); await expect(banner.locator(".pos-name")).toHaveText(p.name); expect(norm(await banner.locator(".pos-stat").innerText())).toBe(p.stat); }
    else expect(norm(await banner.innerText())).toBe("");
  });
}
