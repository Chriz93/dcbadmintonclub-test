// The rating, written from the rule text and independently of index.html. Used by the unit tests and, through
// helpers.ts, by the browser tests.
//   * Everyone starts from the court they FIRST played on this season: 1500 on Court 1, 100 fewer for each court below.
//     A player who has not played yet starts from the court they hold. A starting number the organizer set for a
//     drop-in replaces that, and only the start (p99).
//   * Within a round every rating is frozen; a team's expectation is taken from the two ratings' average, and a player's
//     rating moves by 32 × (their mean result minus their mean expectation) over the round (K = 32).
//   * p105: a player marked absent on the night — which only a player who said they were coming can be — loses
//     NO_SHOW_PENALTY points for that night, after the round's games are counted.
export const NO_SHOW_PENALTY = 25;

/** The court each player first played on this season, from the score keys (round order, then court order). */
export function firstCourts(sessions) {
  const first = {};
  for (const sess of sessions) {
    const keys = Object.keys(sess.scores || {}).map((k) => { const m = k.match(/^c(\d+)_y(\d+)_g/); return m ? { k, c: +m[1], y: +m[2] } : null; })
      .filter(Boolean).sort((a, b) => a.y - b.y || a.c - b.c);
    for (const { k, c } of keys) { const sc = sess.scores[k]; for (const id of [sc.a1, sc.a2, sc.b1, sc.b2]) if (id != null && first[id] === undefined) first[id] = c; }
  }
  return first;
}

/** `players` need id, current_court (and, for who to seed, games_played / season_wins). `applyUpTo` limits how many
 *  sessions are PLAYED OUT; the seeding always reads the whole list (p84). `seeds` are the organizer's own numbers. */
export function eloReference(players, sessions, applyUpTo, seeds) {
  const elo = {};
  const first = firstCourts(sessions);
  for (const p of players) if (p.current_court > 0 || p.games_played > 0 || p.season_wins > 0) {
    const seed = first[p.id] ?? (p.current_court > 0 && p.current_court <= 6 ? p.current_court : 6);
    elo[p.id] = 1500 - (seed - 1) * 100;
  }
  // p84: seed everyone the season's scores name, including a spare called in before End Session writes their court.
  for (const [id, c] of Object.entries(first)) if (elo[+id] === undefined) elo[+id] = 1500 - (c - 1) * 100;
  for (const [id, v] of Object.entries(seeds || {})) if (Number.isFinite(Number(v))) elo[+id] = Number(v); // p99
  const r = (id) => elo[id] ?? 1000;
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  for (const sess of (applyUpTo === undefined ? sessions : sessions.slice(0, Math.max(0, applyUpTo)))) {
    const cycles = [...new Set(Object.keys(sess.scores || {}).map((k) => parseInt(k.match(/_y(\d+)_/)[1])))].sort((a, b) => a - b);
    for (const cy of cycles) {
      const sum = {}, cnt = {};
      for (const [k, sc] of Object.entries(sess.scores)) {
        if (!k.includes(`_y${cy}_`) || (sc.w !== "A" && sc.w !== "B")) continue;
        const A = [sc.a1, sc.a2].filter((x) => x != null), B = [sc.b1, sc.b2].filter((x) => x != null);
        if (!A.length || !B.length) continue;
        const ea = 1 / (1 + Math.pow(10, (avg(B.map(r)) - avg(A.map(r))) / 400));
        for (const id of A) { sum[id] = (sum[id] || 0) + ((sc.w === "A" ? 1 : 0) - ea); cnt[id] = (cnt[id] || 0) + 1; }
        for (const id of B) { sum[id] = (sum[id] || 0) + ((sc.w === "B" ? 1 : 0) - (1 - ea)); cnt[id] = (cnt[id] || 0) + 1; }
      }
      for (const id of Object.keys(sum).map(Number)) elo[id] = r(id) + 32 * (sum[id] / cnt[id]);
    }
    // p105: the no-show, after the night's games.
    for (const [id, v] of Object.entries(sess.attendance || {})) if (v === "absent") elo[+id] = r(+id) - NO_SHOW_PENALTY;
  }
  return Object.fromEntries(Object.entries(elo).map(([k, v]) => [k, Math.round(v)]));
}
