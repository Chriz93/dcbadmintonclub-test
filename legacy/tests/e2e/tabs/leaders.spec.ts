// Leaders: order, court label, record, win rate, badges, live results and the per-player history, on 100 leagues.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety } from "./gen";
import { leaders } from "./oracle";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
for (let i = 0; i < 100; i++) {
  test(`Leaders ${String(i + 1).padStart(3, "0")} · ${genLeague(1000 + i, variety(i)).title}`, async () => {
    const L = genLeague(1000 + i, { ...variety(i), dates: ctx.dates });
    await load(ctx, L);
    const exp = leaders(L), page = ctx.page;
    if (!exp.length) { await expect(page.locator("#sec-lb")).toContainText("No active players yet"); return; }
    const rows = await page.$$eval("#sec-lb .lbrow", (rs) => rs.map((r) => ({ name: r.querySelector(".lbname")!.textContent || "", sub: r.querySelector(".lbsub")!.textContent || "", nums: [...r.querySelectorAll(".lbnum .v")].map((v) => (v.textContent || "").trim()), rank: (r.querySelector(".lbrank")!.textContent || "").trim() })));
    expect(rows.length, "one row per player on the leaderboard").toBe(exp.length);
    exp.forEach((e, k) => {
      const row = rows[k], where = `row ${k + 1} (${e.name})`;
      expect(norm(row.name).startsWith(e.name), `${where}: order — got "${norm(row.name)}"`).toBe(true);
      expect(norm(row.sub).startsWith(`${e.label} · ${e.W}W ${e.L}L · ${e.wr}%`), `${where}: summary — got "${norm(row.sub)}"`).toBe(true);
      expect(row.nums, `${where}: W / L / win%`).toEqual([String(e.W), String(e.L), `${e.wr}%`]);
      expect(row.rank, `${where}: rank`).toBe(k === 0 ? "🥇" : k === 1 ? "🥈" : k === 2 ? "🥉" : String(k + 1));
      expect(row.name.includes("SPARE"), `${where}: spare badge`).toBe(e.spare);
      expect(row.name.includes("(absent)"), `${where}: absent tag`).toBe(e.absent);
      expect(row.name.includes(`(+${e.liveW}W live)`), `${where}: live tag`).toBe(e.liveW > 0 || e.liveL > 0);
    });
    const anyLive = exp.some((e) => e.liveW > 0 || e.liveL > 0);
    expect((await page.locator("#sec-lb").innerText()).includes("Standings include live Round"), "live banner").toBe(anyLive);
    // Tap one row: the game history lists exactly that player's games.
    await page.evaluate(() => nav("standings"));
    await page.locator("#page-standings .ptab").first().click();
    const k = (i * 7) % exp.length;
    await page.locator("#sec-lb .lbrow").nth(k).click();
    await expect(page.locator("#modal-title")).toContainText(exp[k].name);
    expect(await page.locator("#modal-body .gh-row").count(), `history rows for ${exp[k].name}`).toBe(exp[k].GP);
    expect(await page.locator("#modal-body .gh-row.gh-win").count(), `history wins for ${exp[k].name}`).toBe(exp[k].W);
    await page.evaluate(() => closeModal());
  });
}
