// Unit tests for the attendance adjustment engine in index.html (adjustCourts and friends), checked against the
// independent reference in adjust-reference.mjs and against invariants that hold whatever the input.
//   Exhaustive: every absence pattern for every league size up to 12, and bounded combinations of late players,
//   locked courts, unavailable courts and returning players.  Property-based: 300 seeded random rounds per property
//   per league size 13–30.  Scenarios: each rule the organizer reads, one test per case.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-app.mjs";
import { reference, members, initialLineup, sizesFor, rng } from "./adjust-reference.mjs";

const { api } = load(["courtSizes", "fillCourts", "courtGames", "courtTarget", "birdsAllotted", "validScore", "buildCombos", "seatingProblem"]);
const { adjustCourts, validateLineup, explainAdjust, adjFormat, adjCount } = api;
const NAMES = new Proxy({}, { get: (_, k) => `P${String(k)}` });
const nm = (id) => `P${id}`;
const run = (inp) => adjustCourts({ nc: 6, names: NAMES, ...inp });
const clone = (x) => JSON.parse(JSON.stringify(x));
const combos = function* (arr, k, start = 0, pick = []) { if (pick.length === k) { yield [...pick]; return; } for (let i = start; i < arr.length; i++) { pick.push(arr[i]); yield* combos(arr, k, i + 1, pick); pick.pop(); } };
const subsets = function* (arr) { for (let m = 0; m < 1 << arr.length; m++) yield arr.filter((_, i) => m & (1 << i)); };
const used = (L) => [1, 2, 3, 4, 5, 6].filter((c) => (L[c] || []).length);

// ── Invariants every result must satisfy ──
function invariants(inp, res) {
  const f = [], locked = new Set(inp.locked || []), closed = new Set(inp.closed || []), absent = new Set(inp.absent || []);
  const before = inp.lineup;
  if (!res.ok) {
    if (JSON.stringify(members(res.lineup)) !== JSON.stringify(members(before))) f.push("a refusal changed the courts");
    if (!res.problem || !/[.!]$/.test(res.problem)) f.push(`a refusal needs a full-sentence reason (got ${JSON.stringify(res.problem)})`);
    return f;
  }
  const L = res.lineup, where = new Map();
  for (let c = 1; c <= 6; c++) for (const id of L[c] || []) { if (where.has(id)) f.push(`P${id} is on two courts`); where.set(id, c); }
  for (let c = 1; c <= 6; c++) {
    const n = (L[c] || []).length;
    if (!locked.has(c) && n === 1) f.push(`Court ${c} left with one player`);
    if (n > 5) f.push(`Court ${c} has ${n} players`);
    if (closed.has(c) && n) f.push(`unavailable Court ${c} still has players`);
  }
  for (const c of locked) if (JSON.stringify([...(L[c] || [])].sort()) !== JSON.stringify([...(before[c] || [])].sort())) f.push(`locked Court ${c} changed`);
  for (const id of absent) { const c = where.get(id); if (c && !locked.has(c)) f.push(`absent P${id} still on Court ${c}`); }
  for (let c = 1; c <= 6; c++) for (const id of before[c] || []) if ((!absent.has(id) || locked.has(c)) && !where.has(id)) f.push(`P${id} was dropped`);
  for (const r of inp.returning || []) if (!absent.has(r.id) && !where.has(r.id)) f.push(`returning P${r.id} not seated`);
  const known = new Set([...Object.values(before).flat(), ...(inp.returning || []).map((r) => r.id)]);
  for (const id of where.keys()) if (!known.has(id)) f.push(`P${id} appeared from nowhere`);
  return f;
}
const same = (a, b) => JSON.stringify(members(a)) === JSON.stringify(members(b));
function agree(inp, res) {
  const ref = reference(inp);
  if (ref.ok !== res.ok) return `engine ok=${res.ok} (${res.problem}), reference ok=${ref.ok} (${ref.why})`;
  if (!ref.ok) return "";
  if (!same(res.lineup, ref.lineup)) return `courts differ: engine ${JSON.stringify(members(res.lineup))} reference ${JSON.stringify(members(ref.lineup))}`;
  const key = (m) => `${m.id}:${m.from}>${m.to}`;
  const a = res.moves.map(key).sort().join(" "), b = ref.moves.map(key).sort().join(" ");
  if (a !== b) return `moves differ: engine [${a}] reference [${b}]`;
  return "";
}
const judge = (inp) => { const res = run(clone(inp)); return [...invariants(inp, res), agree(inp, res)].filter(Boolean); };

