// Independent expectations for every tab, computed from the generated league (never from the app's own code).
import type { League, SessionRec, Score, Player } from "./gen";
import { NC } from "./gen";
import { eloReference } from "../helpers";
import { fillCourts } from "../rules-model";

export const first = (n: string) => n.split(" ")[0];
const courtGames = (n: number) => (n === 5 ? 5 : 3);
export const courtOf = (a: Record<string, number[]> | undefined, id: number) => { for (let c = 1; c <= NC; c++) if ((a?.[c] || []).includes(id)) return c; return 0; };
const cyOf = (k: string) => parseInt(k.match(/_y(\d+)_/)![1]);
const sides = (sc: Score) => ({ A: [sc.a1, sc.a2].filter((x): x is number => x != null), B: [sc.b1, sc.b2].filter((x): x is number => x != null) });
export const lbPlayers = (L: League) => L.players.filter((p) => p.current_court > 0 || p.games_played > 0 || p.season_wins > 0);
export const rotated = (L: League) => !!L.current && L.current.movements.some((m) => m.cycle === L.current!.cycle);

/** Results of the current round that are not yet in the season statistics (the round has not rotated). */
export function live(L: League) {
  const w: Record<number, number> = {}, l: Record<number, number> = {};
  if (!L.current || rotated(L)) return { w, l };
  const cy = L.current.cycle, known = new Set(L.players.map((p) => p.id));
  for (let c = 1; c <= NC; c++) {
    const pids = (L.current.assignments[c] || []).filter((id) => known.has(id));
    for (let g = 1; g <= courtGames(pids.length); g++) {
      const sc = L.current.scores[`c${c}_y${cy}_g${g}`]; if (!sc) continue;
      const { A, B } = sides(sc);
      for (const id of sc.w === "A" ? A : B) w[id] = (w[id] || 0) + 1;
      for (const id of sc.w === "A" ? B : A) l[id] = (l[id] || 0) + 1;
    }
  }
  return { w, l };
}
const seatOf = (L: League, p: Player) => (L.current ? courtOf(L.current.assignments, p.id) || p.current_court : p.current_court);
const lastCourt = (L: League, p: Player) => {
  if (p.current_court > 0) return p.current_court;
  for (let i = L.sessions.length - 1; i >= 0; i--) { const c = courtOf(L.sessions[i].assignments, p.id); if (c) return c; }
  if (L.current) { const c = courtOf(L.current.assignments, p.id); if (c) return c; }
  return NC + 1;
};

export function leaders(L: League) {
  const { w: lw, l: ll } = live(L);
  const rows = lbPlayers(L).map((p) => {
    const W = p.season_wins + (lw[p.id] || 0), Lo = p.season_losses + (ll[p.id] || 0), GP = p.games_played + (lw[p.id] || 0) + (ll[p.id] || 0);
    return { p, W, L: Lo, GP, wr: GP > 0 ? Math.round((W / GP) * 100) : 0, active: p.current_court > 0 };
  });
  rows.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.active) { const ca = seatOf(L, a.p), cb = seatOf(L, b.p); if (ca !== cb) return ca - cb; }
    else { const la = lastCourt(L, a.p), lb = lastCourt(L, b.p); if (la !== lb) return la - lb; }
    if (b.W !== a.W) return b.W - a.W;
    return (b.GP > 0 ? b.W / b.GP : 0) - (a.GP > 0 ? a.W / a.GP : 0);
  });
  return rows.map((x) => {
    const disp = x.active ? seatOf(L, x.p) : lastCourt(L, x.p);
    return { id: x.p.id, name: x.p.name, W: x.W, L: x.L, GP: x.GP, wr: x.wr, spare: x.p.membership_type === "spare", absent: !x.active, liveW: lw[x.p.id] || 0, liveL: ll[x.p.id] || 0,
      label: x.active ? `Court ${disp}` : `Last: C${disp <= NC ? disp : "?"}` };
  });
}

