// Schedule: 28 approved Tuesdays in order, the right one active or done, the six school cancellations, on 100 leagues.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety } from "./gen";
import season from "../../../automation/season.json";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
for (let i = 0; i < 100; i++) {
  // Cover the whole season: 0 to 27 nights played, with and without a night in progress.
  const opts = { ...variety(i), sessions: i % 28, regulars: i === 0 ? 0 : 8 + (i % 17) };
  test(`Schedule ${String(i + 1).padStart(3, "0")} · ${genLeague(8000 + i, opts).title}`, async () => {
    const L = genLeague(8000 + i, { ...opts, dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page;
    await page.evaluate(() => nav("schedule"));
    const rows = (await page.locator("#sched-list .sched-row").allInnerTexts()).map(norm);
    expect(rows.length, "28 approved Tuesdays").toBe(28);
    rows.forEach((t, k) => {
      const done = L.sessions.some((s) => s.number === k + 1), active = L.current?.number === k + 1;
      expect(t, `row ${k + 1}: date`).toContain(`Session ${k + 1} — ${ctx.dates[k]}`);
      expect(t, `row ${k + 1}: time`).toContain("Tuesday · 8:00–10:00 PM");
      expect(t.endsWith(done ? "Done" : active ? "Active" : "—"), `row ${k + 1}: status — "${t}"`).toBe(true);
    });
    const cancelled = norm(await page.locator("#sched-list .card").last().innerText());
    for (const iso of season.cancelled_dates) {
      const [y, m, d] = iso.split("-").map(Number);
      const label = await page.evaluate(([yy, mm, dd]) => new Date(yy, mm - 1, dd, 12).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }), [y, m, d]);
      expect(cancelled, "school cancellation listed").toContain(label);
    }
    expect(cancelled).toContain("not part of the 28 sessions");
    await expect(page.locator("#page-schedule .page-sub")).toHaveText("28 Tuesdays · Sep 15, 2026 – May 18, 2027");
  });
}
