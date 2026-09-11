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
      await page.getByRole("button", { name: "Full Reset — Wipe All Data" }).click();   // both confirmations accepted
      await expect(toast).toHaveText("Reset complete");
      expect({ players: ctx.state.players.length, announcements: ctx.state.announcements.length, finished: kvOf(ctx, "completed_sessions"), tonight: kvOf(ctx, "current_session") })
        .toEqual({ players: 0, announcements: 0, finished: [], tonight: null });
      await refresh(ctx);
      await checkAllTabs(ctx, fromDb(ctx, L));
      return;
    }
    const label = act === "short-label" ? ["", "ab", "  x  "][i % 3] : `2025-26 #${i + 1}`;
    await page.locator("#new-season-label").fill(label);
    const archive = page.getByRole("button", { name: "📦 Archive season and start fresh" });
    const paymentsBefore = ctx.state.payments.length;
    await archive.click();
    if (act === "short-label") { await expect(toast).toHaveText("Enter an archive label (for example 2025-26)"); expect(Object.keys(ctx.state.state).filter((k) => k.startsWith("archive_"))).toEqual([]); return; }
    if (act === "during-session") { await expect(toast).toHaveText("End the active session first"); expect(kvOf(ctx, "completed_sessions") || []).toEqual(L.sessions); return; }
    await expect(toast).toHaveText(`Archived ${label}; ${L.players.length} players reset; ${paymentsBefore} payments archived`);
    expect(ctx.state.payments, "last season's payments leave the ledger (they move to the organizer's archive)").toEqual([]);
    const archived = kvOf(ctx, `archive_${label}`);
    expect(archived.completed_sessions, "last season kept in the archive").toEqual(L.sessions);
    expect(kvOf(ctx, "completed_sessions"), "the new season starts with no finished nights").toBeNull();
    expect(ctx.state.rsvps, "no votes carried over").toEqual([]);
    for (const p of ctx.state.players) expect({ w: p.season_wins, l: p.season_losses, g: p.games_played, absences: p.no_show_count, approved: p.approved, registered: p.registered_at }, `${p.name} reset`)
      .toEqual({ w: 0, l: 0, g: 0, absences: 0, approved: false, registered: null });
    await refresh(ctx);
    await checkAllTabs(ctx, fromDb(ctx, L));
    if (act === "archive-twice") {
      await page.evaluate(() => nav("admin"));
      await page.getByRole("button", { name: "🛠 Tools" }).click();
      await page.locator("#new-season-label").fill(label);
      await archive.click();
      await expect(toast).toHaveText("Not started: Unique archive label required");
    }
  });
}