export const allSessions = (L: League) => [...L.sessions, ...(L.current ? [L.current] : [])];
export function rankings(L: League) {
  const elo = eloReference(L.players as never, allSessions(L) as never);
  const rows = lbPlayers(L).map((p) => {
    const cp = seatOf(L, p) || p.current_court, W = p.season_wins, Lo = p.season_losses, GP = p.games_played, rating = elo[p.id] || 1000, active = p.current_court > 0;
    const base = 1500 - (cp - 1) * 100;
    return { id: p.id, name: p.name, rating, spare: p.membership_type === "spare", absent: !active, sub: `${active ? "Court " + cp : "Absent"} · ${W}W ${Lo}L · ${GP > 0 ? Math.round((W / GP) * 100) : 0}%`,
      trend: rating >= base + 50 ? "📈" : rating <= base - 50 ? "📉" : "" };
  });
  return { elo, rows: rows.sort((a, b) => b.rating - a.rating) };
}

export function streaks(L: League) {
  const all: SessionRec[] = [...L.sessions]; if (L.current && L.current.movements.length > 0) all.push(L.current);
  const out: Record<number, { streak: number; maxStreak: number; courtClimb: number; improvement: number }> = {};
  for (const p of L.players) {
    let cur = 0, max = 0;
    for (const s of all) {
      let w = 0, g = 0;
      for (const m of s.movements || []) {
        w += m.wins?.[p.id] || 0;
        for (const [k, sc] of Object.entries(s.scores || {})) if (k.includes(`_y${m.cycle}_`) && [sc.a1, sc.a2, sc.b1, sc.b2].includes(p.id)) g++;
      }
      if (g > 0 && w > g / 2) { cur++; max = Math.max(max, cur); } else if (g > 0) cur = 0;
    }
    let start = p.current_court;
    if (all.length) { const ia = all[0].initialAssignments || all[0].assignments; const c = courtOf(ia, p.id); if (c) start = c; }
    let now = p.current_court; if (L.current) { const c = courtOf(L.current.assignments, p.id); if (c) now = c; }
    const climb = all.length > 0 ? start - now : 0;
    out[p.id] = { streak: cur, maxStreak: max, courtClimb: climb, improvement: Math.max(0, climb) };
  }
  return out;
}

export function stats(L: League) {
  const lb = lbPlayers(L), sd = streaks(L);
  const cp = (p: Player) => (L.current ? courtOf(L.current.assignments, p.id) : 0) || p.current_court || NC + 1;
  const ap = [...lb].sort((a, b) => { const aa = a.current_court > 0, ba = b.current_court > 0; if (aa !== ba) return aa ? -1 : 1; return cp(a) - cp(b); });
  const lw: Record<number, number> = {}, ll: Record<number, number> = {};
  if (L.current && !rotated(L)) for (const [k, sc] of Object.entries(L.current.scores)) if (cyOf(k) === L.current.cycle) { const { A, B } = sides(sc); for (const id of sc.w === "A" ? A : B) lw[id] = (lw[id] || 0) + 1; for (const id of sc.w === "A" ? B : A) ll[id] = (ll[id] || 0) + 1; }
  const sessionsExist = L.sessions.length > 0;
  const best = (f: (p: Player) => number, cmp: (a: number, b: number) => boolean) => ap.length ? ap.reduce((b, p) => (cmp(f(p), f(b)) ? p : b), ap[0]).id : null;
  const longest = best((p) => sd[p.id].maxStreak, (a, b) => a > b), improved = best((p) => sd[p.id].improvement, (a, b) => a > b), consistent = best((p) => p.no_show_count, (a, b) => a < b);
  const cards = ap.map((p) => {
    const W = p.season_wins + (lw[p.id] || 0), Lo = p.season_losses + (ll[p.id] || 0), GP = p.games_played + (lw[p.id] || 0) + (ll[p.id] || 0);
    const disp = (L.current ? courtOf(L.current.assignments, p.id) : 0) || p.current_court;
    const awards = sessionsExist ? `${p.id === longest && sd[p.id].maxStreak > 0 ? "🔥" : ""}${p.id === improved && sd[p.id].courtClimb > 0 ? "📈" : ""}${p.id === consistent ? "🏅" : ""}` : "";
    return { id: p.id, name: p.name, awards, W, L: Lo, wr: GP > 0 ? Math.round((W / GP) * 100) : 0, court: p.current_court === 0 ? "Absent" : `Court ${disp}`,
      bestCourt: `C${Math.min(disp || NC, p.highest_court || disp || NC)}`, ...sd[p.id], absences: p.no_show_count, liveW: lw[p.id] || 0 };
  });
  const banner = !sessionsExist ? null : {
    longest: longest && sd[longest].maxStreak > 0 ? L.players.find((p) => p.id === longest)!.name : null,
    improved: improved && sd[improved].improvement > 0 ? L.players.find((p) => p.id === improved)!.name : null,
    consistent: consistent ? L.players.find((p) => p.id === consistent)!.name : null };
  return { cards, banner };
}

