// Admin → Announce: list, post (every type, with validation and plain-text rendering), delete, and the Home page following
// along — on 100 leagues.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, rng } from "./gen";

const TYPES = ["info", "warn", "success"] as const;
const TITLES = ["Gym change", "No play <next> week", "Bring \"indoor\" shoes", "Tournament & social 🏸", "Rappel : paiement"];
let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
for (let i = 0; i < 100; i++) {
  test(`Announce ${String(i + 1).padStart(3, "0")} · ${genLeague(16000 + i, variety(i + 6)).title}`, async () => {
    const L = genLeague(16000 + i, { ...variety(i + 6), dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page, r = rng(40 + i), toast = page.locator("#_t");
    await page.evaluate(() => nav("admin"));
    await page.getByRole("button", { name: "📣 Announce" }).click();
    const list = page.locator("#ann-admin-list"), cards = list.locator(".ann-card");
    const anns = [...L.announcements].sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (!anns.length) await expect(list).toContainText("No announcements");
    await expect(cards).toHaveCount(anns.length);
    for (let k = 0; k < anns.length; k++) {
      await expect(cards.nth(k)).toHaveClass(`ann-card ann-${anns[k].type}`);
      await expect(cards.nth(k).locator(".ann-title")).toHaveText(anns[k].title);
      await expect(cards.nth(k).locator(".ann-body")).toHaveText(anns[k].body);
    }
    const act = i % 5;
    if (act === 3 && anns.length) {
      const k = Math.floor(r() * anns.length);
      await cards.nth(k).getByRole("button", { name: "✕" }).click();
      await expect(cards).toHaveCount(anns.length - 1);
      expect(ctx.state.announcements.map((a) => a.id)).not.toContain(anns[k].id);
      expect(await page.locator("#ann-home .ann-card .ann-title").allTextContents(), "Home follows").toEqual(anns.filter((_, j) => j !== k).slice(0, 3).map((a) => a.title));
      return;
    }
    const type = TYPES[i % 3], title = TITLES[Math.floor(r() * TITLES.length)] + ` #${i + 1}`, body = `Line one of notice ${i + 1}.\nLine two <i>stays</i> plain text.`;
    await page.locator("#ann-type").selectOption(type);
    const missing = act === 1 ? "title" : act === 4 ? "body" : "";
    await page.locator("#ann-title").fill(missing === "title" ? "   " : title);
    await page.locator("#ann-body").fill(missing === "body" ? "" : body);
    await page.getByRole("button", { name: "📣 Post" }).click();
    if (missing) {
      await expect(toast).toHaveText("Fill title and message");
      expect(ctx.state.announcements.length, "nothing posted").toBe(L.announcements.length);
      return;
    }
    await expect(toast).toHaveText("Posted!");
    const row = ctx.state.announcements.at(-1) as unknown as { type: string; title: string; body: string };
    expect({ type: row.type, title: row.title, body: row.body }).toEqual({ type, title, body });
    await expect(cards).toHaveCount(anns.length + 1);
    await expect(cards.first()).toHaveClass(`ann-card ann-${type}`);
    await expect(cards.first().locator(".ann-title")).toHaveText(title);
    expect(await cards.first().locator(".ann-body").textContent()).toBe(body);
    await expect(page.locator("#ann-title")).toHaveValue("");
    await expect(page.locator("#ann-body")).toHaveValue("");
    await expect(page.locator("#ann-home .ann-card").first().locator(".ann-title"), "newest shows first on Home").toHaveText(title);
  });
}
