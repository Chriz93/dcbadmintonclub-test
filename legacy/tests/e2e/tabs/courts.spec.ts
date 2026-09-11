// Courts: gym view and list view show every player on every court (including the fifth on Court 6), counts, medals,
// the arrows from the last round, and the subtitle, on 100 leagues.
import { test, expect } from "@playwright/test";
import { openAs, load, norm, type Ctx } from "./harness";
import { genLeague, variety } from "./gen";
import { courts } from "./oracle";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await ctx?.page.close(); });
for (let i = 0; i < 100; i++) {
  // Every fifth case fills the league to 25 so Court 6 carries five players.
  const opts = { ...variety(i), ...(i % 5 === 2 ? { regulars: 25, declineRate: 0, absentRate: 0 } : {}) };
  test(`Courts ${String(i + 1).padStart(3, "0")} · ${genLeague(9000 + i, opts).title}`, async () => {
    const L = genLeague(9000 + i, { ...opts, dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page, exp = courts(L);
    await page.evaluate(() => nav("courts"));
    await expect(page.locator("#courts-sub")).toHaveText(exp.sub);
    if (!L.players.length) { await expect(page.locator("#court-gym-view")).toContainText("No players yet"); return; }
    for (const e of exp.courts) {
      const card = page.locator(`#court-gym-view .gym-court[onclick="showCourtDetail(${e.c})"]`);
      const t = norm(await card.innerText());
      expect(t, `gym C${e.c}: count`).toContain(`${e.count}/${e.cap}`);
      for (const f of e.firsts) expect(t, `gym C${e.c}: ${f} shown`).toContain(f);
      const medal = e.c === 1 ? "🥇" : e.c === 2 ? "🥈" : e.c === 3 ? "🥉" : "";
      if (medal) expect(t.includes(medal), `gym C${e.c}: medal`).toBe(exp.medals);
      const ups = await card.locator(".mv-u").count(), downs = await card.locator(".mv-d").count();
      expect(ups, `gym C${e.c}: up arrows`).toBe(e.moves.filter((m) => m === "up").length);
      expect(downs, `gym C${e.c}: down arrows`).toBe(e.moves.filter((m) => m === "down").length);
    }
    const shortCourts = exp.courts.filter((e) => e.count < 4).map((e) => `C${e.c}: ${e.count}/4`);
    const bar = norm(await page.locator("#court-gym-view > .alert").first().innerText());
    expect(bar, "status bar").toContain(shortCourts.length ? `Open slots: ${shortCourts.join(" · ")}` : "All courts full");
    // List view: full names, spare marker, one slot per player (never fewer than four).
    await page.locator(".vt-btn").filter({ hasText: "List" }).click();
    for (const e of exp.courts) {
      const card = page.locator("#court-list-view .court-card").nth(e.c - 1);
      const slots = await card.locator(".pslot").allInnerTexts();
      expect(slots.length, `list C${e.c}: slots`).toBe(Math.max(4, e.count));
      e.names.forEach((n, k) => expect(norm(slots[k]).startsWith(n), `list C${e.c}: slot ${k + 1} is ${n}`).toBe(true));
    }
    await page.locator(".vt-btn").filter({ hasText: "Gym" }).click();
  });
}