const sessName = (s: SessionRec, L: League, id: number) => s.playerNames?.[id] || L.players.find((p) => p.id === id)?.name || "#" + id;
export function sessionsTab(L: League) {
  return [...L.sessions].reverse().map((s) => {
    const w: Record<number, number> = {}, l: Record<number, number> = {}, g: Record<number, number> = {}, last: Record<number, { cy: number; court: number }> = {};
    for (const [k, sc] of Object.entries(s.scores)) {
      const { A, B } = sides(sc); const c = parseInt(k.match(/^c(\d+)_/)![1]), cy = cyOf(k);
      for (const id of [...A, ...B]) { g[id] = (g[id] || 0) + 1; if (!last[id] || last[id].cy < cy) last[id] = { cy, court: c }; }
      for (const id of sc.w === "A" ? A : B) w[id] = (w[id] || 0) + 1;
      for (const id of sc.w === "A" ? B : A) l[id] = (l[id] || 0) + 1;
    }
    const rounds = new Set(Object.keys(s.scores).map(cyOf)).size;
    const courts: string[][] = [];
    for (let c = 1; c <= NC; c++) {
      const pids = s.finalAssignments?.[c] || []; if (!pids.length) continue;
      const sorted = [...pids].sort((a, b) => (w[b] || 0) - (w[a] || 0) || sessName(s, L, a).localeCompare(sessName(s, L, b)));
      courts.push(sorted.map((id, i) => {
        const sc = last[id]?.court || c;
        const mv = sc < c ? ` (↓ C${sc}→C${c})` : sc > c ? ` (↑ C${sc}→C${c})` : ` (stayed C${c})`;
        const gp = g[id] || 0;
        return `${i + 1}. ${first(sessName(s, L, id))}${mv} ${w[id] || 0}W ${l[id] || 0}L · ${gp > 0 ? Math.round(((w[id] || 0) / gp) * 100) : 0}%`;
      }));
    }
    return { title: `Session ${s.number} — ${s.date} · ${rounds} Rounds · Final Standings`, courts };
  });
}

export function history(L: League) {
  return [...L.sessions].reverse().map((s) => {
    const rounds = new Set(Object.keys(s.scores).map(cyOf));
    const maxCy = Math.max(...rounds, 1);
    const lines: string[] = [];
    for (let cy = 1; cy <= maxCy; cy++) {
      lines.push(`Round ${cy}`);
      for (let c = 1; c <= NC; c++) for (let g = 1; g <= 5; g++) {
        const sc = s.scores[`c${c}_y${cy}_g${g}`]; if (!sc) continue;
        const { A, B } = sides(sc); const nm = (id: number) => first(sessName(s, L, id));
        lines.push(`${A.map(nm).join(" & ")} ${sc.sA} — ${sc.sB} ${B.map(nm).join(" & ")}`);
      }
    }
    return { head: `Session ${s.number} — ${s.date}`, rounds: rounds.size, games: Object.keys(s.scores).length, lines };
  });
}

export function courtHistory(L: League) {
  return lbPlayers(L).map((p) => ({ name: first(p.name), cells: L.sessions.map((s) => String(courtOf(s.finalAssignments || s.assignments, p.id) || "—")) }));
}