// ═══ EXHAUSTIVE ═══
// Every set of absent players, for every league size 0–12 seated by the ladder rule; one test per size and number absent.
for (let n = 0; n <= 12; n++) {
  const L = initialLineup(n), ids = Object.values(L).flat();
  for (let k = 0; k <= n; k++) {
    test(`exhaustive · ${n} players seated by the ladder rule · every way ${k} can be absent`, () => {
      let cases = 0;
      for (const absent of combos(ids, k)) { const inp = { lineup: L, absent }; const f = judge(inp); assert.deepEqual(f, [], `absent ${absent}: ${f.join("; ")}`); cases++; }
      assert.ok(cases >= 1);
    });
  }
}
// One late player and one absent player, every pair, league sizes 2–10.
for (let n = 2; n <= 10; n++) test(`exhaustive · ${n} players · every late player with every other player absent`, () => {
  const L = initialLineup(n), ids = Object.values(L).flat();
  for (const late of ids) for (const ab of [null, ...ids.filter((x) => x !== late)]) { const inp = { lineup: L, late: [late], absent: ab ? [ab] : [] }; const f = judge(inp); assert.deepEqual(f, [], `late ${late} absent ${ab}: ${f.join("; ")}`); }
});
// Every set of courts with scores this round, with each single absence, league sizes 4–12.
for (let n = 4; n <= 12; n++) test(`exhaustive · ${n} players · every set of courts with scores, every single absence`, () => {
  const L = initialLineup(n), ids = Object.values(L).flat();
  for (const locked of subsets(used(L))) for (const ab of ids) { const inp = { lineup: L, locked, absent: [ab] }; const f = judge(inp); assert.deepEqual(f, [], `locked ${locked} absent ${ab}: ${f.join("; ")}`); }
});
// Each single unavailable court, alone and with each single absence, league sizes 2–16.
for (let n = 2; n <= 16; n++) test(`exhaustive · ${n} players · each unavailable court, with and without each single absence`, () => {
  const L = initialLineup(n), ids = Object.values(L).flat();
  for (let c = 1; c <= 6; c++) for (const ab of [null, ...ids]) { const inp = { lineup: L, closed: [c], absent: ab ? [ab] : [] }; const f = judge(inp); assert.deepEqual(f, [], `closed ${c} absent ${ab}: ${f.join("; ")}`); }
});
// A player taken off earlier comes back (to their own court), with every other single absence, league sizes 4–12.
for (let n = 4; n <= 12; n++) test(`exhaustive · ${n} players · a player who was off comes back, with every other single absence`, () => {
  const L = initialLineup(n), ids = Object.values(L).flat();
  for (const back of ids) {
    const home = Object.keys(L).map(Number).find((c) => L[c].includes(back)), off = clone(L); off[home] = off[home].filter((x) => x !== back);
    for (const ab of [null, ...ids.filter((x) => x !== back)]) { const inp = { lineup: off, returning: [{ id: back, court: home }], absent: ab ? [ab] : [] }; const f = judge(inp); assert.deepEqual(f, [], `back ${back}→${home} absent ${ab}: ${f.join("; ")}`); }
  }
});

