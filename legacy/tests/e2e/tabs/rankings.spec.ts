// Rankings: Elo for every player against the independent reference, order, summary line and trend, on 100 leagues.
import { test, expect } from "@playwright/test";
import { openAs, load, norm, type Ctx } from "./harness";
import { genLeague, variety } from "./gen";
import { rankings } from "./oracle";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await ctx?.page.close(); });
for (let i = 0; i < 100; i++) {
  test(`Rankings ${String(i + 1).padStart(3, "0")} · ${genLeague(2000 + i, variety(i)).title}`, async () => {
    const L = genLeague(2000 + i, { ...variety(i), dates: ctx.dates });
    await load(ctx, L);
    const { elo, rows: exp } = rankings(L), page = ctx.page;
    if (!exp.length) { await expect(page.locator("#sec-rank")).toContainText("No active players yet"); return; }
    expect(await page.evaluate(() => computeEloRatings()), "every rating equals the independent Elo").toEqual(elo);
    const rows = await page.$$eval("#sec-rank .lbrow", (rs) => rs.map((r) => ({ name: r.querySelector(".lbname")!.textContent || "", sub: r.querySelector(".lbsub")!.textContent || "", text: r.textContent || "" })));
    expect(rows.length).toBe(exp.length);
    const shown = rows.map((r) => parseInt(r.text.match(/(\d{3,4})\s*ELO/)![1]));
    expect([...shown].sort((a, b) => b - a), "sorted high to low").toEqual(shown);
    exp.forEach((e, k) => {
      const r = rows[k], where = `row ${k + 1}`;
      expect(shown[k], `${where}: rating`).toBe(e.rating);
      // Players with equal ratings may appear in either order; everyone else must be exactly here.
      const peers = exp.filter((x) => x.rating === e.rating).map((x) => x.name);
      expect(peers.some((n) => norm(r.name).startsWith(n)), `${where}: expected one of ${peers.join(", ")} — got "${norm(r.name)}"`).toBe(true);
      const me = exp.find((x) => norm(r.name).startsWith(x.name))!;
      expect(norm(r.sub), `${where}: summary`).toBe(me.sub);
      expect(r.name.includes("SPARE"), `${where}: spare badge`).toBe(me.spare);
      expect(r.name.includes("(absent)"), `${where}: absent tag`).toBe(me.absent);
      if (me.trend) expect(r.name.includes(me.trend), `${where}: trend ${me.trend}`).toBe(true);
    });
    await expect(page.locator("#sec-rank")).toContainText("Everyone starts from the court they first played on this season");
  });
}
