// The league rules, re-implemented independently of index.html. Simulations drive the real app and assert that it
// agrees with this model after every round and every session.
import type { MockState } from "./mock-supabase";
import { startingCourts } from "../unit/starting-reference.mjs";
export { startingCourts };

const NC = 6;
export const cap = (_c: number) => 5;   // any court can take a fifth player
/** Courts hold four; with more than 24 playing, the extras become a fifth player on the bottom courts (6, then 5, then 4).
 *  With fewer, courts fill four at a time and nobody sits alone: a single leftover joins the court above as its fifth. */
export function courtSizes(n: number) { const s: number[] = Array(NC + 1).fill(0); if (n <= NC * 4) { let last = 0; for (let c = 1; c <= NC && n > 0; c++) { s[c] = Math.min(4, n); n -= s[c]; last = c; } if (last > 1 && s[last] === 1) { s[last - 1]++; s[last] = 0; } } else { const extra = Math.min(n - NC * 4, NC); for (let c = 1; c <= NC; c++) s[c] = 4 + (c > NC - extra ? 1 : 0); } return s; }
export function fillCourts(ids: number[]) { const z = courtSizes(ids.length), a: number[][] = Array.from({ length: NC + 1 }, () => []); let i = 0; for (let c = 1; c <= NC; c++) { a[c] = ids.slice(i, i + z[c]); i += z[c]; } if (i < ids.length) a[NC].push(...ids.slice(i)); return a; }
export const target = (n: number) => (n === 5 ? 15 : 21);
/** The coin toss the app draws for players still tied on wins, points and point difference: a shuffle seeded by the
 *  session id (its start time), the round, the court and the tied players. Tied players in toss order; the first wins. */
