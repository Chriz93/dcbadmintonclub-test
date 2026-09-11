// Admin → Assign: the drag-and-drop board — unassigned players, each court's count and open slots, the missing-players
// warning, dragging a player onto another court or off the courts, and refusing a full court (Court 6 holds five).
import { test, expect } from "@playwright/test";
import { openAs, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, NC, type LiveState } from "./gen";

const LIVES: LiveState[] = ["r1-partial", "r2-partial", "r1-done", "none", "r1-partial"];
let ctx: Ctx;
// A tall window keeps the whole board on screen: a real drag must not scroll mid-way.
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); await ctx.page.setViewportSize({ width: 1280, height: 3600 }); });
test.afterAll(async () => { await ctx?.page.close(); });
for (let i = 0; i < 100; i++) {
  const opts = { ...variety(i + 11), live: LIVES[i % 5], ...(i % 4 === 0 ? { regulars: 25, declineRate: 0, absentRate: 0 } : {}) };
  test(`Assign ${String(i + 1).padStart(3, "0")} · ${genLeague(21000 + i, opts).title}`, async () => {
    const L = genLeague(21000 + i, { ...opts, dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page, r = rng(130 + i), toast = page.locator("#_t"), cur = L.current, ui = page.locator("#assign-ui");
    const kv = () => JSON.parse(ctx.state.state["current_session"].value);
    await page.evaluate(() => nav("admin"));
    await page.getByRole("button", { name: "🏟️ Assign" }).click();
    await expect(page.locator("#assign-rebalance-btn button")).toHaveText("🔄 Re-sort & Rebalance All Courts");
    if (!cur) { await expect(ui).toHaveText("Start a session first to drag-and-drop players between courts."); return; }
    const a = cur.assignments, name = (id: number) => L.players.find((p) => p.id === id)!;
    const under = [1, 2, 3, 4, 5, 6].filter((c) => (a[c] || []).length < 4);
    if (under.length) await expect(ui.locator(".alert-error")).toHaveText(`⚠️ Court${under.length > 1 ? "s" : ""} ${under.map((c) => "C" + c).join(", ")} ${under.length > 1 ? "are" : "is"} missing players — each court needs 4. Drag players between courts to fix.`);
    else await expect(ui.locator(".alert-error")).toHaveCount(0);
    const seated = new Set(Object.values(a).flat()), un = L.players.filter((p) => !seated.has(p.id));
    const zone0 = ui.locator(".dnd-court[data-court='0']");
    await expect(zone0).toHaveCount(un.length ? 1 : 0);
    if (un.length) expect(await zone0.locator(".dnd-player").allTextContents(), "unassigned").toEqual(un.map((p) => p.name));
    for (let c = 1; c <= NC; c++) {
      const blk = ui.locator(`.dnd-court[data-court='${c}']`), ids = a[c] || [], n = ids.length;
      await expect(blk.locator(".dnd-court-title")).toHaveText(`COURT ${c}`);
      await expect(blk.locator(".dnd-court-cnt")).toHaveText(`${n}/${Math.max(4, n)}${n < 4 ? ` — need ${4 - n}` : ""}`);
      expect(await blk.locator(".dnd-player").allTextContents(), `Court ${c}`).toEqual(ids.map((id) => name(id).name + (name(id).membership_type === "spare" ? "S" : "")));
      await expect(blk.locator(".dnd-empty")).toHaveCount(Math.max(0, 4 - n));
    }
    const pool = [...seated, ...(r() < 0.3 ? un.map((p) => p.id) : [])];
    if (!pool.length) return;
    const pid = pool[Math.floor(r() * pool.length)], from = [1, 2, 3, 4, 5, 6].find((c) => (a[c] || []).includes(pid)) || 0;
    const targets = [0, 1, 2, 3, 4, 5, 6].filter((t) => t !== from && (t > 0 || un.length > 0));
    const t = targets[Math.floor(r() * targets.length)], cap = t === NC ? 5 : 4;
    await ui.locator(`.dnd-player[data-pid='${pid}']`).dragTo(ui.locator(`.dnd-court[data-court='${t}']`));
    if (t > 0 && (a[t] || []).filter((x) => x !== pid).length >= cap) {
      await expect(toast).toHaveText(`Court ${t} is full (${cap}/${cap})`);
      expect(kv().assignments, "a refused drop moves nobody").toEqual(a);
      await expect(ui.locator(`.dnd-court[data-court='${from}'] .dnd-player[data-pid='${pid}']`), "still shown where they were").toHaveCount(1);
      return;
    }
    await expect(toast).toHaveText(`Player moved to ${t > 0 ? "Court " + t : "Unassigned"}`);
    const want = Object.fromEntries(Object.entries(a).map(([c, ids]) => [c, ids.filter((x) => x !== pid)]));
    if (t > 0) want[t] = [pid, ...(want[t] || [])];
    expect(kv().assignments, `${name(pid).name}: C${from} → ${t || "unassigned"}`).toEqual(want);
    await expect(ui.locator(`.dnd-court[data-court='${t}'] .dnd-player[data-pid='${pid}']`), "shown in the zone it was dropped on").toHaveCount(1);
  });
}
