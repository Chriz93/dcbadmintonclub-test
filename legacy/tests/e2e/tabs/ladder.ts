// Ladder shapes for the empty-court suites (rotation-gaps, late-gaps): every pattern of courts in use, a fixed and
// varied number of players on each, and a league whose running session seats exactly that pattern.
import { genLeague, combos, target, type League, type Score } from "./gen";
import { fresh, type Round } from "../rules-model";

/** The 57 patterns of two or more of the six courts in use, as bit masks (bit 0 = Court 1). */
export const MASKS = Array.from({ length: 63 }, (_, i) => i + 1).filter((m) => m.toString(2).split("1").length - 1 >= 2);
export const courtsOf = (m: number) => [1, 2, 3, 4, 5, 6].filter((c) => m & (1 << (c - 1)));
/** Two to five players on each court in use, varied by pattern and court. */
export const sizeOf = (m: number, c: number) => 2 + ((m * 7 + c * 3) % 4);
/** "4 · 2 5 · ·": players on Courts 1 to 6, a dot for an empty court. */
export const shape = (m: number) => [1, 2, 3, 4, 5, 6].map((c) => (m & (1 << (c - 1)) ? String(sizeOf(m, c)) : "·")).join(" ");

/** A league with one running session in round 1, no scores yet, seating players 1, 2, 3… on the pattern's courts in order. */
export function ladderLeague(m: number, seed: number, dates: string[]): League {
  const used = courtsOf(m), n = used.reduce((t, c) => t + sizeOf(m, c), 0);
  const L = genLeague(seed, { regulars: n, spares: 0, pending: 0, sessions: 0, live: "r1-partial", absentRate: 0, declineRate: 0, tieRate: 0, dates });
  const A: Record<string, number[]> = Object.fromEntries([1, 2, 3, 4, 5, 6].map((c) => [String(c), [] as number[]]));
  let id = 1;
  for (const c of used) for (let k = 0; k < sizeOf(m, c); k++) { A[c].push(id); const p = L.players.find((x) => x.id === id)!; p.current_court = c; p.highest_court = c; id++; }
  const cur = L.current!;
  Object.assign(cur, { cycle: 1, assignments: A, initialAssignments: structuredClone(A), scores: {}, movements: [], preTosses: {}, absentFrom: {}, completed: false,
    attendance: Object.fromEntries(Object.values(A).flat().map((x) => [x, "present"])) });
  delete (cur as { latePlayers?: unknown }).latePlayers; delete (cur as { closedCourts?: unknown }).closedCourts;
  return L;
}

/** One court's games for a round, in the app's game order, with random winners; a court of two stops after a 2–0. */
export function playCourt(scores: Record<string, Score>, c: number, ids: number[], cy: number, r: () => number) {
  const T = target(ids.length);
  combos(ids).forEach((g, k) => {
    if (ids.length === 2 && k === 2) { const s1 = scores[`c${c}_y${cy}_g1`], s2 = scores[`c${c}_y${cy}_g2`]; if (s1 && s2 && s1.w === s2.w) return; }
    const lo = Math.floor(r() * (T - 1)), aWins = r() < 0.5;
    scores[`c${c}_y${cy}_g${k + 1}`] = { ...g, sA: aWins ? T : lo, sB: aWins ? lo : T, w: aWins ? "A" : "B" } as Score;
  });
}

/** A round's wins, points, points for and against per player, counted from the stored scores as the rules describe. */
export function roundOf(scores: Record<string, Score>, cy: number): Round {
  const r = fresh(), add = (o: Record<number, number>, id: number, v: number) => { o[id] = (o[id] || 0) + v; };
  for (const [k, sc] of Object.entries(scores)) {
    if (!new RegExp(`^c\\d_y${cy}_g\\d$`).test(k)) continue;
    const A = [sc.a1, sc.a2].filter((x): x is number => x != null), B = [sc.b1, sc.b2].filter((x): x is number => x != null);
    for (const id of A) { add(r.pts, id, sc.sA); add(r.pf, id, sc.sA); add(r.pa, id, sc.sB); if (sc.w === "A") add(r.wins, id, 1); }
    for (const id of B) { add(r.pts, id, sc.sB); add(r.pf, id, sc.sB); add(r.pa, id, sc.sA); if (sc.w === "B") add(r.wins, id, 1); }
  }
  return r;
}
