// The attendance-adjustment rules, written a second time from the rule text and independently of index.html, so the
// tests compare the app's engine against something it did not produce. Deliberately plain: each rule is a separate
// pass over a copy of the courts, in the order the rules are listed to the organizer.
//
//   1. Absent players leave their court — unless the court already has scores this round (then it stays as it is).
//   2. A player who is back returns to their own court if it is open, has no scores this round and has room (< 5).
//   3. Everyone on an unavailable court, returning players who could not go home, and the latest arrivals on a court of
//      more than five are placed one by one: the nearest court below that is open and in use with room; if there is
//      none and at least one more player is still to be placed, the nearest free open court below (they start it
//      together); otherwise the nearest court above that is open and in use with room; last, any free open court.
//   4. A late player moves to the next court in use below, unless: already the bottom court in use, that court has
//      scores, it already holds five, or the move would leave one player alone. Then the player stays.
//   5. A court left with one player sends that player to the next court in use below with room; on the bottom court
//      in use, to the nearest one above.
//   Refused (nothing changes): more players than the open courts hold, exactly one player in total, a player with
//   nowhere to go, or closing a court that already has scores.
export const NC = 6, MAX = 5;

export function reference(inp) {
  const nc = inp.nc || NC;
  const courts = [];
  const seen = new Set();
  for (let c = 1; c <= nc; c++) courts[c] = (inp.lineup?.[c] || []).map(Number).filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
  const start = courts.map((x) => (x ? [...x] : x));
  const locked = new Set((inp.locked || []).map(Number)), closed = new Set((inp.closed || []).map(Number));
  const refuse = (why) => ({ ok: false, why, lineup: start, moves: [], removed: [], seated: [], skippedLate: [], lockedAbsent: [] });
  const isOpen = (c) => c >= 1 && c <= nc && !locked.has(c) && !closed.has(c);
  const size = (c) => courts[c].length;
  const courtOf = (id) => courts.findIndex((x, c) => c >= 1 && x.includes(id));

  for (const c of closed) if (locked.has(c) && size(c) > 0) return refuse("closing a court with scores");

  const removed = [], lockedAbsent = [];
  for (const id of (inp.absent || []).map(Number)) {
    const c = courtOf(id);
    if (c < 1) continue;
    if (locked.has(c)) { lockedAbsent.push({ id, c }); continue; }
    courts[c] = courts[c].filter((x) => x !== id);
    removed.push({ id, from: c });
  }

  const seated = [], queue = [];
  for (const r of inp.returning || []) {
    const id = Number(r.id), home = Number(r.court);
    if (courtOf(id) >= 1 || (inp.absent || []).map(Number).includes(id)) continue;
    if (isOpen(home) && size(home) < MAX) { courts[home].push(id); seated.push({ id, to: home }); }
    else queue.push({ id, from: home >= 1 && home <= nc ? home : nc + 1, reason: !(home >= 1 && home <= nc) ? "back" : locked.has(home) ? "back-locked" : closed.has(home) ? "back-closed" : "back-full" });
  }
  for (const c of [...closed].sort((a, b) => a - b)) { for (const id of courts[c]) queue.push({ id, from: c, reason: "closed" }); courts[c] = []; }
  for (let c = 1; c <= nc; c++) {
    if (locked.has(c) || size(c) <= MAX) continue;
    const keep = courts[c].slice(0, MAX), extra = courts[c].slice(MAX);
    courts[c] = keep;
    for (const id of extra) queue.push({ id, from: c, reason: "full" });
  }

  let people = 0, room = 0;
  for (let c = 1; c <= nc; c++) { people += size(c); room += closed.has(c) ? 0 : locked.has(c) ? size(c) : MAX; }
  people += queue.length;
  if (people > room) return refuse("capacity");
  if (people === 1) return refuse("one player");

  const moves = [];
  const downFrom = (from) => { const xs = []; for (let x = from + 1; x <= nc; x++) xs.push(x); return xs; };
  const upFrom = (from) => { const xs = []; for (let x = Math.min(from, nc + 1) - 1; x >= 1; x--) xs.push(x); return xs; };
  const hasRoom = (x) => isOpen(x) && size(x) > 0 && size(x) < MAX, isFree = (x) => isOpen(x) && size(x) === 0;
  for (let i = 0; i < queue.length; i++) {
    const q = queue[i], stillToPlace = queue.length - i;
    let to = downFrom(q.from).find(hasRoom);
    if (to === undefined && stillToPlace >= 2) to = downFrom(q.from).find(isFree);
    if (to === undefined) to = upFrom(q.from).find(hasRoom);
    if (to === undefined) to = downFrom(q.from).find(isFree) ?? upFrom(q.from).find(isFree);
    if (to === undefined) return refuse("no room");
    courts[to].push(q.id);
    moves.push({ id: q.id, from: q.from <= nc ? q.from : 0, to, reason: q.reason });
  }

  // Why a late player stayed: their court has scores (locked), there is no court in use below (bottom), the court below
  // has scores (below-locked) or five players (below-full), or moving would leave one player alone (alone).
  const skippedLate = [];
  for (const id of (inp.late || []).map(Number)) {
    const c = courtOf(id);
    if (c < 1) { skippedLate.push({ id, c: 0, why: "not-seated" }); continue; }
    if (locked.has(c)) { skippedLate.push({ id, c, why: "locked" }); continue; }
    let below = 0;
    for (let x = c + 1; x <= nc; x++) if (!closed.has(x) && size(x) > 0) { below = x; break; }
    const why = !below ? "bottom" : locked.has(below) ? "below-locked" : size(below) >= MAX ? "below-full" : size(c) === 2 ? "alone" : "";
    if (why) { skippedLate.push({ id, c, why, below, other: courts[c].find((x) => x !== id) }); continue; }
    courts[c] = courts[c].filter((x) => x !== id);
    courts[below].push(id);
    moves.push({ id, from: c, to: below, reason: "late" });
  }

  for (let c = 1; c <= nc; c++) {
    if (!isOpen(c) || size(c) !== 1) continue;
    const id = courts[c][0];
    let to = 0;
    for (let x = c + 1; x <= nc && !to; x++) if (isOpen(x) && size(x) > 0 && size(x) < MAX) to = x;
    for (let x = c - 1; x >= 1 && !to; x--) if (isOpen(x) && size(x) > 0 && size(x) < MAX) to = x;
    if (!to) return refuse("alone");
    courts[c] = [];
    courts[to].push(id);
    moves.push({ id, from: c, to, reason: to > c ? "alone" : "alone-up" });
  }

  const lineup = {};
  for (let c = 1; c <= nc; c++) lineup[c] = courts[c];
  return { ok: true, lineup, moves, removed, seated, skippedLate, lockedAbsent };
}

