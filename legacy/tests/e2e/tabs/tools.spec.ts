// Admin → Tools: Undo (after clearing a round), Clear This Round's Scores (refused once a round is rotated), the test-email
// and vote-reminder requests with the last-check status, snapshots (save, list, restore after changes, delete) and the
// JSON export. 100 leagues.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, type LiveState, type SessionRec } from "./gen";
import { ORGANIZER } from "../mock-supabase";

const LIVES: LiveState[] = ["r1-partial", "r2-partial", "r1-done", "complete", "none", "r1-partial"];
const H = 3600e3;
const statsFrom = (sessions: SessionRec[]) => {
  const s: Record<number, { w: number; l: number; g: number }> = {};
  for (const x of sessions) { const rot = new Set((x.movements || []).map((m) => m.cycle)); for (const [k, sc] of Object.entries(x.scores)) {
    if (!x.completed && !rot.has(parseInt(k.match(/_y(\d+)_/)![1]))) continue;
    const A = [sc.a1, sc.a2].filter((v): v is number => v != null), B = [sc.b1, sc.b2].filter((v): v is number => v != null);
    for (const id of [...A, ...B]) { s[id] ??= { w: 0, l: 0, g: 0 }; s[id].g++; }
    for (const id of sc.w === "A" ? A : B) s[id].w++; for (const id of sc.w === "A" ? B : A) s[id].l++;
  } }
  return s;
};
let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
for (let i = 0; i < 100; i++) {
  const opts = { ...variety(i + 12), live: LIVES[i % LIVES.length] };
  test(`Tools ${String(i + 1).padStart(3, "0")} · ${genLeague(22000 + i, opts).title}`, async () => {
    const L = genLeague(22000 + i, { ...opts, dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page, r = rng(150 + i), toast = page.locator("#_t"), cur = L.current, U = cur ? cur.number : Math.min(L.sessions.length + 1, 28);
    const kv = (k: string) => { const v = ctx.state.state[k]; return v && v.value !== "null" ? JSON.parse(v.value) : null; };
    const fmt = (ms: number) => page.evaluate((x) => new Date(x).toLocaleString("en-CA", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), ms);
    if (i % 3 === 0) { // a previous check of the reminder job
      ctx.state.state["reminder_last_run"] = { value: JSON.stringify({ at: new Date(L.nowMs - 5 * H).toISOString(), mode: ["live", "test-inbox", "dry-run"][i % 9 / 3], sent: i % 4, planned: 3 + (i % 4), note: i % 2 ? "Session reminder stage vote-2" : "" }), version: 1 };
      await page.evaluate(async () => { await loadAll(); renderAll(); });
    }
    await page.evaluate(() => nav("admin"));
    await page.getByRole("button", { name: "🛠 Tools" }).click();
    const tools = page.locator("#sec-a-tools");
    await expect(page.locator("#undo-tools-btn")).toBeDisabled();
    await expect(page.locator("#undo-tools-btn")).toHaveText("↶ Nothing to undo");
    const last = kv("reminder_last_run");
    if (last) {
      const t = norm(await page.locator("#reminder-last").innerText());
      expect(t).toContain(`Last check ${await fmt(Date.parse(last.at))}`);
      expect(t).toContain(last.mode === "live" ? "live — players receive these" : last.mode === "test-inbox" ? "test — everything goes to the league inbox" : "dry r");
      expect(t).toContain(`${last.sent} email${last.sent === 1 ? "" : "s"} sent of ${last.planned} planned`);
      if (last.note) expect(t).toContain(last.note);
    } else await expect(page.locator("#reminder-last")).toHaveText("No check recorded yet.");

    const act = i % 6;
    if (act === 0 || act === 1) {
      const clear = tools.getByRole("button", { name: "🔄 Clear This Round's Scores" });
      await clear.click();
      if (!cur) { await expect(toast).toHaveText("No session"); return; }
      const rotated = cur.movements.some((m) => m.cycle === cur.cycle);
      if (rotated) { await expect(toast).toHaveText("Round " + cur.cycle + " is already in the standings — use Undo to go back instead"); expect(kv("current_session").scores).toEqual(cur.scores); return; }
      await expect(toast).toHaveText("Scores cleared");
      const kept = Object.fromEntries(Object.entries(cur.scores).filter(([k]) => !k.includes(`_y${cur.cycle}_`)));
      expect(kv("current_session").scores, `round ${cur.cycle} cleared, earlier rounds kept`).toEqual(kept);
      expect(Object.fromEntries(ctx.state.players.filter((p) => p.games_played).map((p) => [p.id, { w: p.season_wins, l: p.season_losses, g: p.games_played }])), "standings unchanged").toEqual(statsFrom([...L.sessions, cur]));
      if (act === 1) {
        const dl = page.waitForEvent("download");
        await tools.getByRole("button", { name: "📤 Export JSON Backup" }).click();
        const file = await dl;
        expect(file.suggestedFilename()).toBe("dcbc-backup.json");
        const data = JSON.parse(fs.readFileSync((await file.path())!, "utf8"));
        expect(data.players.map((p: { name: string }) => p.name).sort(), "backup holds every player").toEqual(L.players.map((p) => p.name).sort());
        expect(data.sessions.length).toBe(L.sessions.length);
        return;
      }
      await expect(page.locator("#undo-tools-btn")).toHaveText("↶ Undo: Clear round scores");
      await expect(page.locator("#undo-history")).toContainText("Clear round scores");
      await page.locator("#undo-tools-btn").click();
      await expect(toast).toHaveText("Undone: Clear round scores");
      expect(kv("current_session").scores, "every score is back").toEqual(cur.scores);
      await expect(page.locator("#undo-tools-btn")).toHaveText("↶ Nothing to undo");
    } else if (act === 2 || act === 3) {
      const kind = act === 2 ? "smoke" : "vote";
      await tools.getByRole("button", { name: kind === "smoke" ? "📧 Send a test email to me" : "🔔 Send vote reminders now" }).click();
      await expect(toast).toHaveText(kind === "smoke" ? `Test email queued for ${ORGANIZER} — sent on the next scheduled check (usually within an hour or two)` : `Reminders for Session ${U} queued — sent on the next scheduled check (usually within an hour or two)`);
      const req = kv("reminder_request");
      expect({ kind: req.kind, session: req.session, by: req.by, to: req.to, at: req.at }).toEqual({ kind, session: U, by: ORGANIZER, to: ORGANIZER, at: new Date(L.nowMs).toISOString() });
      await expect(page.locator("#reminder-pending")).toHaveText(`⏳ ${kind === "smoke" ? "Test email" : "Vote reminders"} requested ${await fmt(L.nowMs)} — waiting for the next scheduled check (usually within an hour or two).`);
    } else {
      const label = `Before case ${i + 1} — “test” <snap>`;
      await expect(page.locator("#snap-list")).toContainText('No snapshots yet. Click "📸 Save Snapshot" above to create one.');
      await page.locator("#snap-label").fill(label);
      await tools.getByRole("button", { name: "📸 Save Snapshot Now" }).click();
      await expect(toast).toHaveText("📸 Snapshot saved");
      const list = page.locator("#snap-list > div");
      await expect(list).toHaveCount(1);
      await expect(list.first().locator("> div").first()).toHaveText(label);
      expect(norm(await list.first().locator("> div").nth(2).innerText())).toBe(`👥 ${L.players.length} players · ✅ ${L.sessions.length} completed sessions${cur ? " · 🏸 Active session" : ""}`);
      await expect(page.locator("#snap-label")).toHaveValue("");
      if (act === 4) {
        await list.first().getByRole("button", { name: "🗑" }).click();
        await expect(toast).toHaveText("Snapshot deleted");
        await expect(page.locator("#snap-list")).toContainText("No snapshots yet.");
        return;
      }
      // Change things, then restore: players, announcements and league state come back exactly.
      const before = { players: structuredClone(ctx.state.players), anns: ctx.state.announcements.map((a) => ({ ...(a as object) })) as { title: string; body: string; type: string }[], sessions: kv("completed_sessions"), current: kv("current_session") };
      if (ctx.state.players.length) ctx.state.players.splice(Math.floor(r() * ctx.state.players.length), 1);
      ctx.state.announcements.push({ id: 999, created_at: new Date().toISOString(), type: "warn", title: "Should disappear", body: "x" } as never);
      delete ctx.state.state["completed_sessions"];
      await page.clock.setFixedTime(new Date(L.nowMs + 60e3));   // a minute later: the automatic pre-restore snapshot gets its own time
      await list.first().getByRole("button", { name: "↩ Restore" }).click();
      await expect(toast).toHaveText(`✅ Snapshot restored — "${label}"`, { timeout: 20000 });
      expect(ctx.state.players.map((p) => [p.id, p.name, p.current_court, p.season_wins]).sort(), "players restored with their ids").toEqual(before.players.map((p) => [p.id, p.name, p.current_court, p.season_wins]).sort());
      expect(ctx.state.announcements.map((a) => { const x = a as unknown as { title: string; body: string; type: string }; return [x.type, x.title, x.body]; }), "announcements restored in order").toEqual([...before.anns].sort((a, b) => String((b as never as { created_at: string }).created_at).localeCompare(String((a as never as { created_at: string }).created_at))).reverse().map((x) => [x.type, x.title, x.body]));
      expect(kv("completed_sessions"), "finished sessions restored").toEqual(before.sessions);
      expect(kv("current_session"), "tonight restored").toEqual(before.current);
      await expect(page.locator("#snap-list > div"), "the pre-restore state was saved too").toHaveCount(2);
    }
  });
}
