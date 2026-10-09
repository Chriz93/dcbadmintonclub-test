// Tonight's starting courts (p54), written from the rule text and independently of index.html. Used by the unit tests
// and, through rules-model.ts, by the browser tests.
//   1. Everyone who is coming keeps the court they earned (in the order given).
//   2. Confirmed spares take open seats from the bottom court up: a court short of four first, then a fifth seat from the
//      bottom once every court in use has four. With no court in use, a spare starts the bottom court.
//   3. p97, p108: each court is then listed strongest first — the season's wins, then the points scored, then lowest id
//      — with the spares seated in step 2 kept at the top, because the organizer put them there on purpose. `rank(id)`
//      supplies the numbers, compared in order and descending; without it the courts keep the order they were given.
//   4. p105, p107, p108: four to a court is the shape of the night. A court holding more than its share tonight sends
//      a player to the next court IN USE below and places them there by the same ranking, and that court settles the
//      same way. The share is four per court IN USE, except that when more than four times those courts are coming the
//      extras become a fifth seat on the LOWEST of them first, so nobody who said yes is turned away. Courts nobody
//      earned offer no seats: opening one is the adjustment engine's decision, not the settling's. The player sent down is
//      the bottom one who has NOT already been moved during this settling, so nobody falls more than one court in an
//      evening.
//   5. A court left with one player, or over five with nothing in use below, is settled by the independent reference
//      engine, as at the gym.
//   6. A player who would still be alone because every other court in use has five is joined by one player from the
//      nearest court in use (on a tie the court above, whose last player moves down; from below, the first moves up).
//      So a night with 2 to 30 players coming is never refused.
import { reference } from "./adjust-reference.mjs";

export const NC = 6;
/** p108: tonight's share per court — four, plus a fifth on the lowest courts IN USE once more than four times those
 *  courts are coming. Counted over the courts in use, not all six: a court nobody earned offers no seat tonight. */
export function nightCaps(total, used) {
  const cap = {};
  for (let c = 1; c <= NC; c++) cap[c] = 0;
  const u = (used && used.length ? [...used] : [1, 2, 3, 4, 5, 6]).sort((a, b) => a - b), n = u.length;
  const extra = Math.max(0, Math.min(total - n * 4, n));
  u.forEach((c, i) => { cap[c] = 4 + (i >= n - extra ? 1 : 0); });
  return cap;
}
export function startingCourts(earned, spares = [], rank) {
  const L = Array.from({ length: NC + 1 }, () => []);
  for (const p of earned) L[Math.min(NC, Math.max(1, p.court))].push(p.id);
  const spareSeat = {};
  for (const id of spares) {
    if (L.some((ids) => ids.includes(id))) continue;
    const used = [6, 5, 4, 3, 2, 1].filter((c) => L[c].length);
    const c = used.find((x) => L[x].length < 4) ?? used.find((x) => L[x].length < 5) ?? used[0] ?? NC;
    L[c].push(id); spareSeat[id] = c;
  }
  const cascade = [];
  if (rank) {
    const key = (id) => rank(id) || [0];
    const cmp = (x, y) => { const a = key(x), b = key(y);
      for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (b[i] || 0) - (a[i] || 0); if (d) return d; }
      return x - y; };
    const order = (ids) => [...ids.filter((id) => spareSeat[id] !== undefined), ...ids.filter((id) => spareSeat[id] === undefined).sort(cmp)];
    for (let c = 1; c <= NC; c++) L[c] = order(L[c]);
    const used = [];
    for (let c = 1; c <= NC; c++) if (L[c].length) used.push(c);
    const arrived = new Set(), cap = nightCaps(used.reduce((n, c) => n + L[c].length, 0), used);
    for (let c = 1; c < NC; c++) {
      while (L[c].length > cap[c]) {
        let to = 0; for (let x = c + 1; x <= NC; x++) if (L[x].length) { to = x; break; }
        if (!to) break;                                  // nothing in use below: the engine places them
        let i = L[c].length - 1;
        while (i >= 0 && (spareSeat[L[c][i]] !== undefined || arrived.has(L[c][i]))) i--;
        if (i < 0) break;                                // everyone left was placed by the organizer, or has moved already
        const moved = L[c][i];
        L[c] = L[c].filter((x) => x !== moved); L[to] = order([...L[to], moved]); arrived.add(moved);
        cascade.push({ id: moved, from: c, to, reason: "full", cap: cap[c] });
      }
    }
  }
  const res = reference({ nc: NC, lineup: Object.fromEntries(L.map((ids, c) => [c, ids]).slice(1)), locked: [], closed: [], absent: [], returning: [], late: [], partner: true });
  const lineup = res.ok ? [[], ...[1, 2, 3, 4, 5, 6].map((c) => [...(res.lineup[c] || res.lineup[String(c)] || [])])] : L;
  return { ok: res.ok, why: res.why, lineup, moves: res.ok ? [...cascade, ...res.moves] : [], spareSeat };
}

/** The sentences the Courts page shows before the night, written from the rule text. */
export const offLine = (name, court, absent) => `${name} ${absent ? "is marked absent" : "is not coming"} (Court ${court}).`;
/** p96: the regulars who have not answered, in one line — "Name (Court n)" entries, by court then id, the first eight named. */
export const silentLine = (entries) => `${entries.length} regular${entries.length === 1 ? " has" : "s have"} not answered yet, so they are not in tonight's line-up: ${entries.slice(0, 8).join(", ")}${entries.length > 8 ? ` and ${entries.length - 8} more` : ""}.`;
export const spareLine = (name, court) => `${name} (spare) takes an open seat on Court ${court}.`;
export function moveLine(name, m, nameOf = (id) => `Player ${id}`) {
  if (m.reason === "partner-down" || m.reason === "partner-up") return `${nameOf(m.with)} would be the only player on Court ${m.to} and every other court in use has five, so ${name} moves ${m.reason === "partner-down" ? "down" : "up"} from Court ${m.from} to play there.`;
  if (m.reason === "full") return `Court ${m.from} would have more than ${m.cap === 4 ? "four" : "five"} players, so ${name} starts on Court ${m.to}.`;
  if (m.reason === "alone-up") return `${name} would be the only player on Court ${m.from}, the bottom court in use, so starts on Court ${m.to} above.`;
  return `${name} would be the only player on Court ${m.from}, so starts on Court ${m.to}.`;
}
