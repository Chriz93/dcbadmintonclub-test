// Tonight's starting courts through the page (p54), before the session and at Start Session. Every view agrees:
//   * the Courts page shows the reference lineup (everyone who is coming on the court they earned, spares in open seats
//     from the bottom, courts of one or of more than five settled as at the gym), with a line for every difference from
//     the earned courts;
//   * Admin → Players still shows every regular on the court they earned;
//   * the court details and the WhatsApp message show the same players as the Courts page;
//   * Start Session seats exactly what the Courts page showed.
// Expectations come from the independent reference (legacy/tests/unit/starting-reference.mjs via the oracle), never from
// the app. The desktop and phone spec files each call define() on their own leagues.
import { test, expect, type Page } from "@playwright/test";
import { openAs, closeCtx, load, refresh, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, NC, type GenOpts } from "./gen";
import { upcoming, courtOf } from "./oracle";
import { checkCourts, kvOf, fromDb } from "./checks";
import { members } from "../rules-model";
import { offLine, spareLine, moveLine } from "../../unit/starting-reference.mjs";

const firstOf = (n: string) => n.split(" ")[0];

export function define(first: number, count: number, phone = false) {
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
  test.afterAll(async () => { await closeCtx(ctx); });
  for (let k = 0; k < count; k++) {
    const i = first + k, mode = ["ladder", "declines", "scattered", "spares", "absent"][i % 5];
    const opts: GenOpts = { ...variety(i + 81), live: "none", sessions: i % 4, regulars: 8 + (i % 19), spares: i % 5, pending: 0, absentRate: 0.2 };
    test(`Lineup ${phone ? "phone " : ""}${String(k + 1).padStart(3, "0")} · ${mode} · ${genLeague(82000 + i, opts).title}`, async () => {
      const L = genLeague(82000 + i, { ...opts, dates: ctx.dates }), r = rng(8200 + i), page = ctx.page;
      const regs = L.players.filter((p) => p.membership_type !== "spare" && p.approved && !p.waitlisted && p.current_court > 0);
      if (mode === "scattered") for (const p of regs) { p.current_court = 1 + Math.floor(r() * NC); p.highest_court = Math.min(p.highest_court || 6, p.current_court); }
      // Votes for the next session, in the order they came in.
      const next = L.upcoming, share = { declines: mode === "declines" ? 0.3 : mode === "ladder" ? 0 : 0.12 };
      L.rsvps = L.rsvps.filter((v) => v.session_number !== next);
      let t = Date.parse("2026-09-10T12:00:00Z");
      for (const p of [...L.players].sort(() => r() - 0.5)) {
        if (!p.approved) continue;
        const spare = p.membership_type === "spare", x = r();
        const response = spare ? (x < (mode === "spares" ? 0.9 : 0.5) ? "coming" : null) : x < share.declines ? "notcoming" : x < 0.97 ? "coming" : null;
        if (response) L.rsvps.push({ session_number: next, player_id: p.id, response, note: "", updated_at: new Date((t += 60000)).toISOString() });
      }
      await load(ctx, L);
      // Attendance marked before the night (absent, or present despite a "not coming" vote).
      if (mode === "absent" || mode === "declines") {
        const pre: Record<string, string> = {};
        for (const p of regs) { const x = r(); if (x < 0.1) pre[p.id] = "absent"; else if (x < 0.15 && L.rsvps.some((v) => v.session_number === next && v.player_id === p.id && v.response === "notcoming")) pre[p.id] = "present"; }
        L.pre = pre; ctx.state.state["pre_session_attendance"] = { value: JSON.stringify(pre), version: 1 };
        await refresh(ctx);
      }
      const want = upcoming(L), name = (id: number) => L.players.find((p) => p.id === id)!.name;
      if (!want.start.ok) {
        await page.evaluate(() => nav("courts"));
        await expect(page.locator("#lineup-notes .alert-error")).toBeVisible();
        return;
      }
      // 1. Courts page: the reference lineup, court by court.
      await checkCourts(page, L);
      // 2. The explanation: who is not coming, where each spare sits, who moved and why.
      const off = L.players.filter((p) => p.current_court > 0 && p.membership_type !== "spare" && (want.declined.has(p.id) || want.preAbsent.has(p.id)))
        .sort((a, b) => a.current_court - b.current_court || a.id - b.id).map((p) => offLine(p.name, p.current_court, want.preAbsent.has(p.id)));
      const lines = [...off, ...want.spares.filter((id) => want.start.spareSeat[id]).map((id) => spareLine(name(id), want.start.spareSeat[id])), ...want.start.moves.map((m: { id: number }) => moveLine(name(m.id), m, name))];
      if (lines.length) await expect(page.locator("#lineup-notes-list li")).toHaveText(lines);
      else await expect(page.locator("#lineup-notes")).toBeEmpty();
      if (phone && lines.length) { const b = (await page.locator("#lineup-notes .card").boundingBox())!; expect(b.x + b.width, "the explanation fits the screen").toBeLessThanOrEqual(page.viewportSize()!.width + 1); }
      // 3. Admin → Players still shows each regular on the court they earned.
      await page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); });
      for (const p of regs.slice(0, 6)) {
        const sel = page.locator(`#sec-a-pl select[aria-label="Court for ${p.name}"]`).first();
        if (await sel.count()) await expect(sel, `Players tab: ${p.name}`).toHaveValue(String(p.current_court));
      }
      // 4. Court details and the WhatsApp message show the same players.
      await page.evaluate(() => nav("courts"));
      const c = 1 + Math.floor(r() * NC);
      await page.evaluate((x) => showCourtDetail(x), c);
      const detail = norm(await page.locator("#modal.open #modal-body").innerText());
      for (const id of want.assign[c]) expect(detail, `Court ${c} details: ${name(id)}`).toContain(name(id));
      await page.keyboard.press("Escape");
      await page.evaluate(() => { (window as unknown as { __open: string[] }).__open = []; window.open = ((u: string) => { (window as unknown as { __open: string[] }).__open.push(u); return null; }) as typeof window.open; shareCourtAssignments(); });
      const msg = decodeURIComponent(((await page.evaluate(() => (window as unknown as { __open: string[] }).__open))[0] || "").replace("https://wa.me/?text=", ""));
      for (let x = 1; x <= NC; x++) {
        const part = msg.split(`*Court ${x}*`)[1]?.split("*Court ")[0] ?? "";
        const shown = want.assign[x].length ? want.assign[x].map(name) : ["Empty"];
        for (const n of shown) expect(part, `WhatsApp Court ${x}: ${n}`).toContain(`• ${n}`);
        for (const id of [...want.declined, ...want.preAbsent]) expect(part, `WhatsApp Court ${x}: ${name(id)} is not coming`).not.toContain(`• ${name(id)}\n`);
      }
      // 5. Start Session seats exactly what the Courts page showed.
      await page.evaluate(() => startSession());
      await expect.poll(() => kvOf(ctx, "current_session")?.number ?? null, { message: "session started" }).toBe(next);
      const cs = kvOf(ctx, "current_session");
      expect(members(cs.assignments), "Start Session = the Courts page").toEqual(members(want.assign));
      for (const p of regs) if (!want.declined.has(p.id) && !want.preAbsent.has(p.id) && !want.start.moves.some((m: { id: number }) => m.id === p.id))
        expect(courtOf(cs.assignments, p.id), `${p.name} starts on the court they earned`).toBe(p.current_court);
      await checkCourts(page, fromDb(ctx, L));
    });
  }
}
