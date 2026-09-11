// The league rules, re-implemented independently of index.html. Simulations drive the real app and assert that it
// agrees with this model after every round and every session.
import type { MockState } from "./mock-supabase";

const NC = 6;
export const cap = (c: number) => (c === NC ? 5 : 4);
export const target = (n: number) => (n === 5 ? 15 : 21);
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
  // Seating rule: players in order of earned court (then id), four per court, the rest on Court 6.
  // Regulars who are coming, in order of earned court (then id); confirmed spares after them in answer order.
  seat(exclude: Set<number> = new Set(), spares: number[] = []) {
    const regs = [...this.earned.keys()].filter((id) => !exclude.has(id) && !this.spareIds.has(id) && (this.earned.get(id) ?? 0) > 0)
      .sort((a, b) => this.earned.get(a)! - this.earned.get(b)! || a - b);
    const ids = [...regs, ...spares];
    this.lineup = Array.from({ length: NC + 1 }, () => []);
    ids.forEach((id, i) => this.lineup[Math.min(Math.floor(i / 4) + 1, NC)].push(id));
    this.sessionWins.clear(); this.sessionGames.clear(); this.initialCourt.clear(); this.absentFrom.clear(); this.round2Court.clear();
    for (let c = 1; c <= NC; c++) for (const id of this.lineup[c]) this.initialCourt.set(id, c);
  }
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
  // Ranking on a court: wins, points for, differential; a full tie goes to head-to-head, then points conceded, then id.
  rank(r: Round, ids: number[]) {
    const key = (id: number) => [r.wins[id] || 0, r.pts[id] || 0, (r.pf[id] || 0) - (r.pa[id] || 0)];
    const same = (a: number, b: number) => key(a).every((v, i) => v === key(b)[i]);
    const tieOrder = (tied: number[]) => {
      const h2h: Record<number, number> = {}; tied.forEach((i) => (h2h[i] = 0));
      for (const g of r.games) { const tA = g.A.filter((i) => tied.includes(i)), tB = g.B.filter((i) => tied.includes(i)); if (!tA.length || !tB.length) continue; (g.w === "A" ? tA : tB).forEach((i) => h2h[i]++); }
      return [...tied].sort((x, y) => h2h[y] - h2h[x] || (r.pa[x] || 0) - (r.pa[y] || 0) || x - y);
    };
    const sorted = [...ids].sort((x, y) => { const kx = key(x), ky = key(y); return ky[0] - kx[0] || ky[1] - kx[1] || ky[2] - kx[2] || x - y; });
    const topGroup = sorted.filter((i) => same(i, sorted[0])), botGroup = sorted.filter((i) => same(i, sorted[sorted.length - 1]));
    const top = topGroup.length > 1 ? tieOrder(topGroup)[0] : sorted[0];
    const allTied = same(sorted[0], sorted[sorted.length - 1]);
    const bottom = botGroup.length > 1 && !allTied ? tieOrder(botGroup).slice(-1)[0] : sorted[sorted.length - 1];
    return { top, bottom, allTied };
  }
  rotate(r: Round): Record<number, string> {
    const mv: Record<number, string> = {};
    for (let c = 1; c <= NC; c++) {
      const ids = this.lineup[c]; if (ids.length < 2) { ids.forEach((id) => (mv[id] = "stay")); continue; }
      const { top, bottom, allTied } = this.rank(r, ids);
      for (const id of ids) mv[id] = "stay";
      if (c > 1) mv[top] = "up";
      if (c < NC && !(allTied && ids.length > 1 && top === bottom)) { if (bottom !== top || c === 1) mv[bottom] = "down"; }
    }
    const na: number[][] = Array.from({ length: NC + 1 }, () => []);
    for (const id of Object.keys(mv).map(Number).sort((a, b) => a - b)) { // the app walks the map in ascending id order
      const from = this.lineup.findIndex((l) => l.includes(id)); let to = from;
      if (mv[id] === "up") to = Math.max(1, from - 1); if (mv[id] === "down") to = Math.min(NC, from + 1);
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

