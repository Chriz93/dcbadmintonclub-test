// Ties and shuttles: a court tied at the top (2-2-2-0) or the bottom (a clean sweep) shows the app's own coin toss —
// drawn from the night's start time, so it is the same on every phone — and the next round moves exactly that player;
// Undo and advancing again cannot redraw it. Shuttles handed out after the last round go to the top scorers and appear
// in History and Stats once the night is saved. 100 leagues.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, combos, NC, type GenOpts, type League } from "./gen";
import { courtOf } from "./oracle";
import { kvOf } from "./checks";
import { tossOrder } from "../rules-model";

type Act = "top" | "bottom" | "again" | "birds";
const ACTS: [Act, Partial<GenOpts>][] = [["top", { live: "r1-done", tieRate: 0 }], ["bottom", { live: "r1-done", tieRate: 0 }], ["again", { live: "r1-done", tieRate: 0 }], ["birds", { live: "complete" }]];
/** Tie a four-player court: "top" gives 2-2-2-0 (three tied at the top), "bottom" a sweep (three tied at the bottom). */
function tieCourt(L: League, kind: "top" | "bottom") {
  // A bottom toss only exists where the loser would move down: the court below must have players.
  const cur = L.current!, cands = [2, 3, 4, 5].filter((c) => (cur.assignments[c] || []).length === 4 && (kind === "top" || (cur.assignments[c + 1] || []).length > 0));
  if (!cands.length) return null;
  const c = cands[L.seed % cands.length], ids = cur.assignments[c], cy = cur.cycle;
  const pattern = kind === "top" ? [[21, 19], [19, 21], [21, 19]] : [[21, 19], [21, 19], [21, 19]];
  combos(ids).forEach((g, k) => { const [sA, sB] = pattern[k]; cur.scores[`c${c}_y${cy}_g${k + 1}`] = { ...g, sA, sB, w: sA > sB ? "A" : "B" }; });
  cur.preTosses = {};
  const [A, B, C, D] = ids;
  return { c, cy, tied: kind === "top" ? [A, B, D] : [B, C, D], alone: kind === "top" ? C : A };
}

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
for (let i = 0; i < 100; i++) {
  const [act, extra] = ACTS[i % ACTS.length], base = variety(i + 19);
  const opts: GenOpts = { ...base, regulars: Math.max(12, base.regulars ?? 12), declineRate: 0, absentRate: 0, ...extra };
  test(`Toss & birds ${String(i + 1).padStart(3, "0")} · ${act} · ${genLeague(29000 + i, opts).title}`, async () => {
    const L = genLeague(29000 + i, { ...opts, dates: ctx.dates });
    const r = rng(800 + i), page = () => ctx.page, toast = () => ctx.page.locator("#_t");
    const name = (id: number) => L.players.find((p) => p.id === id)!.name;

    if (act === "birds") {
      await load(ctx, L);
      const cur = L.current!, cy = cur.cycle, counts: Record<number, number> = {};
      await page().evaluate(() => nav("admin"));
      await page().getByRole("button", { name: "📅 Session" }).click();
      // Two shuttlecocks per player: a court of n starts with 2n, so 0..2n can be left; a court not in use is disabled.
      for (let c = 1; c <= NC; c++) { const n = (cur.assignments[c] || []).length, max = n >= 2 ? 2 * n : 0; counts[c] = Math.floor(r() * (max + 1)); if (max) await page().locator(`#birds_${c}`).fill(String(counts[c])); else await expect(page().locator(`#birds_${c}`), `Court ${c} not in use`).toBeDisabled(); }
      await page().getByRole("button", { name: "🪶 Distribute to Top Scorers" }).click();
      await expect(toast()).toHaveText("Birds distributed to top scorers!");
      const want: Record<string, { recipients: { playerId: number; birdsReceived: number }[]; total: number }> = {};
      for (let c = 1; c <= NC; c++) {
        const ids = cur.assignments[c] || [];
        if (counts[c] <= 0 || !ids.length) continue;
        const w: Record<number, number> = {}; ids.forEach((id) => (w[id] = 0));
        for (let g = 1; g <= 5; g++) { const sc = cur.scores[`c${c}_y${cy}_g${g}`]; if (!sc) continue; for (const id of (sc.w === "A" ? [sc.a1, sc.a2] : [sc.b1, sc.b2])) if (id != null && w[id] !== undefined) w[id]++; }
        const ranked = [...ids].sort((a, b) => w[b] - w[a]), rec = ranked.slice(0, counts[c]).map((id) => ({ playerId: id, birdsReceived: 1 }));
        for (let left = counts[c] - rec.length, k = 0; left > 0; left--, k++) rec[k % rec.length].birdsReceived++;
        want[c] = { recipients: rec, total: counts[c] };
      }
      expect(kvOf(ctx, "current_session").birdDistribution, "one to each top scorer, extras round the court").toEqual(want);
      await page().getByRole("button", { name: "✅ End & Save Session" }).click();
      await expect(page().locator("#modal.open")).toContainText("Final Court Assignments");
      await page().evaluate(() => closeModal());
      await page().evaluate(() => nav("standings"));
      await page().locator("#page-standings .ptab").filter({ hasText: /History$/ }).click();
      const card = page().locator("#sec-hist .card").first();
      await card.locator("div").first().click();
      const text = norm((await page().locator("#sec-hist .card").first().textContent()) || "");
      if (Object.keys(want).length) {
        expect(text).toContain("🪶 Birds");
        for (const [c, d] of Object.entries(want)) expect(text, `History: Court ${c} shuttles`).toContain(`C${c}: ${d.recipients.map((x) => `${name(x.playerId).split(" ")[0]}(${x.birdsReceived}🪶)`).join(", ")}`);
      } else expect(text).not.toContain("🪶 Birds");
      await page().locator("#page-standings .ptab").filter({ hasText: /Stats$/ }).click();
      const got: Record<number, number> = {};
      for (const d of Object.values(want)) for (const x of d.recipients) got[x.playerId] = (got[x.playerId] || 0) + x.birdsReceived;
      for (const [id, n] of Object.entries(got)) await expect(page().locator("#sec-pstats > .card").filter({ hasNotText: "Season Awards" }).filter({ hasText: name(+id) }).first(), `Stats: ${name(+id)}`).toContainText(`🪶 Shuttlecocks: ${n} received`);
      return;
    }

    const tie = tieCourt(L, act === "bottom" ? "bottom" : "top");
    await load(ctx, L);
    if (!tie) return;
    const { c, cy, tied, alone } = tie, up = act !== "bottom", cur = L.current!;
    // The toss, computed independently: tied players in toss order; the first wins (moves up), the last loses (moves down).
    const order = tossOrder(cur.id, cy, c, tied), chosen = up ? order[0] : order[order.length - 1];
    await page().evaluate(() => nav("scores"));
    await page().locator("#sc-sel").selectOption(String(c));
    const tally = page().locator(`#res-${c}`), tag = (id: number) => tally.locator(".lbrow").filter({ hasText: name(id) }).locator(".tag").last();
    await expect(tally.locator(".card-title")).toHaveText(`✅ Court ${c} Tally`);
    for (const id of tied) await expect(tag(id), `${name(id)}: ${id === chosen ? "chosen" : "not chosen"} by the toss`)
      .toHaveText(up ? (id === chosen ? `🪙 Won toss — ⬆️ C${c - 1}` : `🪙 Lost toss — Stays C${c}`) : (id === chosen ? `🪙 Lost toss — ⬇️ C${c + 1}` : `🪙 Won toss — Stays C${c}`));
    const below = (cur.assignments[c + 1] || []).length > 0;
    await expect(tag(alone)).toHaveText(up ? (below ? `⬇️ Moves to C${c + 1}` : "📍 Bottom court") : `⬆️ Moves to C${c - 1}`);
    await expect(tally).toContainText(`🪙 Coin toss by the app (tied on wins, points and point difference): ${name(chosen)} moves ${up ? "up" : "down"}. Every phone shows the same result.`);
    await expect(tally, "nothing to record by hand").not.toContainText("Record Toss");
    const advance = async () => {
      await page().evaluate(() => nav("admin"));
      await page().getByRole("button", { name: "📅 Session" }).click();
      await page().locator("#sess-ui").getByRole("button", { name: "⏭ Next Round (Rotate)" }).click();
      await expect(toast()).toHaveText(`Round ${cy + 1}!`);
    };
    const checkMoves = (why: string) => {
      const cs = kvOf(ctx, "current_session"), last = cs.movements.at(-1), mv = last.mv;
      expect(mv[chosen], `${name(chosen)} moves ${up ? "up" : "down"} (${why})`).toBe(up ? "up" : "down");
      for (const id of tied.filter((x) => x !== chosen)) expect(mv[id], `${name(id)} stays (${why})`).toBe("stay");
      expect(courtOf(cs.assignments, chosen)).toBe(up ? c - 1 : c + 1);
      expect(last.tossChoices[`${up ? "top" : "bot"}_${c}`], "the toss is recorded with the round").toEqual(up
        ? { group: [...tied].sort((a, b) => a - b), direction: "up", winnerId: chosen, by: "app" }
        : { group: [...tied].sort((a, b) => a - b), direction: "down", loserId: chosen, by: "app" });
    };
    await advance();
    checkMoves("first advance");
    if (act !== "again") return;
    // Undo the advance and advance again: the toss cannot be redrawn.
    await page().evaluate(() => undoLast());
    await expect.poll(() => kvOf(ctx, "current_session").cycle, { message: "back to the tied round" }).toBe(cy);
    await advance();
    checkMoves("after Undo and advancing again");
  });
}
