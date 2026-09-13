// Admin → Attendance → Adjust courts, end to end through the page: Present / Late / Absent toggles and "Here after all",
// the waiting-changes bar, the preview (every explanation line), a changed move, an unavailable court, Apply, the
// stored courts, the last-adjustment card and Undo. Every expectation comes from the independent reference model
// (legacy/tests/unit/adjust-reference.mjs) applied to the stored session, never from the app itself.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, type GenOpts, type LiveState } from "./gen";
import { courtOf } from "./oracle";
import { adjustInput, changes, sorted, explanation, validLineup, type RefResult } from "./adjust-oracle";
import { reference } from "../../unit/adjust-reference.mjs";

type Ref = RefResult & { moves: { id: number; from: number; to: number; reason?: string }[] };
const run = (inp: ReturnType<typeof adjustInput>) => reference(inp) as Ref;

/** The desktop and phone spec files both call this, each on its own leagues. */
export function define(first: number, count: number, phone = false) {
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
  test.afterAll(async () => { await closeCtx(ctx); });
  const LIVES: LiveState[] = ["r1-partial", "r2-partial", "r1-done", "r1-partial", "none", "complete", "r2-partial", "r1-done"];
  for (let k = 0; k < count; k++) {
    const i = first + k, live = LIVES[i % LIVES.length];
    const opts: GenOpts = { ...variety(i + 7), live, absentRate: 0.3, declineRate: 0.15, ...(i % 11 === 5 ? { regulars: 26, spares: 3 } : {}), ...(i % 13 === 6 ? { regulars: 7 } : {}) };
    test(`Adjust ${phone ? "phone " : ""}${String(k + 1).padStart(3, "0")} · ${live} · ${genLeague(45000 + i, opts).title}`, async () => {
      const L = genLeague(45000 + i, { ...opts, dates: ctx.dates });
      await load(ctx, L);
      const page = ctx.page, r = rng(4500 + i), toast = page.locator("#_t");
      const kv = () => JSON.parse(ctx.state.state["current_session"]?.value ?? "null");
      const ver = () => ctx.state.state["current_session"]?.version ?? 0;
      const nm = (id: number) => L.players.find((p) => p.id === id)?.name ?? "Player";
      await page.evaluate(() => nav("admin"));
      await page.getByRole("button", { name: "📋 Attendance" }).click();
      const sec = page.locator("#sec-a-att"), bar = sec.locator("#adj-bar"), cur = L.current;
      if (!cur) {
        await expect(bar).toContainText("Courts are set when the session starts: present players sit by their earned court.");
        await expect(sec.locator(`button[onclick*="'late'"]`), "no Late toggle before the session").toHaveCount(0);
        await expect(bar.locator("#adj-btn")).toHaveCount(0);
        return;
      }
      if (cur.completed) {
        await expect(bar).toHaveText("Both rounds are finished — nothing left to adjust.");
        await expect(sec.locator(`button[onclick*="'late'"]`)).toHaveCount(0);
        return;
      }
      if (phone) {
        // Thumb-sized toggles and a bar that stays in view while the list scrolls.
        const box = await sec.locator("button.att-tg").first().boundingBox();
        expect(box!.height, "toggle height on a phone").toBeGreaterThanOrEqual(44);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        const b = await bar.boundingBox(), vh = page.viewportSize()!.height;
        expect(b && b.y >= 0 && b.y < vh / 2, "Adjust bar still visible near the top after scrolling").toBe(true);
        const header = (await page.locator('.nav').boundingBox())!;
        expect(b!.y, 'the fixed header does not cover the adjustment controls').toBeGreaterThanOrEqual(header.y + header.height);
      }
      // The round offered is the one about to be played; later rounds are set by this one's results.
      await expect(bar.locator("#adj-round option")).toHaveText([`Round ${cur.cycle} — next to play`]);
      const r0 = run(adjustInput(kv())), n0 = changes(r0);
      await expect(bar.locator("#adj-sum")).toContainText(!r0.ok ? "⚠️" : n0 ? `${n0} court change${n0 === 1 ? "" : "s"} waiting for Round ${cur.cycle}` : `✓ Courts match attendance for Round ${cur.cycle}`);
      // A few players get a status; each toggle saves at once and the toast says whether courts are waiting to change.
      const picks = [...Object.values(cur.assignments).flat()].sort(() => r() - 0.5).slice(0, 1 + Math.floor(r() * 4));
      for (const id of picks) {
        const before = kv(), c = courtOf(before.assignments, id); if (!c) continue;
        const st = (["absent", "late", "present", "absent"] as const)[Math.floor(r() * 4)], first = nm(id).split(" ")[0];
        const alreadyLate = st === "late" && (before.latePlayers || []).some((l: { playerId: number; pending?: boolean; round?: number }) => l.playerId === id && (l.pending || l.round === before.cycle));
        const v0 = ver();
        await sec.locator(`button[onclick="markAttForTab(${id},'${st}',${c})"]`).click();
        if (alreadyLate) { await expect(toast).toHaveText(`${first} is already marked late this round`); continue; }
        await expect.poll(ver, { message: "saved" }).toBeGreaterThan(v0);
        const after = kv(), tail = changes(run(adjustInput(after))) ? " — press Adjust courts to update the courts" : "";
        await expect(toast).toHaveText(st === "absent" ? `${first} marked absent${tail}. One court down next week.` : st === "late" ? `${first} marked late${tail}` : `${first} confirmed present${tail}`);
        expect(after.attendance[id], "late counts as present").toBe(st === "absent" ? "absent" : "present");
        if (st === "absent") expect(after.absentFrom[id]).toBe(c);
        const pending = (after.latePlayers || []).filter((l: { playerId: number; pending?: boolean }) => l.playerId === id && l.pending);
        expect(pending.length, "a waiting late move exists only after Late").toBe(st === "late" ? 1 : 0);
        if (st === "late") expect(pending[0]).toMatchObject({ originalCourt: c, round: cur.cycle });
        await expect(sec.locator(`button[onclick="markAttForTab(${id},'${st}',${c})"]`)).toHaveAttribute("aria-pressed", "true");
      }
      // Someone taken off earlier turns up after all.
      const outRows = sec.locator("#att-out button");
      if (i % 4 === 1 && (await outRows.count())) {
        const btn = outRows.first(), id = +((await btn.getAttribute("onclick"))!.match(/markAttForTab\((\d+)/)![1]), v0 = ver();
        await btn.click();
        await expect.poll(ver).toBeGreaterThan(v0);
        const tail = changes(run(adjustInput(kv()))) ? " — press Adjust courts to update the courts" : "";
        await expect(toast).toHaveText(`${nm(id).split(" ")[0]} confirmed present${tail}`);
      }
      // One click: the preview.
      const st = kv(), inp = adjustInput(st), ref = run(inp), n = changes(ref), lines = explanation(inp, ref, nm);
      await sec.locator("#adj-btn").click();
      if (ref.ok && !n && !lines.length) { await expect(toast).toHaveText("Courts already match attendance — nothing to change"); await expect(page.locator("#modal.open")).toHaveCount(0); return; }
      const modal = page.locator("#modal.open");
      await expect(modal.locator("#modal-title")).toHaveText(`Adjust courts — Round ${cur.cycle}`);
      if (!ref.ok) {
        await expect(modal.locator("#adj-explain .alert-error"), "the reason nothing can change").toBeVisible();
        await expect(modal.locator("#adj-apply")).toBeDisabled();
        await page.evaluate(() => closeModal());
        expect(kv().assignments, "a refusal changes nothing").toEqual(st.assignments);
        return;
      }
      expect((await modal.locator("#adj-explain li").allInnerTexts()).map(norm), "the explanation, line by line").toEqual(lines);
      let applied: Ref = ref, want = lines, closed: number[] = [];
      if (i % 9 === 4) {
        const c = [1, 2, 3, 4, 5, 6].filter((x) => !inp.locked.includes(x))[Math.floor(r() * (6 - inp.locked.length))];
        if (c) {
          if (!(await modal.locator(".adj-closed").getAttribute("open") !== null)) await modal.locator(".adj-closed summary").click();
          await modal.locator(`#adj-closed-${c}`).check();
          const inp2 = { ...inp, closed: [c] }; applied = run(inp2); closed = [c];
          if (!applied.ok) { await expect(modal.locator("#adj-explain .alert-error")).toBeVisible(); await expect(modal.locator("#adj-apply")).toBeDisabled(); await page.evaluate(() => closeModal()); expect(kv().assignments).toEqual(st.assignments); return; }
          want = explanation(inp2, applied, nm);
          expect((await modal.locator("#adj-explain li").allInnerTexts()).map(norm), "the explanation with the court unavailable").toEqual(want);
        }
      } else if (i % 7 === 3 && ref.moves.length) {
        const m = ref.moves[0];
        const alt = [1, 2, 3, 4, 5, 6].find((c) => {
          if (c === m.to || c === m.from || inp.locked.includes(c) || inp.closed.includes(c)) return false;
          const Lx: Record<string, number[]> = Object.fromEntries(Object.entries(ref.lineup).map(([k, v]) => [k, [...v]]));
          Lx[m.to] = Lx[m.to].filter((x) => x !== m.id); Lx[c] = [...Lx[c], m.id]; return validLineup(Lx, inp);
        });
        if (alt) {
          await modal.locator(`select.adj-ov[data-id="${m.id}"]`).selectOption(String(alt));
          const Lx: Record<string, number[]> = Object.fromEntries(Object.entries(ref.lineup).map(([k2, v]) => [k2, [...v]]));
          Lx[m.to] = Lx[m.to].filter((x) => x !== m.id); Lx[alt] = [...Lx[alt], m.id];
          applied = { ...ref, lineup: Lx, moves: ref.moves.map((x) => (x === m ? { ...x, to: alt } : x)) };
          want = explanation(inp, applied, nm);
          expect((await modal.locator("#adj-explain li").allInnerTexts()).map(norm), "the explanation after changing a move").toEqual(want);
        }
      }
      const apply = modal.locator("#adj-apply");
      const nApplied = changes(applied);
      // Apply saves something when a court changes, a waiting late arrival is settled (moved, or recorded as staying), or
      // the unavailable courts change (p46, p49); otherwise it stays disabled.
      const settles = inp.late.some((id) => applied.skippedLate.some((x) => x.id === id));
      const closedChanged = [...closed].sort().join() !== [...(st.closedCourts || [])].sort().join();
      if (!nApplied && !settles && !closedChanged) { await expect(apply).toBeDisabled(); await page.evaluate(() => closeModal()); return; }
      await apply.click();
      await expect(toast).toHaveText(nApplied ? `Courts adjusted for Round ${cur.cycle} — ${nApplied} change${nApplied === 1 ? "" : "s"}. Undo is on the Attendance tab.` : `Recorded for Round ${cur.cycle} — no court changes. Undo is on the Attendance tab.`);
      const after = kv();
      expect(sorted(after.assignments), "courts as the rules say, and nobody else moved").toEqual(sorted(applied.lineup));
      for (let c = 1; c <= 6; c++) if (!applied.moves.some((m) => m.from === c || m.to === c) && !applied.removed.some((x) => x.from === c) && !applied.seated.some((x) => x.to === c))
        expect(after.assignments[c] || [], `untouched Court ${c} keeps its order`).toEqual(st.assignments[c] || []);
      expect(after.closedCourts || [], "unavailable courts remembered").toEqual(closed);
      for (const id of inp.late) expect((after.latePlayers || []).find((l: { playerId: number; pending?: boolean }) => l.playerId === id && l.pending), `late move for ${nm(id)} settled`).toBeUndefined();
      for (const s2 of applied.seated) expect(after.absentFrom?.[s2.id], "back: no demotion next week").toBeUndefined();
      expect(after.adjustments.at(-1)).toMatchObject({ round: cur.cycle, lines: want });
      await expect(sec.locator("#adj-last li")).toHaveText(want);
      await expect(sec.locator("#adj-undo")).toBeVisible();
      await expect(bar.locator("#adj-sum")).toContainText(`✓ Courts match attendance for Round ${cur.cycle}`);
      if (i % 5 === 2) {
        await sec.locator("#adj-undo").click();
        await expect(toast).toHaveText(`Undone: Adjust courts (Round ${cur.cycle})`);
        expect(kv().assignments, "Undo puts every court back").toEqual(st.assignments);
      }
    });
  }
}
