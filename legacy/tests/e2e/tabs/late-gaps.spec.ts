// The late rule on every ladder shape: in each of the 57 patterns of two or more courts in use, a player on each court in
// use arrives late (Session → Late Arrivals → Mark Late, applied at once). They move down to the next court in use —
// skipping empty courts — unless they are on the bottom court in use, that court or theirs already has scores this
// round, the court below holds five, or leaving would leave one player alone; then they stay. Some shapes carry scores
// so the "has scores" exceptions come up. The courts, the message and the late record come from the independent
// reference model (legacy/tests/unit/adjust-reference.mjs), never from the app.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { rng } from "./gen";
import { kvOf } from "./checks";
import { adjustInput, explanation, sorted, validLineup, type RefResult } from "./adjust-oracle";
import { reference } from "../../unit/adjust-reference.mjs";
import { MASKS, courtsOf, shape, ladderLeague, playCourt } from "./ladder";

type Ref = RefResult & { moves: { id: number; from: number; to: number; reason?: string }[]; skippedLate: { id: number; c: number; why: string; below?: number; other?: number }[] };

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

for (const m of MASKS) for (const c of courtsOf(m)) {
  const used = courtsOf(m), below = used.find((x) => x > c) ?? 0;
  const scored = (m + c) % 5 === 0 ? c : (m + c) % 3 === 0 && below ? below : 0;
  test(`Late with empty courts · ${shape(m)} · late on Court ${c}${scored ? ` · Court ${scored} has scores` : ""}`, async () => {
    const seed = 62000 + m * 8 + c, r = rng(seed);
    const L = ladderLeague(m, seed, ctx.dates), cur = L.current!;
    if (scored) playCourt(cur.scores, scored, cur.assignments[scored], 1, r);
    const pid = cur.assignments[c][0], nm = (id: number) => L.players.find((p) => p.id === id)!.name;
    const inp = adjustInput(cur, { absent: [], returning: [], late: [pid] }), ref = reference(inp) as Ref;
    expect(ref.ok, "a late arrival alone is never refused").toBe(true);
    await load(ctx, L);
    const page = ctx.page;
    await page.evaluate(() => { nav("admin"); showSec("admin", "a-sess"); });
    await page.locator("#late-player-sel").selectOption(String(pid));
    await page.evaluate(() => markPlayerLate());
    await expect(page.locator("#_t")).toHaveText(explanation(inp, ref, nm).find((l) => l.startsWith(nm(pid))) ?? `${nm(pid)} marked late`);
    const cs = kvOf(ctx, "current_session"), mv = ref.moves.find((x) => x.id === pid);
    expect(sorted(cs.assignments), "courts (reference model)").toEqual(sorted(ref.lineup));
    expect(validLineup(cs.assignments, inp), "every court still holds none or two to five").toBe(true);
    if (mv) expect(mv.to, "the next court in use below, past any empty court").toBe(below);
    expect(cs.latePlayers.find((l: { playerId: number }) => l.playerId === pid), "the late record").toMatchObject({ originalCourt: c, round: 1, to: mv ? mv.to : c, pending: false });
    expect(cs.attendance[pid], "a late player is present").toBe("present");
  });
}
