// A background refresh never undoes a save on screen, for table saves too (p58). The stand-in holds one read of a table:
// its reply is fixed when the refresh asks (the old rows) and delivered only after the save and the save's own reload.
// Found by Admin extras 061: a saved private note vanished from the Players row until the next refresh. Each case fails
// on the page without p58 (the late, older reply replaces the saved rows); with p59 the overtaken load is repeated.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety } from "./gen";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

/** Hold the next read of `table`; returns when the refresh has asked for it, plus a release function. */
function hold(table: "players" | "payments") {
  let release!: () => void, served!: () => void;
  const until = new Promise<void>((r) => (release = r)), asked = new Promise<void>((r) => (served = r));
  ctx.state.holdTable = { table, until, served };
  return { asked, release };
}
/** A background refresh like the 20-second sync: load, and draw only a complete, current load. */
const backgroundRefresh = () => ctx.page.evaluate(() => loadAll().then((r) => { if (r === true) renderAll(); return r; }));

for (const [i, live] of [[0, "none"], [1, "r1-partial"]] as const) {
  test(`Sync race (tables) · private note · ${live === "none" ? "before a session" : "during a session"}`, async () => {
    const L = genLeague(48000 + i, { ...variety(48000 + i), regulars: 12, spares: 1, pending: 0, live, sessions: 2 });
    await load(ctx, L);
    const page = ctx.page, active = L.players.filter((p) => p.current_court > 0).sort((a, b) => a.current_court - b.current_court);
    const k = 3, p = active[k], text = `Race note ${i + 1}`;
    await page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); });
    const row = page.locator("#a-pl-list .card > div:has(> .pl-num)").nth(k);
    const h = hold("players"), bg = backgroundRefresh();
    await h.asked;                                         // the refresh has the old player list, still in flight
    await row.locator(".notes-btn").click();
    await page.locator("#admin-note-text").fill(text);
    await page.getByRole("button", { name: "💾 Save Note" }).click();
    await expect(page.locator("#_t")).toHaveText("Note saved!");
    await expect(row.locator(".notes-btn")).toHaveText("📝");
    h.release();
    expect(await bg, "the overtaken refresh is repeated (p59), never drawn from the old rows").toBe(true);
    await expect(row.locator(".notes-btn"), "the note is still shown after the late refresh").toHaveText("📝");
    expect(await page.evaluate((id) => S.players.find((x: { id: number }) => x.id === id)?.adminNote, p.id)).toBe(text);
  });
}

test("Sync race (tables) · a recorded payment stays on screen", async () => {
  const L = genLeague(48010, { ...variety(48010), regulars: 10, spares: 0, pending: 0, live: "none", sessions: 1 });
  await load(ctx, L);
  const page = ctx.page, who = L.players.find((p) => p.membership_type !== "spare")!;
  const before = await page.evaluate(() => S.payments.length);
  const h = hold("payments"), bg = backgroundRefresh();
  await h.asked;
  await page.evaluate((id) => rpc("record_payment", { p_player: id, p_kind: "season", p_amount: 50, p_session: null, p_received_on: "2026-09-13", p_note: "race test", p_request: crypto.randomUUID() }).then(() => loadAll()).then(() => renderAll()), who.id);
  expect(await page.evaluate(() => S.payments.length)).toBe(before + 1);
  h.release();
  expect(await bg, "the overtaken refresh is repeated (p59), never drawn from the old rows").toBe(true);
  expect(await page.evaluate(() => S.payments.length), "the payment is still shown").toBe(before + 1);
});