export function tossOrder(sid: number, cy: number, c: number, ids: number[]) {
  const g = [...ids].sort((x, y) => x - y); let h = 2166136261;
  for (const ch of `${sid}|${cy}|${c}|${g.join(",")}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  let a = h | 0;
  const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = g.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [g[i], g[j]] = [g[j], g[i]]; }
  return g;
}
// Deterministic "form": shuffles every session so players climb and fall.
export const strength = (id: number, session: number) => 100 - id * 2 + ((id * 37 + session * 11) % 29);
export type Round = { wins: Record<number, number>; pts: Record<number, number>; pf: Record<number, number>; pa: Record<number, number>; games: { A: number[]; B: number[]; w: "A" | "B" }[] };
export const fresh = (): Round => ({ wins: {}, pts: {}, pf: {}, pa: {}, games: [] });
const add = (o: Record<number, number>, id: number, v: number) => { o[id] = (o[id] || 0) + v; };

export class Model {
  earned = new Map<number, number>();           // court each player has earned for the next session
  stats = new Map<number, { w: number; l: number; g: number; noShow: number }>();
  courtsBySession: Map<number, number>[] = [];  // final court per player, per session
  lineup: number[][] = [];                      // current lineup, index = court
  round2Court = new Map<number, number>();
  sessionWins = new Map<number, number>();
  sessionGames = new Map<number, number>();
  initialCourt = new Map<number, number>();
  absentFrom = new Map<number, number>();
  spareIds = new Set<number>();
  constructor(players: MockState["players"]) { for (const p of players) { this.earned.set(p.id, p.current_court); this.stats.set(p.id, { w: 0, l: 0, g: 0, noShow: 0 }); if (p.membership_type === "spare") this.spareIds.add(p.id); } }
  // Seating rule (p54): everyone who is coming keeps the court they earned; confirmed spares fill open seats from the bottom;
  // a court left with one player or more than five is settled as at the gym (startingCourts).
  seat(exclude: Set<number> = new Set(), spares: number[] = []) {
    const earned = [...this.earned.entries()].filter(([id, c]) => !exclude.has(id) && !this.spareIds.has(id) && c > 0).map(([id, court]) => ({ id, court }));
    this.lineup = startingCourts(earned, spares).lineup;
    this.sessionWins.clear(); this.sessionGames.clear(); this.initialCourt.clear(); this.absentFrom.clear(); this.round2Court.clear();
    for (let c = 1; c <= NC; c++) for (const id of this.lineup[c]) this.initialCourt.set(id, c);
  }
  above(c: number) { for (let x = c - 1; x >= 1; x--) if (this.lineup[x].length) return x; return 0; }
  below(c: number) { for (let x = c + 1; x <= NC; x++) if (this.lineup[x].length) return x; return 0; }
  absent(id: number) { const c = this.initialCourt.get(id)!; this.lineup[c] = this.lineup[c].filter((x) => x !== id); this.absentFrom.set(id, c); }
  // Score a game between two sides; returns [scoreA, scoreB] and records the result.
  play(r: Round, A: number[], B: number[], session: number, t: number): [number, number] {
    const sa = A.reduce((n, id) => n + strength(id, session), 0) / A.length, sb = B.reduce((n, id) => n + strength(id, session), 0) / B.length;
    const aWins = sa >= sb; const diff = Math.abs(sa - sb);
    const loser = Math.max(5, Math.min(t - 2, t - 2 - Math.floor(diff / 3)));
    const [x, y] = aWins ? [t, loser] : [loser, t];
    for (const id of A) { add(r.pts, id, x); add(r.pf, id, x); add(r.pa, id, y); if (aWins) add(r.wins, id, 1); }
    for (const id of B) { add(r.pts, id, y); add(r.pf, id, y); add(r.pa, id, x); if (!aWins) add(r.wins, id, 1); }
    r.games.push({ A, B, w: aWins ? "A" : "B" });
    for (const id of [...A, ...B]) { this.stats.get(id)!.g++; this.sessionGames.set(id, (this.sessionGames.get(id) || 0) + 1); }
    for (const id of aWins ? A : B) { this.stats.get(id)!.w++; this.sessionWins.set(id, (this.sessionWins.get(id) || 0) + 1); }
    for (const id of aWins ? B : A) this.stats.get(id)!.l++;
    return [x, y];
  }
  // Ranking on a court: wins, points for, differential; players still tied at the top or the bottom go to the app's
  // coin toss (tossOrder, seeded by the session id and round). When the whole court is tied, one toss order decides both.
  rank(r: Round, ids: number[], c: number, seed: { sid: number; cy: number }) {
    const key = (id: number) => [r.wins[id] || 0, r.pts[id] || 0, (r.pf[id] || 0) - (r.pa[id] || 0)];
    const same = (a: number, b: number) => key(a).every((v, i) => v === key(b)[i]);
    const sorted = [...ids].sort((x, y) => { const kx = key(x), ky = key(y); return ky[0] - kx[0] || ky[1] - kx[1] || ky[2] - kx[2] || x - y; });
    const topGroup = sorted.filter((i) => same(i, sorted[0])), botGroup = sorted.filter((i) => same(i, sorted[sorted.length - 1]));
    const top = topGroup.length > 1 ? tossOrder(seed.sid, seed.cy, c, topGroup)[0] : sorted[0];
    const bottom = botGroup.length > 1 ? tossOrder(seed.sid, seed.cy, c, botGroup).filter((id) => id !== top).slice(-1)[0] : sorted[sorted.length - 1];
    return { top, bottom };
  }
  rotate(r: Round, seed: { sid: number; cy: number }): Record<number, string> {
    const mv: Record<number, string> = {};
    for (let c = 1; c <= NC; c++) {
      const ids = this.lineup[c]; if (ids.length < 2) { ids.forEach((id) => (mv[id] = "stay")); continue; }
      const { top, bottom } = this.rank(r, ids, c, seed);
      for (const id of ids) mv[id] = "stay";
      // "One court up/down" is the next court in use: an empty court in the ladder is skipped, never filled by one player.
      if (this.above(c)) mv[top] = "up";
      if (this.below(c)) mv[bottom] = "down";
    }
    const na: number[][] = Array.from({ length: NC + 1 }, () => []);
    for (const id of Object.keys(mv).map(Number).sort((a, b) => a - b)) { // the app walks the map in ascending id order
      const from = this.lineup.findIndex((l) => l.includes(id)); let to = from;
      if (mv[id] === "up") to = this.above(from) || from; if (mv[id] === "down") to = this.below(from) || from;
      na[to].push(id);
    }
    for (let c = 1; c <= NC; c++) while (na[c].length > cap(c)) { const ov = na[c].pop()!; na[c < NC ? c + 1 : c - 1].unshift(ov); }
    this.lineup = na;
    return mv;
  }
  endSession() {
    const finals = new Map<number, number>();
    for (let c = 1; c <= NC; c++) for (const id of this.lineup[c]) { finals.set(id, c); this.earned.set(id, c); }
    for (const [id, from] of this.absentFrom) { const to = Math.min(NC, from + 1); this.earned.set(id, to); this.stats.get(id)!.noShow++; }
    this.courtsBySession.push(finals);
    return finals;
  }
  playerOfSession() { // wins × court bonus + win rate / 2, seeded by the starting court; lowest id wins a tie
    let best: [number, number] | null = null;
    for (const [id, w] of [...this.sessionWins.entries()].sort((a, b) => a[0] - b[0])) {
      const court = this.initialCourt.get(id) || NC; const bonus = court <= 3 ? 1 + (4 - court) * 0.17 : 1;
      const score = w * bonus + (w / (this.sessionGames.get(id) || 1)) * 0.5;
      if (!best || score > best[1]) best = [id, score];
    }
    return best![0];
  }
}
export const members = (a: Record<string, number[]>) => Object.fromEntries(Object.entries(a).map(([c, ids]) => [c, [...ids].sort((x, y) => x - y)]));
export const modelMembers = (m: Model) => Object.fromEntries(m.lineup.slice(1).map((ids, i) => [String(i + 1), [...ids].sort((x, y) => x - y)]));

