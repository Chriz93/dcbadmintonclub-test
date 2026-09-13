// Admin → Assign: the drag-and-drop board — unassigned players, each court's count and open slots, the missing-players
// warning, dragging a player onto another court or off the courts, and refusing a full court (Court 6 holds five).
import {manualMoveExpected} from "./manual-move-oracle";
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, NC, type LiveState } from "./gen";

const LIVES: LiveState[] = ["r1-partial", "r2-partial", "r1-done", "none", "r1-partial"];
let ctx: Ctx;
// A tall window keeps the whole board on screen: a real drag must not scroll mid-way.
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); await ctx.page.setViewportSize({ width: 1280, height: 3600 }); });
test.afterAll(async () => { await closeCtx(ctx); });
for (let i = 0; i < 100; i++) {
  const opts = { ...variety(i + 11), live: LIVES[i % 5], ...(i % 4 === 0 ? { regulars: 26, declineRate: 0, absentRate: 0 } : {}) };
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
    const under = [1, 2, 3, 4, 5, 6].filter((c) => (a[c] || []).length===1||(a[c]||[]).length>5);
    if (under.length) await expect(ui.locator(".alert-error")).toHaveText(`⚠️ Court${under.length > 1 ? "s" : ""} ${under.map((c) => "C" + c).join(", ")} ${under.length > 1 ? "are" : "is"} invalid — a court needs zero or 2–5 players. Use Adjust courts to review the changes.`);
    else await expect(ui.locator(".alert-error")).toHaveCount(0);
    const seated = new Set(Object.values(a).flat()), un = L.players.filter((p) => !seated.has(p.id));
    const zone0 = ui.locator(".dnd-court[data-court='0']");
    await expect(zone0).toHaveCount(un.length ? 1 : 0);
    if (un.length) expect(await zone0.locator(".dnd-player").evaluateAll(es=>es.map(e=>e.childNodes[0].textContent)), "unassigned").toEqual(un.map((p) => p.name));
    for (let c = 1; c <= NC; c++) {
      const blk = ui.locator(`.dnd-court[data-court='${c}']`), ids = a[c] || [], n = ids.length;
      await expect(blk.locator(".dnd-court-title")).toHaveText(`COURT ${c}`);
      await expect(blk.locator(".dnd-court-cnt")).toHaveText(`${n} players — ${n===0?"empty":n===1||n>5?"invalid":n===2?"singles best of 3":n===3?"singles":n===5?"rotating doubles":"doubles"}`);
      expect(await blk.locator(".dnd-player").evaluateAll(es=>es.map(e=>e.childNodes[0].textContent+(e.querySelector(".spare-badge")?.textContent||""))), `Court ${c}`).toEqual(ids.map((id) => name(id).name + (name(id).membership_type === "spare" ? "S" : "")));
      await expect(blk.locator(".dnd-empty")).toHaveCount(0);
    }
    const pool = [...seated, ...(r() < 0.3 ? un.map((p) => p.id) : [])];
    if (!pool.length) return;
    const pid = pool[Math.floor(r() * pool.length)], from = [1, 2, 3, 4, 5, 6].find((c) => (a[c] || []).includes(pid)) || 0;
    const targets = [0, 1, 2, 3, 4, 5, 6].filter((t) => t !== from && (t > 0 || un.length > 0));
    const t = targets[Math.floor(r() * targets.length)], cap = 5;   // any court takes a fifth player
    await ui.locator(`.dnd-player[data-pid='${pid}']`).dragTo(ui.locator(`.dnd-court[data-court='${t}'] .dnd-court-hdr`),{sourcePosition:{x:10,y:10}});
    const want=manualMoveExpected(L,pid,t);
    if(want.message)await expect(toast).toContainText(want.message);
    await expect.poll(()=>kv().assignments).toEqual(want.lineup);
    expect(await page.evaluate(()=>S.current.assignments)).toEqual(want.lineup);
    // Every saved court is legal and no scored court changes; the independent model also verifies any required neighbouring move.
  });
}