// ═══ PROPERTY-BASED (seeded) ═══
function randomRound(r, n) {
  let sizes;
  for (let t = 0; t < 20000; t++) { sizes = Array.from({ length: 6 }, () => [0, 2, 3, 4, 4, 4, 5][Math.floor(r() * 7)]); if (sizes.reduce((a, b) => a + b, 0) === n) break; sizes = null; }
  const s = sizes || sizesFor(n).slice(1), L = {}; let id = 1;
  for (let c = 1; c <= 6; c++) { L[c] = []; for (let k = 0; k < s[c - 1]; k++) L[c].push(id++); }
  const all = Object.values(L).flat(), pick = (p) => all.filter(() => r() < p);
  const locked = used(L).filter(() => r() < 0.2), closed = [1, 2, 3, 4, 5, 6].filter((c) => !locked.includes(c) && r() < 0.08);
  const returning = r() < 0.4 ? Array.from({ length: 1 + Math.floor(r() * 3) }, (_, i) => ({ id: 100 + i, court: 1 + Math.floor(r() * 6) })) : [];
  return { lineup: L, absent: pick(0.15), late: pick(0.08), locked, closed, returning };
}
const PROPS = {
  "no player is dropped, duplicated or invented": (inp, res) => (res.ok ? invariants(inp, res).filter((x) => /dropped|two courts|nowhere|not seated/.test(x)) : []),
  "absent players are off every court without scores": (inp, res) => (res.ok ? invariants(inp, res).filter((x) => /absent/.test(x)) : []),
  "every court without scores has none or two to five players; unavailable courts are empty": (inp, res) => (res.ok ? invariants(inp, res).filter((x) => /one player|players$|unavailable/.test(x)) : []),
  "courts with scores this round keep exactly their players": (inp, res) => (res.ok ? invariants(inp, res).filter((x) => /locked/.test(x)) : []),
  "courts no change touched keep their players in the same order": (inp, res) => {
    if (!res.ok) return [];
    const touched = new Set([...res.removed.map((x) => x.from), ...res.seated.map((x) => x.to), ...res.moves.flatMap((m) => [m.from, m.to])]);
    return [1, 2, 3, 4, 5, 6].filter((c) => !touched.has(c) && JSON.stringify(res.lineup[c]) !== JSON.stringify(inp.lineup[c] || [])).map((c) => `Court ${c} changed without a reason`);
  },
  "nobody moves up unless forced (lone player on the bottom court in use, or no room below)": (inp, res) => (res.ok ? res.moves.filter((m) => m.from && m.to < m.from && !["alone-up", "closed", "full", "back-full", "back-locked", "back-closed", "back"].includes(m.reason)).map((m) => `P${m.id} promoted (${m.reason})`) : []),
  "every changed player gets exactly one explanation line": (inp, res) => {
    if (!res.ok) return [];
    const lines = explainAdjust(res, nm).slice(0, adjCount(res)), f = [];
    const ids = [...res.removed.map((x) => x.id), ...res.seated.map((x) => x.id), ...res.moves.map((x) => x.id)];
    if (lines.length !== ids.length) f.push(`${lines.length} lines for ${ids.length} changes`);
    ids.forEach((id, i) => { if (!lines[i] || !lines[i].includes(`P${id} `)) f.push(`line ${i + 1} does not name P${id}`); });
    return f;
  },
  "adjusting again after applying changes nothing": (inp, res) => {
    if (!res.ok) return [];
    const again = run({ lineup: res.lineup, absent: inp.absent, locked: inp.locked, closed: inp.closed });
    return again.ok && !again.changed && !again.moves.length && !again.removed.length ? [] : [`second adjust: ok=${again.ok} changed=${again.changed} ${again.problem || ""}`];
  },
  "a refusal changes nothing and says why": (inp, res) => (res.ok ? [] : invariants(inp, res)),
  "the result matches the reference model court by court": (inp, res) => { const m = agree(inp, res); return m && !/^moves differ/.test(m) ? [m] : []; },
  "only the moves the reference model needs are made": (inp, res) => { const m = agree(inp, res); return m && /^moves differ/.test(m) ? [m] : []; },
};
Object.entries(PROPS).forEach(([name, prop], pi) => {
  for (let n = 13; n <= 30; n++) test(`property · ${n} players · ${name}`, () => {
    const r = rng(9000 + pi * 100 + n);
    for (let i = 0; i < 300; i++) { const inp = randomRound(r, n), res = run(clone(inp)); const f = prop(inp, res); assert.deepEqual(f, [], `case ${i}: ${JSON.stringify(inp)} → ${f.join("; ")}`); }
  });
});

