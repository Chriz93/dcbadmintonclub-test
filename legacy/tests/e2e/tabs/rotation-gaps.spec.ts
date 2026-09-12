// Ladder rotation with empty courts in the ladder (p37: "one court up/down" is the next court in use). Every pattern of
// courts in use (the 57 ways to use two or more of the six courts, two to five players on each) is played twice through
// the page: finishing round 1, where the round advances by itself, and finishing round 2, then End Session. The courts
// after each rotation, every player's move and every earned court are compared with the independent rules model
// (legacy/tests/e2e/rules-model.ts), never with the app's own answer.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { rng, combos, target, NC } from "./gen";
import { Model, members, modelMembers } from "../rules-model";
import { kvOf } from "./checks";
import { MASKS, courtsOf, sizeOf, shape, ladderLeague, playCourt, roundOf } from "./ladder";

const byId = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [String(k), v]).sort(([a], [b]) => +a - +b));

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

for (const m of MASKS) for (const cy of [1, 2]) {
  test(`Ladder with empty courts · ${shape(m)} · round ${cy}${cy === 2 ? " and End Session" : ""}`, async () => {
    const seed = 61000 + m * 2 + cy, r = rng(seed), used = courtsOf(m);
    const L = ladderLeague(m, seed, ctx.dates), cur = L.current!;
    const model = new Model(L.players);
    model.lineup = [[], ...[1, 2, 3, 4, 5, 6].map((c) => [...cur.assignments[c]])];
    if (cy === 2) {
      // Round 1 already played and rotated (by the rules model); round 2 is under way.
      for (const c of used) playCourt(cur.scores, c, cur.assignments[c], 1, r);
      const r1 = roundOf(cur.scores, 1), mv1 = model.rotate(r1, { sid: cur.id, cy: 1 });
      const all = (o: Record<number, number>) => Object.fromEntries(L.players.map((p) => [p.id, o[p.id] || 0]));
      cur.movements = [{ cycle: 1, mv: mv1 as Record<string, string>, wins: all(r1.wins), pts: all(r1.pts), tosses: {}, tossChoices: {} }];
      cur.assignments = Object.fromEntries([1, 2, 3, 4, 5, 6].map((c) => [String(c), [...model.lineup[c]]]));
      cur.cycle = 2;
    }
    // Every court but one is scored; the organizer enters the last one on the Scores page.
    const last = used[Math.floor(r() * used.length)];
    for (const c of used) if (c !== last) playCourt(cur.scores, c, cur.assignments[c], cy, r);
    await load(ctx, L);
    const page = ctx.page;
    await page.evaluate(() => nav("scores"));
    await page.locator("#sc-sel").selectOption(String(last));
    const ids = cur.assignments[last], T = target(ids.length), plan: [number, number][] = [];
    for (let g = 1; g <= combos(ids).length; g++) {
      if (ids.length === 2 && g === 3 && (plan[0][0] > plan[0][1]) === (plan[1][0] > plan[1][1])) break;   // best of three
      const lo = Math.floor(r() * (T - 1)), aWins = r() < 0.5; plan.push(aWins ? [T, lo] : [lo, T]);
    }
    for (let g = 1; g <= plan.length; g++) {
      await page.locator(`#si_${last}_${g}_a`).fill(String(plan[g - 1][0]));
      await page.locator(`#si_${last}_${g}_b`).fill(String(plan[g - 1][1]));
    }
    await page.getByRole("button", { name: `💾 Save All Court ${last} Scores` }).click();
    await expect.poll(() => { const cs = kvOf(ctx, "current_session"); return cy === 2 ? cs.completed === true : cs.cycle; }, { message: "the round finished by itself", timeout: 20000 }).toBe(cy === 2 ? true : 2);
    const cs = kvOf(ctx, "current_session");
    const mv = model.rotate(roundOf(cs.scores, cy), { sid: cur.id, cy });
    expect(members(cs.assignments), "courts after the rotation (rules model)").toEqual(modelMembers(model));
    expect(byId(cs.movements.find((x: { cycle: number }) => x.cycle === cy).mv), "each player's move").toEqual(byId(mv as Record<string, string>));
    for (let c = 1; c <= NC; c++) expect((cs.assignments[c] || []).length, `Court ${c}: the same number of players; an empty court stays empty`).toBe(used.includes(c) ? sizeOf(m, c) : 0);
    // A move crosses only to the neighbouring court in use: never further, never onto an empty court in between.
    for (const [id, dir] of Object.entries(mv)) {
      const from = used.find((c) => (cy === 1 ? L.current!.assignments : cur.assignments)[c].includes(+id))!, i = used.indexOf(from);
      const to = [1, 2, 3, 4, 5, 6].find((c) => (cs.assignments[c] || []).includes(+id));
      expect(to, `player ${id} (${dir})`).toBe(dir === "up" ? used[i - 1] : dir === "down" ? used[i + 1] : from);
    }
    if (cy === 1) {
      // Round 2's score screen is ready on every court in use.
      for (const c of used) {
        await page.locator("#sc-sel").selectOption(String(c));
        await expect(page.locator("#score-area .alert").first()).toContainText(`Court ${c} · Round 2`);
      }
      return;
    }
    // End Session: every player's earned court for next week is the court the last rotation left them on.
    await page.evaluate(() => nav("scores"));
    await page.locator("#sc-sel").selectOption(String(last));
    await page.locator("#score-area").getByRole("button", { name: /End Session/ }).click();
    await expect.poll(() => kvOf(ctx, "current_session"), { message: "the session ended", timeout: 20000 }).toBeNull();
    const earned: Record<number, number> = {};
    model.lineup.forEach((ids2, c) => ids2.forEach((id) => (earned[id] = c)));
    await expect.poll(() => ctx.state.players.filter((p) => p.current_court !== earned[p.id]).map((p) => `${p.name}: Court ${p.current_court}, earned ${earned[p.id]}`), { message: "every player's earned court", timeout: 15000 }).toEqual([]);
  });
}
