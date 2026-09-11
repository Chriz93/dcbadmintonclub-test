// Stats: one card per player with record, win rate, best court, streaks, court climb and absences; the awards banner.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety } from "./gen";
import { stats } from "./oracle";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
for (let i = 0; i < 100; i++) {
  test(`Stats ${String(i + 1).padStart(3, "0")} · ${genLeague(3000 + i, variety(i)).title}`, async () => {
    const L = genLeague(3000 + i, { ...variety(i), dates: ctx.dates });
    await load(ctx, L);
    const { cards: exp, banner } = stats(L), page = ctx.page;
    if (!exp.length) { await expect(page.locator("#sec-pstats")).toContainText("No data yet"); return; }
    const cards = await page.$$eval("#sec-pstats > .card", (cs) => cs.map((c) => ({ text: c.textContent || "", head: (c.querySelector(".flex-between div")?.textContent || ""), tag: (c.querySelector(".flex-between .tag")?.textContent || "").trim(), vals: [...c.querySelectorAll(".sbox .sv")].map((v) => (v.textContent || "").trim()) })));
    const awardsCard = cards.find((c) => c.text.includes("Season Awards"));
    expect(!!awardsCard, "awards banner only once a session is played").toBe(!!banner);
    if (banner && awardsCard) {
      const t = norm(awardsCard.text);
      if (banner.longest) expect(t).toContain(`Longest Win Streak${banner.longest}`); else expect(t).not.toContain("Longest Win Streak");
      if (banner.improved) expect(t).toContain(`Most Improved${banner.improved}`); else expect(t).not.toContain("Most Improved");
      if (banner.consistent) expect(t).toContain(`Most Consistent${banner.consistent}`);
    }
    const pcs = cards.filter((c) => !c.text.includes("Season Awards"));
    expect(pcs.length, "one card per player").toBe(exp.length);
    exp.forEach((e, k) => {
      const c = pcs[k], where = `card ${k + 1} (${e.name})`, t = norm(c.text);
      expect(norm(c.head), `${where}: name and awards`).toBe(`${e.name}${e.awards ? " " + e.awards : ""}`);
      expect(c.tag, `${where}: court tag`).toBe(e.court);
      expect(c.vals, `${where}: wins, losses, win rate, best court`).toEqual([String(e.W), String(e.L), `${e.wr}%`, e.bestCourt]);
      expect(t, `${where}: current streak`).toContain(`Current streak: ${e.streak}`);
      expect(t, `${where}: best streak`).toContain(`Best streak: ${e.maxStreak}`);
      expect(t, `${where}: absences`).toContain(`Absences: ${e.absences}`);
      const m = t.match(/Court (climb|drop): ([+-]?\d+)/);
      expect(m, `${where}: court climb line`).not.toBeNull();
      expect(m![1], `${where}: climb or drop`).toBe(e.courtClimb >= 0 ? "climb" : "drop");
      expect(Math.abs(parseInt(m![2])), `${where}: courts climbed`).toBe(Math.abs(e.courtClimb));
      expect(t.includes(`(+${e.liveW} live)`), `${where}: live wins`).toBe(e.liveW > 0);
    });
  });
}