// ═══ SCENARIOS: the rules as the organizer reads them ═══
const L24 = initialLineup(24), L26 = initialLineup(26);
const sc = (name, fn) => test(`scenario · ${name}`, fn);
// Formats
const P = (ids) => ids.map((id) => ({ id, name: `P${id}` }));
sc("four players play doubles: three games, every player in every game, each partnership once", () => {
  const g = api.buildCombos(P([1, 2, 3, 4])); assert.equal(g.length, 3);
  for (const x of g) assert.deepEqual([x.a1, x.a2, x.b1, x.b2].sort(), [1, 2, 3, 4]);
  assert.deepEqual(g.map((x) => [x.a1, x.a2].sort().join("+")).sort(), ["1+2", "1+3", "1+4"]);
});
sc("three players play three singles games, each against the other two", () => {
  const g = api.buildCombos(P([1, 2, 3])); assert.deepEqual(g.map((x) => [x.a1, x.b1].sort().join("v")).sort(), ["1v2", "1v3", "2v3"]);
  assert.ok(g.every((x) => x.a2 === null && x.b2 === null));
});
sc("two players play singles, the same pair each game, at most three games", () => {
  const g = api.buildCombos(P([1, 2])); assert.equal(g.length, 3); assert.ok(g.every((x) => x.a1 === 1 && x.b1 === 2 && x.a2 === null));
});
sc("five players play five doubles games and each player sits out exactly once", () => {
  const g = api.buildCombos(P([1, 2, 3, 4, 5])); assert.equal(g.length, 5);
  assert.deepEqual(g.map((x) => x.rest).sort(), [1, 2, 3, 4, 5]);
  for (const x of g) assert.deepEqual([x.a1, x.a2, x.b1, x.b2, x.rest].sort(), [1, 2, 3, 4, 5]);
});
sc("five players: every pair of players are partners exactly once", () => {
  const pairs = api.buildCombos(P([1, 2, 3, 4, 5])).flatMap((x) => [[x.a1, x.a2], [x.b1, x.b2]].map((p) => p.sort().join("+")));
  assert.equal(new Set(pairs).size, 10);
});
sc("games go to 15 on a court of five and 21 otherwise; a court of five plays five games, others three", () => {
  assert.deepEqual([2, 3, 4, 5].map(api.courtTarget), [21, 21, 21, 15]);
  assert.deepEqual([2, 3, 4, 5].map(api.courtGames), [3, 3, 3, 5]);
});
for (const [n, w] of [["2", "best of three singles"], ["3", "three singles games"], ["4", "three doubles games to 21"], ["5", "five doubles games to 15, each player sits out one"], ["0", "not in use"]])
  sc(`the format named for a court of ${n}: ${w}`, () => assert.equal(adjFormat(+n), w));
// Initial allocation (ranking): one test per league size 0–30
for (let n = 0; n <= 30; n++) sc(`initial seating of ${n} players by ladder rank: ${sizesFor(n).slice(1).join("-")}`, () => {
  const s = api.courtSizes(n); assert.deepEqual([1, 2, 3, 4, 5, 6].map((c) => s[c]), sizesFor(n).slice(1));
  const a = api.fillCourts(Array.from({ length: n }, (_, i) => i + 1));
  assert.deepEqual(Object.values(a).flat(), Array.from({ length: n }, (_, i) => i + 1), "seated in ladder order, nobody skipped");
  // One player can't make a game: Start Session refuses instead of seating them alone (every other size is a valid night).
  // Nobody coming is refused like one player (p45: a night needs at least two players).
  if (n === 0) assert.equal(api.seatingProblem(0), "Nobody is coming — a game needs at least two players. Start the session when players are coming.");
  else if (n === 1) assert.match(api.seatingProblem(1), /^Only one player is coming — a game needs at least two/);
  else { assert.equal(api.seatingProblem(n), ""); for (let c = 1; c <= 6; c++) assert.ok(a[c].length === 0 || (a[c].length >= 2 && a[c].length <= 5), `Court ${c}: ${a[c].length}`); }
});
sc("25 to 27 players: the fifth players go to Court 6, then Court 5, then Court 4", () => {
  assert.deepEqual([25, 26, 27].map((n) => { const s = api.courtSizes(n); return [4, 5, 6].map((c) => s[c]).join(""); }), ["445", "455", "555"]);
});
// Shuttlecocks: two per player
for (let n = 0; n <= 6; n++) sc(`a court of ${n} starts with ${n >= 2 ? 2 * n : 0} shuttlecocks`, () => assert.equal(api.birdsAllotted(n), n >= 2 ? 2 * n : 0));
// Finished games
for (const [a, b, T, ok] of [[21, 19, 21, true], [21, 0, 21, true], [0, 21, 21, true], [22, 20, 21, false], [20, 18, 21, false], [21, 21, 21, false], [-1, 21, 21, false], [15, 13, 15, true], [16, 14, 15, false], [21, 15, 15, false], [15, 15, 15, false], [NaN, 21, 21, false]])
  sc(`a game of ${a}–${b} to ${T} is ${ok ? "finished" : "refused"}`, () => assert.equal(!!api.validScore(a, b, T).ok, ok));
