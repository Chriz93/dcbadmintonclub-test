// Tonight's starting courts (p54), written from the rule text and independently of index.html. Used by the unit tests
// and, through rules-model.ts, by the browser tests.
//   1. Everyone who is coming keeps the court they earned (in the order given).
//   2. Confirmed spares take open seats from the bottom court up: a court short of four first, then a fifth seat from the
//      bottom once every court in use has four. With no court in use, a spare starts the bottom court.
//   3. A court left with one player or more than five is settled by the independent reference engine, as at the gym.
//   4. A player who would still be alone because every other court in use has five is joined by one player from the
//      nearest court in use (on a tie the court above, whose last player moves down; from below, the first moves up).
//      So a night with 2 to 30 players coming is never refused.
import { reference } from "./adjust-reference.mjs";

export const NC = 6;
export function startingCourts(earned, spares = []) {
  const L = Array.from({ length: NC + 1 }, () => []);
  for (const p of earned) L[Math.min(NC, Math.max(1, p.court))].push(p.id);
  const spareSeat = {};
  for (const id of spares) {
    if (L.some((ids) => ids.includes(id))) continue;
    const used = [6, 5, 4, 3, 2, 1].filter((c) => L[c].length);
    const c = used.find((x) => L[x].length < 4) ?? used.find((x) => L[x].length < 5) ?? used[0] ?? NC;
    L[c].push(id); spareSeat[id] = c;
  }
  const res = reference({ nc: NC, lineup: Object.fromEntries(L.map((ids, c) => [c, ids]).slice(1)), locked: [], closed: [], absent: [], returning: [], late: [], partner: true });
  const lineup = res.ok ? [[], ...[1, 2, 3, 4, 5, 6].map((c) => [...(res.lineup[c] || res.lineup[String(c)] || [])])] : L;
  return { ok: res.ok, why: res.why, lineup, moves: res.ok ? res.moves : [], spareSeat };
}

/** The sentences the Courts page shows before the night, written from the rule text. */
export const offLine = (name, court, absent) => `${name} ${absent ? "is marked absent" : "is not coming"} (Court ${court}).`;
export const spareLine = (name, court) => `${name} (spare) takes an open seat on Court ${court}.`;
export function moveLine(name, m, nameOf = (id) => `Player ${id}`) {
  if (m.reason === "partner-down" || m.reason === "partner-up") return `${nameOf(m.with)} would be the only player on Court ${m.to} and every other court in use has five, so ${name} moves ${m.reason === "partner-down" ? "down" : "up"} from Court ${m.from} to play there.`;
  if (m.reason === "full") return `Court ${m.from} would have more than five players, so ${name} starts on Court ${m.to}.`;
  if (m.reason === "alone-up") return `${name} would be the only player on Court ${m.from}, the bottom court in use, so starts on Court ${m.to} above.`;
  return `${name} would be the only player on Court ${m.from}, so starts on Court ${m.to}.`;
}