/** Player of the Session, exactly as the rules describe it: wins weighted by the court played on, plus half the win rate. */
export function pos(L: League) {
  let s: SessionRec | null = L.sessions.length ? L.sessions[L.sessions.length - 1] : null;
  if (!s && L.current && L.current.movements.length > 0) s = L.current;
  if (!s || !s.movements.length) return null;
  const wins: Record<string, number> = {}, games: Record<string, number> = {}, court: Record<string, number> = {};
  for (const m of s.movements) for (const [id, w] of Object.entries(m.wins || {})) wins[id] = (wins[id] || 0) + w;
  const ia = s.initialAssignments || s.assignments;
  for (let c = 1; c <= NC; c++) for (const id of ia[c] || []) if (!court[id]) court[id] = c;
  for (const sc of Object.values(s.scores)) for (const id of [sc.a1, sc.a2, sc.b1, sc.b2]) if (id != null) games[id] = (games[id] || 0) + 1;
  const scored = Object.entries(wins).map(([id, w]) => { const c = court[id] || NC, bonus = c <= 3 ? 1 + (4 - c) * 0.17 : 1, gm = games[id] || 1; return { id: +id, w, v: w * bonus + (gm > 0 ? w / gm : 0) * 0.5 }; });
  const best = [...scored].sort((a, b) => b.v - a.v)[0]; if (!best) return null;
  const p = L.players.find((x) => x.id === best.id); if (!p) return null;
  const g = games[best.id] || 0;
  return { number: s.number, name: p.name, stat: `${best.w}W ${g - best.w}L on Court ${court[best.id] || "?"} · Session ${s.number} — ${s.date}` };
}

/** Next session's seating from the votes, as the rules describe it. */
export function upcoming(L: League) {
  const byId = (id: number) => L.players.find((p) => p.id === id)!;
  const isReg = (p: Player) => !!p && p.approved && !p.waitlisted && p.membership_type !== "spare";
  const isSpare = (p: Player) => !!p && p.approved && p.membership_type === "spare";
  const rows = L.rsvps.filter((r) => r.session_number === L.upcoming).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  const vote: Record<number, string> = {}; rows.forEach((r) => (vote[r.player_id] = r.response));
  // Attendance marked before the session: absent = not seated; present = seated despite a "not coming" vote.
  const pre = L.pre || {}, preAbsent = new Set(L.players.filter((p) => pre[p.id] === "absent").map((p) => p.id));
  const declined = new Set(L.players.filter((p) => isReg(p) && vote[p.id] === "notcoming" && pre[p.id] !== "present" && !preAbsent.has(p.id)).map((p) => p.id));
  const declinedRows = rows.filter((r) => r.response === "notcoming" && isReg(byId(r.player_id))).length;
  const claims = rows.filter((r) => r.response === "coming" && isSpare(byId(r.player_id))).sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.player_id - b.player_id);
  const spares = claims.slice(0, declinedRows).map((r) => r.player_id).filter((id) => !preAbsent.has(id));
  const regs = L.players.filter((p) => p.current_court > 0 && p.membership_type !== "spare" && !declined.has(p.id) && !preAbsent.has(p.id)).sort((a, b) => a.current_court - b.current_court);
  const order = [...regs.map((p) => p.id), ...spares.filter((id) => !regs.some((p) => p.id === id))];
  const filled = fillCourts(order);
  const assign: Record<string, number[]> = Object.fromEntries(Array.from({ length: NC }, (_, i) => [String(i + 1), filled[i + 1]]));
  return { vote, declined, preAbsent, spares, assign };
}

export function courts(L: League) {
  const assign: Record<string, number[]> = L.current ? L.current.assignments : upcoming(L).assign;
  const cy = L.current ? L.current.cycle : 0;
  const prev = L.current?.movements.find((m) => m.cycle === cy - 1)?.mv || {};
  const known = (id: number) => L.players.find((p) => p.id === id);
  const out = Array.from({ length: NC }, (_, i) => {
    const c = i + 1, ps = (assign[c] || []).map(known).filter((p): p is Player => !!p);
    return { c, names: ps.map((p) => p.name), firsts: ps.map((p) => first(p.name)), count: ps.length, cap: Math.max(4, ps.length), moves: ps.map((p) => prev[p.id] || "") };
  });
  const sub = L.current ? `Session ${L.current.number} · ${L.current.date} · Round ${cy}` : L.sessions.length ? `${L.sessions.length}/28 sessions done` : "No active session";
  return { courts: out, sub, medals: !L.current || !!L.current.completed };
}