// Attendance edge cases
sc("nobody present: every court empties and the note says nobody is left to play", () => {
  const all = Object.values(L24).flat(), res = run({ lineup: L24, absent: all });
  assert.ok(res.ok); assert.equal(Object.values(res.lineup).flat().length, 0); assert.ok(res.notes.includes("Nobody is left to play this round."));
});
sc("one player present: refused (a game needs two) and nothing changes", () => {
  const all = Object.values(L24).flat(), res = run({ lineup: L24, absent: all.slice(1) });
  assert.equal(res.ok, false); assert.match(res.problem, /Only one player/); assert.ok(same(res.lineup, L24));
});
sc("two players left on different courts: the upper one joins the lower one (best of three), nobody promoted", () => {
  const all = Object.values(L24).flat(), keep = [3, 22], res = run({ lineup: L24, absent: all.filter((x) => !keep.includes(x)) });
  assert.ok(res.ok); assert.deepEqual(members(res.lineup)["6"], [3, 22]);
});
sc("one absence on a court of four: that court plays singles with three, no other court changes", () => {
  const res = run({ lineup: L24, absent: [5] }); assert.deepEqual(res.moves, []); assert.equal(res.lineup[2].length, 3);
  for (const c of [1, 3, 4, 5, 6]) assert.deepEqual(res.lineup[c], L24[c]);
  assert.ok(res.notes.includes("Court 2 now has 3 players: three singles games."));
});
sc("two absences on one court: the two left play best of three, nobody moves", () => { const res = run({ lineup: L24, absent: [5, 6] }); assert.deepEqual(res.moves, []); assert.equal(res.lineup[2].length, 2); });
sc("three absences on a middle court: the lone player joins the next court below as its fifth player", () => {
  const res = run({ lineup: L24, absent: [5, 6, 7] }); assert.deepEqual(res.moves, [{ id: 8, from: 2, to: 3, reason: "alone" }]); assert.equal(res.lineup[3].length, 5);
  assert.match(explainAdjust(res, nm).join(" "), /P8 was the only player left on Court 2, so joins Court 3/);
});
sc("three absences on the bottom court: the lone player joins the court above (nobody plays alone)", () => {
  const res = run({ lineup: L24, absent: [21, 22, 23] }); assert.deepEqual(res.moves, [{ id: 24, from: 6, to: 5, reason: "alone-up" }]);
});
sc("several short courts are left as they are: each plays singles, nobody is consolidated", () => {
  const res = run({ lineup: L24, absent: [1, 9, 10, 17] }); assert.deepEqual(res.moves, []); assert.deepEqual([1, 3, 5].map((c) => res.lineup[c].length), [3, 2, 3]);
});
sc("a whole court absent: that court sits empty and nobody from below is promoted", () => {
  const res = run({ lineup: L24, absent: [9, 10, 11, 12] }); assert.deepEqual(res.moves, []); assert.equal(res.lineup[3].length, 0); assert.deepEqual(res.lineup[4], L24[4]);
});
sc("26 players with fifth players on Courts 5 and 6: an absence on Court 1 leaves the fifth players where they are", () => {
  const res = run({ lineup: L26, absent: [1] }); assert.deepEqual(res.moves, []); assert.deepEqual([5, 6].map((c) => res.lineup[c].length), [5, 5]);
});
sc("an absent player on a court that already has scores stays listed there, with a note", () => {
  const res = run({ lineup: L24, absent: [5], locked: [2] }); assert.ok(res.ok); assert.ok(res.lineup[2].includes(5)); assert.match(res.notes.join(" "), /Court 2 already has scores/);
});
sc("a player who is back returns to their own court", () => {
  const off = clone(L24); off[3] = [9, 10, 11]; const res = run({ lineup: off, returning: [{ id: 12, court: 3 }] });
  assert.deepEqual(res.seated, [{ id: 12, to: 3 }]); assert.match(explainAdjust(res, nm)[0], /P12 is back — returns to Court 3/);
});
sc("a player who is back to a full court plays on the nearest court with room — below first, here Court 6 is full too, so Court 4", () => {
  const full = clone(L26); full[5] = [...full[5].filter((x) => x !== 21), 90]; const res = run({ lineup: full, returning: [{ id: 21, court: 5 }] });
  assert.deepEqual([res.moves[0].reason, res.moves[0].from, res.moves[0].to], ["back-full", 5, 4]);
  assert.match(explainAdjust(res, nm).join(" "), /P21 is back, but Court 5 is full, so plays on Court 4\./);
});
sc("a player who is back to a court with scores plays below it, and the reason is given", () => {
  const off = clone(L24); off[3] = [9, 10, 11]; const res = run({ lineup: off, returning: [{ id: 12, court: 3 }], locked: [3] });
  assert.deepEqual([res.moves[0].reason, res.moves[0].to], ["back-locked", 4]); assert.match(explainAdjust(res, nm).join(" "), /already has scores this round, so plays on Court 4/);
});
sc("a player who is back when every court is full is refused, nothing changes", () => {
  const L30 = initialLineup(30), res = run({ lineup: L30, returning: [{ id: 99, court: 2 }] }); assert.equal(res.ok, false); assert.match(res.problem, /31 players need a court/);
});
sc("an unavailable court: its players fill the courts below, and the last two start the next free court together", () => {
  const res = run({ lineup: initialLineup(16), closed: [2] }); assert.ok(res.ok); assert.equal(res.lineup[2].length, 0);
  assert.deepEqual(res.moves.map((m) => [m.id, m.to]), [[5, 3], [6, 4], [7, 5], [8, 5]]); assert.deepEqual([3, 4, 5].map((c) => res.lineup[c].length), [5, 5, 2]);
});
sc("an unavailable court when the next court below is free: its players move there together", () => {
  const res = run({ lineup: initialLineup(16), closed: [4] }); assert.ok(res.ok); assert.deepEqual(res.moves.map((m) => m.to), [5, 5, 5, 5]); assert.deepEqual(res.lineup[5], [13, 14, 15, 16]);
});
sc("the bottom court unavailable with 24 players: its players become fifth players on the courts above, nearest first", () => {
  const res = run({ lineup: L24, closed: [6] }); assert.ok(res.ok); assert.deepEqual(res.moves.map((m) => m.to), [5, 4, 3, 2]);
});
sc("closing a court that already has scores is refused", () => { const res = run({ lineup: L24, closed: [2], locked: [2] }); assert.equal(res.ok, false); assert.match(res.problem, /can't be closed now/); });
sc("more players than the available courts hold is refused (31 on six courts)", () => { const res = run({ lineup: { ...initialLineup(30) }, returning: [{ id: 31, court: 6 }] }); assert.equal(res.ok, false); });
sc("more players than the available courts hold is refused (21 players, two courts unavailable)", () => { const res = run({ lineup: initialLineup(21), closed: [5, 6] }); assert.equal(res.ok, false); assert.match(res.problem, /hold at most 20/); });
sc("a court of six (after a manual change): the last to join moves to the court below", () => {
  const L = clone(L24); L[2] = [...L[2], 90, 91]; const res = run({ lineup: L }); assert.deepEqual(res.moves.map((m) => [m.id, m.reason, m.to]), [[91, "full", 3]]);
});
// Late arrivals
sc("late on a middle court: moves down one court", () => { const res = run({ lineup: L24, late: [5] }); assert.deepEqual(res.moves, [{ id: 5, from: 2, to: 3, reason: "late" }]); assert.equal(explainAdjust(res, nm)[0], "P5 arrived late — moves down from Court 2 to Court 3."); });
sc("late on the bottom court in use: stays there", () => { const res = run({ lineup: L24, late: [22] }); assert.deepEqual(res.moves, []); assert.deepEqual(res.skippedLate, [{ id: 22, c: 6, why: "bottom" }]); assert.match(res.notes[0], /already on the bottom court in use \(Court 6\)/); });
sc("late when the court below already has five: stays", () => { const res = run({ lineup: L26, late: [17] }); assert.equal(res.skippedLate[0].why, "below-full"); });
sc("late when moving would leave one player alone: stays", () => { const L = clone(L24); L[2] = [5, 6]; const res = run({ lineup: L, late: [5] }); assert.deepEqual(res.skippedLate, [{ id: 5, c: 2, why: "alone" }]); assert.match(res.notes[0], /would leave P6 alone on Court 2/); });
sc("late on a court that already has scores: stays", () => { const res = run({ lineup: L24, late: [5], locked: [2] }); assert.equal(res.skippedLate[0].why, "locked"); });
sc("late when the court below already has scores: stays", () => { const res = run({ lineup: L24, late: [5], locked: [3] }); assert.equal(res.skippedLate[0].why, "below-locked"); });
sc("late with an empty court below: moves to the next court in use", () => { const L = clone(L24); L[3] = []; const res = run({ lineup: L, late: [5] }); assert.deepEqual(res.moves, [{ id: 5, from: 2, to: 4, reason: "late" }]); });
sc("two late players on one court: the first moves down, then that court holds five, so the second stays", () => {
  const res = run({ lineup: L24, late: [5, 6] }); assert.deepEqual(res.moves.map((m) => [m.id, m.to]), [[5, 3]]); assert.deepEqual(res.skippedLate, [{ id: 6, c: 2, why: "below-full" }]);
  assert.match(res.notes.join(" "), /P6 arrived late, but Court 3 already has five players, so P6 stays on Court 2\./);
});
sc("two late players on courts with room below both move down one court", () => { const res = run({ lineup: initialLineup(16), late: [5, 9] }); assert.deepEqual(res.moves.map((m) => [m.id, m.from, m.to]), [[5, 2, 3], [9, 3, 4]]); });
sc("a player marked both late and absent is treated as absent", () => { const res = run({ lineup: L24, late: [5], absent: [5] }); assert.deepEqual(res.removed, [{ id: 5, from: 2 }]); assert.deepEqual(res.moves, []); });
// Engine hygiene
sc("the engine never changes the lineup it was given", () => { const L = clone(L24), copy = clone(L); run({ lineup: L, absent: [1, 2, 3], late: [9] }); assert.deepEqual(L, copy); });
sc("a player listed on two courts is kept on the first one only", () => { const L = clone(L24); L[3] = [...L[3], 1]; const res = run({ lineup: L }); assert.equal(Object.values(res.lineup).flat().filter((x) => x === 1).length, 1); });
sc("without names, players are called 'Player <number>' in the explanation", () => { const res = adjustCourts({ nc: 6, lineup: L24, absent: [5] }); assert.equal(explainAdjust(res, (id) => `Player ${id}`)[0], "Player 5 is absent — off Court 2."); });
sc("nothing to change: ok, not changed, no moves", () => { const res = run({ lineup: L24 }); assert.deepEqual([res.ok, res.changed, res.moves.length, res.removed.length], [true, false, 0, 0]); });
sc("adjCount counts removals, returns and moves, and is zero for a refusal", () => { assert.equal(adjCount(run({ lineup: L24, absent: [5, 6, 7] })), 4); assert.equal(adjCount({ ok: false }), 0); });
// validateLineup messages
for (const [name, L, o, re] of [
  ["a court of one", { 1: [1] }, {}, /one player/], ["a court of six", { 1: [1, 2, 3, 4, 5, 6] }, {}, /at most five/], ["a player on two courts", { 1: [1, 2], 2: [1, 3] }, {}, /two courts/],
  ["a changed court with scores", { 1: [1, 2, 3] }, { locked: new Set([1]), before: { 1: [1, 2, 4] } }, /already has scores/], ["players on an unavailable court", { 1: [1, 2] }, { closed: new Set([1]) }, /unavailable/],
  ["a player left without a court", { 1: [1, 2] }, { expect: new Set([1, 2, 3]) }, /without a court/]])
  sc(`validateLineup reports ${name}`, () => assert.match(validateLineup(L, { nc: 6, nm, ...o })[0] || "", re));
sc("thirty players can start a session; thirty-one are refused with the reason", () => {
  assert.equal(api.seatingProblem(30), ""); assert.equal(api.seatingProblem(31), "31 players are coming, but the 6 courts seat at most 30. Mark someone absent or not coming, then start the session.");
});
