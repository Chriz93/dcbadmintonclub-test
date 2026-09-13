// The Tuesday-night path: the last court's scores are saved — game by game or with "Save All Court N Scores" — and the
// round advances by itself (or, after round 2, the session is ready to end). Then the Undo label, the score screen and
// every read-only tab are checked against the database. 100 leagues.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, refresh, type Ctx } from "./harness";
import { genLeague, variety, rng, combos, target, NC, type GenOpts, type League } from "./gen";
import { courtOf } from "./oracle";
import { fromDb, kvOf, checkAllTabs } from "./checks";

/** Complete every court of the current round except one, and clear that one: saving it finishes the round. */
function allButOne(L: League, r: () => number) {
  const cur = L.current!, cy = cur.cycle;
  const courts = [1, 2, 3, 4, 5, 6].filter((c) => (cur.assignments[c] || []).length >= 2);
  const last = courts[Math.floor(r() * courts.length)];
  for (const c of courts) {
    const ids = cur.assignments[c], T = target(ids.length);
    combos(ids).forEach((g, k) => {
      const key = `c${c}_y${cy}_g${k + 1}`;
      if (c === last) { delete cur.scores[key]; return; }
      if (ids.length === 2 && k === 2) { const s1 = cur.scores[`c${c}_y${cy}_g1`], s2 = cur.scores[`c${c}_y${cy}_g2`]; if (s1 && s2 && s1.w === s2.w) { delete cur.scores[key]; return; } }   // best of three
      if (!cur.scores[key]) { const lo = Math.floor(r() * (T - 1)), aWins = r() < 0.5; cur.scores[key] = { ...g, sA: aWins ? T : lo, sB: aWins ? lo : T, w: aWins ? "A" : "B" }; }
    });
  }
  return { last, cy };
}

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
for (let i = 0; i < 100; i++) {
  const base = variety(i + 21);
  const opts: GenOpts = { ...base, regulars: Math.max(6, base.regulars ?? 6), live: i % 2 ? "r2-partial" : "r1-partial", ...(i % 5 === 0 ? { regulars: 26, declineRate: 0, absentRate: 0 } : {}) };
  const saveAll = i % 3 !== 0;
  test(`Round complete ${String(i + 1).padStart(3, "0")} · ${saveAll ? "Save All" : "game by game"} · ${genLeague(31000 + i, opts).title}`, async () => {
    const L = genLeague(31000 + i, { ...opts, dates: ctx.dates });
    const r = rng(1200 + i), { last, cy } = allButOne(L, r);
    await load(ctx, L);
    const page = ctx.page, final = cy >= 2, ids = L.current!.assignments[last], T = target(ids.length), games = combos(ids);
    const before = Object.values(L.current!.assignments).flat().sort((a, b) => a - b);
    await page.evaluate(() => nav("scores"));
    await expect(page.locator("#advance-banner"), "round not complete yet").toHaveText("");
    await page.locator("#sc-sel").selectOption(String(last));
    // The games still to play: all of them, except that a court of two stops after a 2–0 (best of three).
    const plan: [number, number][] = [];
    for (let g = 1; g <= games.length; g++) {
      if (ids.length === 2 && g === 3 && (plan[0][0] > plan[0][1]) === (plan[1][0] > plan[1][1])) break;
      const lo = Math.floor(r() * (T - 1)), aWins = r() < 0.5; plan.push(aWins ? [T, lo] : [lo, T]);
    }
    for (let g = 1; g <= plan.length; g++) {
      await page.locator(`#si_${last}_${g}_a`).fill(String(plan[g - 1][0]));
      await page.locator(`#si_${last}_${g}_b`).fill(String(plan[g - 1][1]));
      if (!saveAll) {
        await page.locator(".game-block").nth(g - 1).getByRole("button", { name: `💾 Save Game ${g}` }).click();
        if (g < plan.length) await expect(page.locator("#_t")).toHaveText(`Game ${g} saved!`);
      }
    }
    if (saveAll) await page.getByRole("button", { name: `💾 Save All Court ${last} Scores` }).click();
    // The completing save advances the round by itself.
    await expect.poll(() => { const cs = kvOf(ctx, "current_session"); return final ? cs.completed === true : cs.cycle; }, { message: "round advanced by itself", timeout: 20000 }).toBe(final ? true : cy + 1);
    await expect(page.locator("#undo-label")).toContainText(final ? `Finish round ${cy}` : `Advance to round ${cy + 1}`, { timeout: 15000 });
    const cs = kvOf(ctx, "current_session");
    expect(cs.movements.at(-1).cycle, "movements recorded for the round").toBe(cy);
    expect(Object.values(cs.assignments as Record<string, number[]>).flat().sort((a, b) => a - b), "nobody lost or added").toEqual(before);
    // Each player stays, or lands on the next court in use in the direction they moved (an empty court is skipped: with
    // everyone keeping the court they earned, a court whose players are all away can sit empty between two in use).
    const was = L.current!.assignments, mv = cs.movements.at(-1).mv;
    const next = (c: number, d: number) => { for (let x = c + d; x >= 1 && x <= NC; x += d) if ((was[x] || []).length) return x; return c; };
    for (const id of before) { const c = courtOf(was, id); expect(courtOf(cs.assignments, id), `player ${id} (${mv[id]} from Court ${c}) lands on the next court in use`).toBe(mv[id] === "up" ? next(c, -1) : mv[id] === "down" ? next(c, 1) : c); }
    await refresh(ctx);
    await page.evaluate(() => nav("scores"));
    await page.locator("#sc-sel").selectOption(String(last));
    if (final) {
      await expect(page.locator("#score-area")).toContainText("Session Complete");
      await expect(page.locator("#score-area").getByRole("button", { name: /End Session/ })).toBeVisible();
    } else {
      const n = (cs.assignments[last] || []).length;
      await expect(page.locator("#score-area .alert").first()).toContainText(n >= 2 ? `Court ${last} · Round ${cy + 1}` : `Court ${last} has ${n ? "only 1" : "no"} player assigned — minimum 2 needed.`);
    }
    // Nobody is left alone on a court after a rotation (a lone player could not play the next round).
    for (let c = 1; c <= NC; c++) expect((cs.assignments[c] || []).length === 1 && (L.current!.assignments[c] || []).length !== 1, `Court ${c} left with one player`).toBe(false);
    await checkAllTabs(ctx, fromDb(ctx, L));
  });
}
