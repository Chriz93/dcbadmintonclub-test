// Admin → Players: court distribution, the sync-to-last-session banner, active and unassigned lists, moving a player or
// benching them, marking absent, removing, calling in, adding (new, duplicate, blank, registered, capacity) and
// re-sorting. With and without a session running. 100 leagues.
import { test, expect } from "@playwright/test";
import { openAs, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, NC } from "./gen";
import { courtOf } from "./oracle";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await ctx?.page.close(); });
for (let i = 0; i < 100; i++) {
  const opts = { ...variety(i + 9), ...(i % 2 ? { live: "none" as const } : {}), ...(i % 10 === 5 ? { regulars: 25 } : {}) };
  test(`Players ${String(i + 1).padStart(3, "0")} · ${genLeague(19000 + i, opts).title}`, async () => {
    const L = genLeague(19000 + i, { ...opts, dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page, r = rng(90 + i), toast = page.locator("#_t"), P = L.players, cur = L.current;
    const kv = (k: string) => { const v = ctx.state.state[k]; return v && v.value !== "null" ? JSON.parse(v.value) : null; };
    const db = (id: number) => ctx.state.players.find((p) => p.id === id);
    await page.evaluate(() => nav("admin"));
    await page.getByRole("button", { name: "👥 Players" }).click();
    const list = page.locator("#a-pl-list");
    if (!P.length) { await expect(list).toContainText("No players yet"); return; }
    const counts = [1, 2, 3, 4, 5, 6].map((c) => P.filter((p) => p.current_court === c).length);
    expect(await page.locator("#a-pl-court-summary div[style*='repeat(6,1fr)'] > div").evaluateAll((ds) => ds.map((d) => [...d.children].map((x) => x.textContent))), "court distribution")
      .toEqual(counts.map((n, k) => [`C${k + 1}`, String(n), `${n}/${Math.max(4, n)}`]));
    let mism = 0;
    if (!cur && L.sessions.length) { const fa = L.sessions.at(-1)!.finalAssignments!; for (let c = 1; c <= NC; c++) for (const id of fa[c] || []) { const p = P.find((x) => x.id === id); if (p && p.current_court !== c) mism++; } }
    await expect(page.locator("#a-pl-court-summary .alert"), "sync banner when courts differ from the last final standings").toHaveCount(mism ? 1 : 0);
    if (mism) await expect(page.locator("#a-pl-court-summary .alert")).toContainText(`${mism} player${mism > 1 ? "s" : ""} need updating`);
    const regs = P.filter((p) => p.membership_type !== "spare").length, active = P.filter((p) => p.current_court > 0).sort((a, b) => a.current_court - b.current_court), bench = P.filter((p) => !p.current_court);
    await expect(list.locator(".card-title").first()).toHaveText(`Active Players — ${active.length} on Courts (${regs} Regular · ${P.length - regs} Spare)${bench.length ? ` · ${bench.length} Unassigned` : ""}`);
    const rows = list.locator(".card > div:has(> .pl-num)");
    await expect(rows).toHaveCount(active.length);
    for (let k = 0; k < active.length; k++) {
      const p = active[k], info = rows.nth(k).locator("> div").nth(1).locator("> div"), absent = cur?.attendance?.[p.id] === "absent";
      expect(norm((await info.first().textContent()) || ""), `row ${k + 1}`).toBe(`${p.name}${p.membership_type === "spare" ? "SPARE" : ""}${absent ? "ABSENT" : ""}`);
      expect(norm((await info.nth(1).textContent()) || "")).toBe(`${p.email || "—"} · C${p.current_court} · ${p.season_wins}W ${p.season_losses}L · Absent:${p.no_show_count}`);
      await expect(rows.nth(k).locator("select")).toHaveValue(String(p.current_court));
    }
    const benchRows = list.locator(".card > div:has(> button:has-text('📲 Call In'))");
    expect((await benchRows.locator("> div:first-child > div:first-child").allTextContents()).map(norm), "spare pool / unassigned").toEqual(bench.map((p) => p.name + (p.membership_type === "spare" ? "SPARE" : "")));

    const act = i % 7, k = Math.floor(r() * Math.max(1, active.length)), p = active[k];
    if ((act === 0 || act === 1) && p) {
      const c = act === 1 ? 0 : (p.current_court % NC) + 1;
      await rows.nth(k).locator("select").selectOption(String(c));
      await expect.poll(() => db(p.id)!.current_court, { message: `${p.name} → ${c || "bench"}` }).toBe(c);
      if (cur) { const a = kv("current_session").assignments; expect(courtOf(a, p.id), "session lineup follows").toBe(c); if (c) expect(a[c].at(-1)).toBe(p.id); }
    } else if (act === 2 && p) {
      await rows.nth(k).getByRole("button", { name: "🚫" }).click();
      if (!cur) {
        await expect(toast).toHaveText("No session is running. For next Tuesday, set their vote to “not coming” in Standings → RSVP.");
        expect(db(p.id)!.current_court, "nothing changes between sessions").toBe(p.current_court);
        return;
      }
      await expect(toast).toHaveText(`${p.name} marked absent — off Court ${p.current_court} tonight, one court down next week`);
      const cs = kv("current_session");
      expect({ att: cs.attendance[p.id], from: cs.absentFrom[p.id], seated: courtOf(cs.assignments, p.id) }).toEqual({ att: "absent", from: p.current_court, seated: 0 });
    } else if (act === 3 && p) {
      await rows.nth(k).getByRole("button", { name: "✕" }).click();
      await expect.poll(() => !!db(p.id), { message: `${p.name} removed` }).toBe(false);
      await expect.poll(() => kv("player_approvals")?.[p.id], { message: "approval entry cleaned up" }).toBeUndefined();
      if (cur) expect(courtOf(kv("current_session").assignments, p.id)).toBe(0);
    } else if (act === 4 && bench.length) {
      const u = bench[Math.floor(r() * bench.length)], j = bench.indexOf(u);
      let t = NC;
      if (cur) { const a = Object.fromEntries(Object.entries(cur.assignments).map(([c, ids]) => [c, ids.filter((x) => x !== u.id)])); for (let c = NC; c >= 1; c--) if ((a[c] || []).length < 4) { t = c; break; } }
      await benchRows.nth(j).getByRole("button", { name: "📲 Call In" }).click();
      await expect(toast).toHaveText(`${u.name} called in → Court ${t}`);
      expect(db(u.id)!.current_court).toBe(t);
      if (cur) { const cs = kv("current_session"); expect(cs.assignments[t].at(-1)).toBe(u.id); expect(cs.attendance[u.id]).toBe("present"); }
    } else if (act === 5) {
      const kind = i % 20 === 5 ? "regular" : r() < 0.5 ? "regular" : "spare", c = Math.floor(r() * 7);
      const pick = r(), existing = active[0], registered = bench.find((x) => x.name);
      const name = pick < 0.15 ? "" : pick < 0.3 && existing ? existing.name.toUpperCase() : pick < 0.45 && registered ? registered.name : `Newcomer ${i + 1}`;
      await page.locator("#np-name").fill(name);
      await page.locator("#np-membership").selectOption(kind);
      await page.locator("#np-court").selectOption(String(c));
      await page.getByRole("button", { name: "+ Add Player" }).click();
      const taken = P.filter((x) => x.membership_type !== "spare" && !x.waitlisted && x.approved && x.sig !== "admin" && String(x.registered_at) >= "2026-09-01").length;
      if (!name) { await expect(toast).toHaveText("Enter a name"); return; }
      if (kind === "regular" && taken >= 25) { await expect(toast).toHaveText("Regular slots full (25/25). Please choose Spare."); return; }
      if (registered && name === registered.name) {
        await expect(toast).toHaveText(`${registered.name} activated from registration → Court ${c}`);
        expect(db(registered.id)!.current_court).toBe(c);
        return;
      }
      if (existing && name === existing.name.toUpperCase()) { await expect(toast).toHaveText("Player already active on a court"); return; }
      await expect(toast).toHaveText(`${name} added as ${kind}!`);
      const row = ctx.state.players.find((x) => x.name === name)!;
      expect({ sig: row.sig, court: row.current_court }).toEqual({ sig: "admin", court: c });
      expect(kv("player_approvals")[row.id]).toEqual({ approved: true, waitlisted: false, membershipType: kind });
      if (cur && c > 0) expect(kv("current_session").assignments[c]).toContain(row.id);
      await expect(page.locator("#np-name")).toHaveValue("");
    } else if (act === 6) {
      await page.locator("#a-pl-court-summary").getByRole("button", { name: /Re-sort/ }).click();
      await expect(toast).toHaveText(`Courts re-sorted — ${active.length} players across ${Math.ceil(active.length / 4)} courts`);
      active.forEach((x, n) => expect(db(x.id)!.current_court, `${x.name} after re-sort`).toBe(Math.min(Math.floor(n / 4) + 1, NC)));
      if (cur) { const a = kv("current_session").assignments; active.forEach((x, n) => expect(courtOf(a, x.id)).toBe(Math.min(Math.floor(n / 4) + 1, NC))); }
    }
  });
}
