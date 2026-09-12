// Organizer evenings as sequences: absences, "Here after all", late arrivals, Adjust courts and Undo in a random order,
// 5 to 8 steps each, on a running round with some courts already scored. After every step the stored session is checked:
// a toggle only records attendance (nobody moves until Adjust courts); Adjust courts gives exactly the courts of the
// independent reference model (legacy/tests/unit/adjust-reference.mjs); a late player who has to stay is recorded as
// staying, not left waiting to move later; Undo goes back exactly one step however the steps were interleaved; courts
// with scores never change; nobody is on two courts. 100 evenings.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, rng, type GenOpts } from "./gen";
import { kvOf } from "./checks";
import { courtOf } from "./oracle";
import { adjustInput, changes, sorted, lockedCourts, validLineup, type RefResult } from "./adjust-oracle";
import { reference } from "../../unit/adjust-reference.mjs";

type Late = { playerId: number; pending?: boolean; round?: number; to?: number; stayed?: string };
type Ref = RefResult & { moves: { id: number; from: number; to: number; reason?: string }[] };
/** What Undo must bring back exactly: courts, attendance, where absent players came from, and late arrivals. */
const view = (cs: { assignments: Record<string, number[]>; attendance?: object; absentFrom?: object; latePlayers?: Late[] }) =>
  JSON.stringify({ courts: sorted(cs.assignments), attendance: cs.attendance || {}, from: cs.absentFrom || {}, late: (cs.latePlayers || []).map((l) => [l.playerId, !!l.pending, l.round ?? null, l.to ?? null]) });

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

for (let i = 0; i < 100; i++) {
  const live = i % 2 ? "r2-partial" : "r1-partial";
  const opts: GenOpts = { ...variety(i + 900), regulars: 10 + (i % 15), spares: 0, pending: 0, live, absentRate: 0, declineRate: 0.1 };
  test(`Evening ${String(i + 1).padStart(3, "0")} · ${live} · ${genLeague(64000 + i, opts).title}`, async () => {
    const L = genLeague(64000 + i, { ...opts, dates: ctx.dates }), cur = L.current!, r = rng(6400 + i);
    // About half the courts have no score yet this round, so there is something to adjust.
    for (let c = 1; c <= 6; c++) if (r() < 0.6) for (const k of Object.keys(cur.scores)) if (k.startsWith(`c${c}_y${cur.cycle}_`)) delete cur.scores[k];
    await load(ctx, L);
    const page = ctx.page, toast = page.locator("#_t"), modal = page.locator("#modal.open"), kv = () => kvOf(ctx, "current_session");
    await page.evaluate(() => { nav("admin"); showSec("admin", "a-att"); });
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    const undo: string[] = [], done: string[] = [];
    const steps = 5 + Math.floor(r() * 4);
    for (let s = 0; s < steps; s++) {
      const before = kv(), seated = Object.values(before.assignments).flat() as number[];
      const off = Object.entries(before.attendance || {}).filter(([id, v]) => v === "absent" && !seated.includes(+id) && (before.absentFrom || {})[id]).map(([id]) => +id);
      const lateNow = new Set((before.latePlayers || []).filter((l: Late) => l.pending || l.round === before.cycle).map((l: Late) => l.playerId));
      const here = seated.filter((id) => (before.attendance || {})[id] !== "absent");
      let kind = pick(["absent", "absent", "present", "late", "adjust", "adjust", "undo"]);
      if (kind === "present" && !off.length) kind = "absent";
      if (kind === "late" && !here.some((id) => !lateNow.has(id))) kind = "adjust";
      if (kind === "absent" && !here.length) kind = "adjust";
      if (kind === "undo" && !undo.length) kind = "adjust";
      const step = `step ${s + 1} (${[...done, kind].join(" → ")})`;
      if (kind === "absent" || kind === "present" || kind === "late") {
        const id = kind === "present" ? pick(off) : pick(kind === "late" ? here.filter((x) => !lateNow.has(x)) : here), c = courtOf(before.assignments, id);
        await page.evaluate(([x, st]) => markAttForTab(x as number, st as string), [id, kind]);
        const after = kv();
        expect(sorted(after.assignments), `${step}: a toggle only records attendance`).toEqual(sorted(before.assignments));
        expect(after.attendance[id], step).toBe(kind === "absent" ? "absent" : "present");
        if (kind === "absent") expect(after.absentFrom[id], `${step}: where they were`).toBe(c);
        if (kind === "late") expect((after.latePlayers || []).some((l: Late) => l.playerId === id && l.pending), `${step}: waiting for Adjust courts`).toBe(true);
        undo.push(view(before)); done.push(`${kind} ${id}`); continue;
      }
      if (kind === "undo") {
        await page.evaluate(() => undoLast());
        await expect(toast).toContainText("Undone");
        expect(view(kv()), `${step}: Undo goes back exactly one step`).toBe(undo.pop());
        done.push("undo"); continue;
      }
      // Adjust courts, answered by the reference model.
      const inp = adjustInput(before), ref = reference(inp) as Ref;
      await page.evaluate(() => previewAdjust());
      if (!(await modal.count())) {
        await expect(toast).toHaveText("Courts already match attendance — nothing to change");
        expect(ref.ok && changes(ref) === 0, `${step}: nothing to change (reference model)`).toBe(true);
        done.push("adjust (nothing to change)"); continue;
      }
      if (!ref.ok) {
        await expect(modal.locator("#adj-apply"), `${step}: refused (${ref.why})`).toBeDisabled();
        await page.keyboard.press("Escape"); await expect(modal).toHaveCount(0);
        expect(view(kv()), `${step}: nothing changed`).toBe(view(before));
        done.push(`adjust refused (${ref.why})`); continue;
      }
      const n = changes(ref), settles = (before.latePlayers || []).some((l: Late) => l.pending && ref.skippedLate.some((x) => x.id === l.playerId));
      if (!n && !settles) {
        // Only notes (an absence on a court with scores): nothing to apply.
        await expect(modal.locator("#adj-apply"), `${step}: nothing to apply`).toBeDisabled();
        await page.keyboard.press("Escape"); await expect(modal).toHaveCount(0);
        expect(view(kv()), `${step}: nothing changed`).toBe(view(before));
        done.push("adjust (notes only)"); continue;
      }
      await modal.locator("#adj-apply").click();
      await expect(toast).toHaveText(n ? `Courts adjusted for Round ${before.cycle} — ${n} change${n === 1 ? "" : "s"}. Undo is on the Attendance tab.` : `Recorded for Round ${before.cycle} — no court changes. Undo is on the Attendance tab.`);
      await expect(modal).toHaveCount(0);
      const after = kv();
      expect(sorted(after.assignments), `${step}: courts (reference model)`).toEqual(sorted(ref.lineup));
      expect(validLineup(after.assignments, inp), `${step}: every open court holds none or two to five`).toBe(true);
      for (const c of lockedCourts(before)) expect([...(after.assignments[c] || [])].sort(), `${step}: Court ${c} has scores and keeps its players`).toEqual([...(before.assignments[c] || [])].sort());
      expect((after.latePlayers || []).filter((l: Late) => l.pending), `${step}: every late arrival is settled — moved, or recorded as staying`).toEqual([]);
      undo.push(view(before)); done.push(`adjust (${n})`);
      const flat = Object.values(after.assignments).flat();
      expect(new Set(flat).size, `${step}: nobody on two courts`).toBe(flat.length);
    }
  });
}