/** Sorted copy of a lineup, for comparing who is on each court regardless of order within the court. */
export const members = (L, nc = NC) => Object.fromEntries(Array.from({ length: nc }, (_, i) => [String(i + 1), [...(L[i + 1] || L[String(i + 1)] || [])].map(Number).sort((a, b) => a - b)]));

/** Courts hold four; above 24 the extras are fifth players on Court 6, then 5, then 4…; a single leftover below 24
 *  joins the court above it as a fifth player. Written from the rule text. */
export function sizesFor(n, nc = NC) {
  const s = Array(nc + 1).fill(0);
  if (n > nc * 4) { const extra = Math.min(n - nc * 4, nc); for (let c = 1; c <= nc; c++) s[c] = 4 + (c > nc - extra ? 1 : 0); return s; }
  let left = n, c = 1;
  while (left > 0 && c <= nc) { s[c] = Math.min(4, left); left -= s[c]; c++; }
  const last = c - 1;
  if (last > 1 && s[last] === 1) { s[last - 1] += 1; s[last] = 0; }
  return s;
}
/** A lineup seated by the rule above, ids 1..n in ladder order. */
export function initialLineup(n, nc = NC) {
  const s = sizesFor(n, nc), L = {}; let id = 1;
  for (let c = 1; c <= nc; c++) { L[c] = []; for (let k = 0; k < s[c]; k++) L[c].push(id++); }
  return L;
}
/** Seeded random numbers (mulberry32). */
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
