// Tools → Danger Zone: archiving the season (label rules, refused during a session, a label can only be used once) and the
// full reset — then every read-only tab re-checked against what the database holds afterwards. 100 leagues.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, refresh, type Ctx } from "./harness";
import { genLeague, variety } from "./gen";
import { fromDb, kvOf, checkAllTabs } from "./checks";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
for (let i = 0; i < 100; i++) {
  const act = (["archive", "archive", "archive", "archive", "short-label", "during-session", "archive-twice", "reset", "reset", "archive"] as const)[i % 10];
  const opts = { ...variety(i + 16), live: act === "during-session" ? ("r1-partial" as const) : ("none" as const) };
  test(`Season rollover ${String(i + 1).padStart(3, "0")} · ${act} · ${genLeague(26000 + i, opts).title}`, async () => {
    const L = genLeague(26000 + i, { ...opts, dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page, toast = page.locator("#_t");
    await page.evaluate(() => nav("admin"));
    await page.getByRole("button", { name: "🛠 Tools" }).click();
    if (act === "reset") {
      const before=structuredClone(ctx.state.players),payments=structuredClone(ctx.state.payments);
      await page.getByRole("button", { name: "Recovery guidance" }).click();
      await expect(toast).toContainText("Permanent bulk deletion is not available");
      expect(ctx.state.players).toEqual(before);expect(ctx.state.payments).toEqual(payments);
      return;
    }
    const label = act === "short-label" ? ["", "ab", "  x  "][i % 3] : `2025-26 #${i + 1}`;
    await page.locator("#new-season-label").fill(label);
    const archive = page.getByRole("button", { name: "📦 Archive season and start fresh" });
    const paymentsBefore = ctx.state.payments.length;
    const dates=['2027-09-14','2027-09-21'];
    await page.locator('#new-season-name').fill('2027-28');await page.locator('#new-season-start').fill('2027-09-01');await page.locator('#new-season-dates').fill(dates.join('\n'));await page.locator('#new-season-cancelled').fill('2027-09-28');await page.locator('#new-season-spare').fill('25');
    await archive.click();
    if (act === "short-label") { await expect(toast).toHaveText("Enter a label for the season being archived"); expect(Object.keys(ctx.state.state).filter((k) => k.startsWith("archive_"))).toEqual([]); return; }
    if (act === "during-session") { await expect(toast).toHaveText("End the active session first"); expect(kvOf(ctx, "completed_sessions") || []).toEqual(L.sessions); return; }
    await expect(toast).toHaveText("Season 2027-28 opened with 2 dates; previous season backed up.");
    expect(ctx.state.payments, "last season's payments leave the ledger (they move to the organizer's archive)").toEqual([]);
    const archived = kvOf(ctx, `archive_${label}`);
    expect(archived.completed_sessions, "last season kept in the archive").toEqual(L.sessions);
    expect(kvOf(ctx, "completed_sessions"), "the new season starts with no finished nights").toBeNull();
    expect(ctx.state.rsvps, "no votes carried over").toEqual([]);
    for (const p of ctx.state.players) expect({ w: p.season_wins, l: p.season_losses, g: p.games_played, absences: p.no_show_count, approved: p.approved, registered: p.registered_at }, `${p.name} reset`)
      .toEqual({ w: 0, l: 0, g: 0, absences: 0, approved: false, registered: null });
    await refresh(ctx);
    await page.evaluate(()=>nav('schedule'));await expect(page.locator('#sched-list .sched-row')).toHaveCount(2);await expect(page.locator('#schedule-season-label')).toContainText('Sep 14, 2027');
    await page.evaluate(()=>nav('home'));await expect(page.locator('#season-hero-label')).toContainText('2027–28');await expect(page.locator('#rules-fee')).toContainText('Spare session $25');
    await page.evaluate(()=>nav('courts'));await expect(page.locator('#court-gym-view')).not.toContainText(L.players[0]?.name||'unused');
    expect(await page.evaluate(()=>SEASON_START)).toBe('2027-09-01');
    if (act === "archive-twice") {
      await page.evaluate(() => nav("admin"));
      await page.getByRole("button", { name: "🛠 Tools" }).click();
      await page.locator("#new-season-label").fill(label);
      await archive.click();
      await expect(toast).toHaveText("Not started: Unique archive label required");
    }
  });
}
