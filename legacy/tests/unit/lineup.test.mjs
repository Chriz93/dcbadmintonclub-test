// Tonight's starting courts (p54), the app's own functions (upcomingLineup, autoAssign, spareSeats… loaded straight out of
// index.html) against the independent reference (starting-reference.mjs): everyone who is coming keeps the court they
// earned, declines and absences marked before the night never promote anyone, confirmed spares fill open seats from the
// bottom, and courts of one or of more than five are settled as at the gym. 20 named situations (the first is the one the
// organizer found on TEST) and 200 generated leagues.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-app.mjs";
import { startingCourts, offLine, spareLine, moveLine } from "./starting-reference.mjs";
import { rng } from "./adjust-reference.mjs";

// p69: spare seats are decided when the regulars' vote closes (46 hours before play). The page's clock is fixed after
// that deadline (Monday evening before the Tuesday session), so confirmed spares are seated as on the night.
const START = Date.parse("2026-09-15T20:00:00-04:00"), NOW = Date.parse("2026-09-14T18:00:00-04:00");
const FIXED_DATE = class extends Date { static now() { return NOW; } };
const { api } = load(["activePlayers", "isRegularMember", "isSpareMember", "spareSeats", "paidForSession", "autoAssign", "upcomingLineup", "organizerSeated", "seatingProblem"], { _lineupNotes: [], _lineupProblem: "", S_me:{organizer:true},FEES:{spareSession:20,voteDeadlineHours:46},FD:[new Date(START)],Date:FIXED_DATE,upcomingSessionNumber:()=>1 });
const sorted = (a) => Object.fromEntries([1, 2, 3, 4, 5, 6].map((c) => [c, [...(a[c] || [])].sort((x, y) => x - y)]));

/** A league: players [{id, name, court, spare?, approved?, waitlisted?}], votes {id: response} in answer order, pre {id: present|absent}. */
function run(players, votes = {}, pre = {}) {
  const S = {
    players: players.map((p) => ({ id: p.id, name: p.name ?? `P${p.id}`, currentCourt: p.court, membershipType: p.spare ? "spare" : "regular", approved: p.approved ?? true, waitlisted: !!p.waitlisted })),
    rsvp: { ...votes }, rsvpRows: Object.entries(votes).map(([id, response], i) => ({ player_id: +id, response, updated_at: `2026-09-10T12:${String(i).padStart(2, "0")}:00Z` })),
    preAttendance: pre, current: null, payments:players.filter(p=>p.spare).map(p=>({player_id:p.id,kind:"spare",session_number:1,amount:20})),
  };
  api.setS(S);
  return api.upcomingLineup();
}
/** What the rules say, worked out here: who is off, which spares are confirmed (answer order, up to 24 players; p69), then the reference. */
function expected(players, votes = {}, pre = {}) {
  const byId = (id) => players.find((p) => p.id === id), name = (id) => byId(id)?.name ?? `P${id}`;
  const isReg = (p) => p && (p.approved ?? true) && !p.waitlisted && !p.spare, isSpare = (p) => p && (p.approved ?? true) && p.spare;
  const absent = new Set(players.filter((p) => pre[p.id] === "absent").map((p) => p.id));
  const declined = new Set(players.filter((p) => isReg(p) && votes[p.id] === "notcoming" && pre[p.id] !== "present" && !absent.has(p.id)).map((p) => p.id));
  // p69: spare seats fill the courts up to 24 players: 24 minus the regulars coming (those the starting courts seat).
  const earned = players.filter((p) => p.court > 0 && isReg(p) && !declined.has(p.id) && !absent.has(p.id)).map((p) => ({ id: p.id, court: p.court }));
  const seats = Math.max(0, 24 - earned.length);
  const spares = Object.entries(votes).filter(([id, r]) => r === "coming" && isSpare(byId(+id))).map(([id]) => +id).slice(0, seats).filter((id) => !absent.has(id));
  const ref = startingCourts(earned, spares);
  const off = players.filter((p) => p.court > 0 && !isSpare(p) && (declined.has(p.id) || absent.has(p.id))).sort((a, b) => a.court - b.court || a.id - b.id).map((p) => offLine(name(p.id), p.court, absent.has(p.id)));
  const notes = ref.ok ? [...off, ...spares.filter((id) => ref.spareSeat[id]).map((id) => spareLine(name(id), ref.spareSeat[id])), ...ref.moves.map((m) => moveLine(name(m.id), m, name))] : [...off, ...spares.filter((id) => ref.spareSeat[id]).map((id) => spareLine(name(id), ref.spareSeat[id]))];
  return { ref, notes, lineup: Object.fromEntries([1, 2, 3, 4, 5, 6].map((c) => [c, ref.lineup[c]])) };
}
function check(players, votes, pre, extra = () => {}) {
  const got = run(players, votes, pre), want = expected(players, votes, pre);
  assert.deepEqual(sorted(got.assign), sorted(want.lineup), "who starts where");
  assert.equal(!got.problem, want.ref.ok, `a valid night (${got.problem || "no problem"})`);
  if (want.ref.ok) assert.deepEqual(got.notes, want.notes, "what the Courts page says");
  extra(got, want);
  return got;
}
const courtOf = (a, id) => [1, 2, 3, 4, 5, 6].find((c) => (a[c] || []).includes(id)) ?? 0;
const ladder = (sizes, start = 1, spares = 0) => { const out = []; let id = start; sizes.forEach((n, i) => { for (let k = 0; k < n; k++) out.push({ id: id++, court: i + 1 }); }); for (let k = 0; k < spares; k++) out.push({ id: id++, court: 0, spare: true }); return out; };
const coming = (players, not = [], spares = []) => Object.fromEntries([...players.filter((p) => !p.spare).map((p) => [p.id, not.includes(p.id) ? "notcoming" : "coming"]), ...spares.map((id) => [id, "coming"])]);

// ── Named situations ────────────────────────────────────────────────────────────────────────────────────────────────
test("lineup · the TEST situation: two declines and two spares move nobody up; Court 6 keeps its three and gains a spare", () => {
  const names = ["Avery", "Blake", "Casey", "Devon", "Emery", "Finley", "Gray", "Harper", "Indigo", "Jordan", "Kai", "Logan", "Morgan", "Noel", "Oakley", "Parker", "Quinn", "Reese", "Sage", "Taylor", "Uma", "Vale", "Wren", "Xen", "Yael"];
  const players = ladder([4, 4, 4, 4, 3, 3], 1, 3).map((p, i) => ({ ...p, name: `${names[i]} Test` }));
  const got = check(players, { ...coming(players, [7, 15]), 23: "coming", 24: "coming" }, {});
  const at = (c) => got.assign[c].map((id) => names[id - 1]).sort();
  assert.deepEqual(at(1), ["Avery", "Blake", "Casey", "Devon"]); assert.deepEqual(at(2), ["Emery", "Finley", "Harper"]);
  assert.deepEqual(at(3), ["Indigo", "Jordan", "Kai", "Logan"]); assert.deepEqual(at(4), ["Morgan", "Noel", "Parker"]);
  assert.deepEqual(at(5), ["Quinn", "Reese", "Sage", "Xen"]); assert.deepEqual(at(6), ["Taylor", "Uma", "Vale", "Wren"]);
  assert.deepEqual(got.notes, ["Gray Test is not coming (Court 2).", "Oakley Test is not coming (Court 4).", "Wren Test (spare) takes an open seat on Court 6.", "Xen Test (spare) takes an open seat on Court 5."]);
});
test("lineup · nobody declines and no spares: the starting courts are exactly the earned courts, with nothing to explain", () => {
  const players = ladder([4, 4, 4, 4, 4, 4]);
  const got = check(players, coming(players));
  for (const p of players) assert.equal(courtOf(got.assign, p.id), p.court);
  assert.deepEqual(got.notes, []);
});
test("lineup · a decline leaves the bottom court with one player: they join the court above", () => {
  const players = ladder([4, 4, 4, 4, 4, 2]);   // Court 6: players 21 and 22
  const got = check(players, coming(players, [22]));
  assert.equal(courtOf(got.assign, 21), 5); assert.deepEqual(got.assign[6], []);
});
test("lineup · a decline leaves Court 3 with one player: they join the court below", () => {
  const players = ladder([4, 4, 2, 4, 4, 4]);
  const got = check(players, coming(players, [10]));
  assert.equal(courtOf(got.assign, 9), 4);
});
test("lineup · a court left with one player gets the spares first, so nobody has to move", () => {
  const players = ladder([4, 4, 4, 4, 4, 3], 1, 2);
  const got = check(players, { ...coming(players, [22, 23]), 24: "coming", 25: "coming" });
  assert.deepEqual([...got.assign[6]].sort((a, b) => a - b), [21, 24, 25]);
});
test("lineup · six earned on one court (a no-show came down): the extra player starts on the nearest court below with room", () => {
  const players = [...ladder([4, 4, 6, 3, 4, 4])];
  const got = check(players, coming(players));
  assert.equal(got.assign[3].length, 5); assert.equal(got.assign[4].length, 4);
});
test("lineup · everyone on Court 2 declines: Court 2 stays empty and nobody from Court 3 moves up", () => {
  const players = ladder([4, 4, 4, 4, 4, 4]);
  const got = check(players, coming(players, [5, 6, 7, 8]));
  assert.deepEqual(got.assign[2], []);
  for (const p of players.filter((x) => x.court !== 2)) assert.equal(courtOf(got.assign, p.id), p.court);
});
test("lineup · 31 players coming: no valid night, and the reason is given", () => {
  const players = ladder([6, 5, 5, 5, 5, 5]);
  const got = check(players, coming(players));
  assert.match(got.problem, /players need a court/);
});
test("lineup · exactly one player coming: no valid night", () => {
  const players = ladder([4]);
  const got = check(players, coming(players, [1, 2, 3]));
  assert.ok(got.problem);
});
test("lineup · nobody coming: nobody is seated", () => {
  const players = ladder([4, 4]);
  const got = check(players, coming(players, [1, 2, 3, 4, 5, 6, 7, 8]));
  assert.deepEqual(Object.values(got.assign).flat(), []);
});
test("lineup · a spare with no open seat (nobody declined) is not seated", () => {
  const players = ladder([4, 4, 4, 4, 4, 4], 1, 1);
  const got = check(players, { ...coming(players), 25: "coming" });
  assert.equal(courtOf(got.assign, 25), 0);
});
test("lineup · three spares and one decline: only the first to answer is seated, in the seat the decline left", () => {
  const players = ladder([4, 4, 4, 4, 4, 4], 1, 3);   // player 1 (Court 1) declines: Court 1 is the only court short of four
  const got = check(players, { 25: "coming", 26: "coming", 27: "coming", ...coming(players, [1]) });
  assert.deepEqual([25, 26, 27].map((id) => courtOf(got.assign, id)), [1, 0, 0]);
});
test("lineup · a player marked absent before the night leaves their court like a decline, and the note says so", () => {
  const players = ladder([4, 4, 4, 4, 4, 4]);
  const got = check(players, coming(players), { 9: "absent" });
  assert.equal(courtOf(got.assign, 9), 0); assert.ok(got.notes.includes("P9 is marked absent (Court 3)."));
});
test("lineup · a player who declined but is marked present is seated on their earned court", () => {
  const players = ladder([4, 4, 4, 4, 4, 4]);
  const got = check(players, coming(players, [9]), { 9: "present" });
  assert.equal(courtOf(got.assign, 9), 3);
});
test("lineup · a spare fills the lowest short court first", () => {
  const players = ladder([4, 4, 4, 4, 4, 4], 1, 1);
  const got = check(players, { ...coming(players, [13, 21]), 25: "coming" });
  assert.equal(courtOf(got.assign, 25), 6);
});
test("lineup · with every court in use at four, a spare becomes the fifth player on the bottom court in use", () => {
  const players = ladder([4, 4, 4, 4, 4], 1, 1).concat([{ id: 30, court: 5 }]);
  const got = check(players, { ...coming(players, [30]), 21: "coming" });
  assert.equal(courtOf(got.assign, 21), 5); assert.equal(got.assign[5].length, 5);
});
test("lineup · regulars with no earned court yet, waitlisted and unapproved players are not seated", () => {
  const players = [...ladder([4, 4]), { id: 50, court: 0 }, { id: 51, court: 1, waitlisted: true }, { id: 52, court: 2, approved: false }];
  const got = check(players, coming(players));
  for (const id of [50]) assert.equal(courtOf(got.assign, id), 0);
});
test("lineup · the same league gives the same starting courts every time", () => {
  const players = ladder([4, 3, 4, 5, 2, 4], 1, 2), votes = { ...coming(players, [3, 12]), 23: "coming", 24: "coming" };
  assert.deepEqual(sorted(run(players, votes).assign), sorted(run(players, votes).assign));
});
test("lineup · Court 1 left with one player: they join Court 2 below", () => {
  const players = ladder([2, 4, 4, 4, 4, 4]);
  const got = check(players, coming(players, [1]));
  assert.equal(courtOf(got.assign, 2), 2);
});

test("lineup · Court 1 left with one player while Court 2 already has five: they start on Court 3, the next court below with room", () => {
  const players = ladder([2, 5, 4, 4, 4, 4]);   // Court 1: players 1 and 2
  const got = check(players, coming(players, [1]));
  assert.equal(courtOf(got.assign, 2), 3); assert.equal(got.assign[2].length, 5); assert.equal(got.assign[3].length, 5);
});

// ── A lone player when every other court in use has five (p55): never refused ────────────────────────────────────────
test("lineup · the interop situation: Court 1 left with one player, Court 2 has five and nothing else is in use — Court 2's first player moves up, and the night is not refused", () => {
  const players = ladder([2, 5]);   // Court 1: 1, 2 · Court 2: 3–7
  const got = check(players, coming(players, [1]));
  assert.equal(got.problem, ""); assert.deepEqual(sorted(got.assign)[1], [2, 3]); assert.deepEqual(sorted(got.assign)[2], [4, 5, 6, 7]);
  assert.ok(got.notes.includes("P2 would be the only player on Court 1 and every other court in use has five, so P3 moves up from Court 2 to play there."), got.notes.join(" | "));
});
test("lineup · the bottom court left with one player and every court above has five: the court above sends its last player down", () => {
  const players = ladder([5, 5, 2]);   // Court 3: 11, 12
  const got = check(players, coming(players, [12]));
  assert.equal(got.problem, ""); assert.deepEqual(sorted(got.assign)[3], [10, 11]); assert.equal(got.assign[2].length, 4);
  assert.ok(got.notes.includes("P11 would be the only player on Court 3 and every other court in use has five, so P10 moves down from Court 2 to play there."), got.notes.join(" | "));
});
test("lineup · a lone player with full courts at the same distance above and below: the court above sends its last player down", () => {
  const players = ladder([5, 0, 2, 0, 5]);   // Court 1: 1–5 · Court 3: 6, 7 · Court 5: 8–12
  const got = check(players, coming(players, [7]));
  assert.equal(got.problem, ""); assert.deepEqual(sorted(got.assign)[3], [5, 6]); assert.equal(got.assign[5].length, 5);
});
test("lineup · a lone player whose nearest full court is below: that court's first player moves up", () => {
  const players = ladder([5, 0, 0, 2, 5]);   // Court 1: 1–5 · Court 4: 6, 7 · Court 5: 8–12
  const got = check(players, coming(players, [7]));
  assert.equal(got.problem, ""); assert.deepEqual(sorted(got.assign)[4], [6, 8]); assert.equal(got.assign[1].length, 5);
});
test("lineup · the only two players coming are on different courts: they play together, and the night is not refused", () => {
  const players = ladder([2, 0, 0, 0, 0, 2]);   // Court 1: 1, 2 · Court 6: 3, 4
  const got = check(players, coming(players, [2, 4]));   // players 1 and 3 come
  assert.equal(got.problem, ""); assert.equal(Object.values(got.assign).filter((ids) => ids.length).length, 1);
});
// 300 generated leagues with uneven earned courts (0 to 7 on a court, gaps, no-shows): the night is refused exactly when
// fewer than two or more than thirty players are coming, and otherwise every court is a real game (2 to 5 players).
for (let i = 0; i < 300; i++) {
  const r = rng(79000 + i), int = (n) => Math.floor(r() * n);
  const sizes = [1, 2, 3, 4, 5, 6].map(() => (r() < 0.2 ? 0 : int(8))), nSpare = int(4);
  const players = ladder(sizes, 1, nSpare), regs = players.filter((p) => !p.spare);
  const not = regs.filter(() => r() < 0.12).map((p) => p.id);
  const votes = { ...Object.fromEntries(players.filter((p) => p.spare && r() < 0.7).map((p) => [p.id, "coming"])), ...coming(players, not) };
  test(`lineup · never stuck ${String(i + 1).padStart(3, "0")} · earned ${sizes.join(" ")} · ${not.length} not coming · ${nSpare} spares`, () => {
    const got = check(players, votes, {});
    const n = Object.values(got.assign).flat().length;
    assert.equal(!got.problem, n >= 2 && n <= 30, `${n} players coming: ${got.problem || "a valid night"}`);
    if (!got.problem) for (let c = 1; c <= 6; c++) assert.ok(got.assign[c].length !== 1 && got.assign[c].length <= 5, `Court ${c}: ${got.assign[c].length} players`);
  });
}

// ── 200 generated leagues ───────────────────────────────────────────────────────────────────────────────────────────
for (let i = 0; i < 200; i++) {
  const r = rng(77000 + i), int = (n) => Math.floor(r() * n);
  const nReg = 2 + int(28), nSpare = int(5), mode = ["ladder", "scattered", "gap", "no-shows"][i % 4];
  const players = [];
  for (let k = 1; k <= nReg; k++) {
    let court = mode === "scattered" ? 1 + int(6) : Math.min(6, 1 + Math.floor((k - 1) / 4));
    if (mode === "gap" && court >= 3) court = Math.min(6, court + 1);
    if (mode === "no-shows" && r() < 0.15) court = Math.min(6, court + 1);
    players.push({ id: k, court, approved: r() > 0.03, waitlisted: r() < 0.03 });
  }
  for (let k = 0; k < nSpare; k++) players.push({ id: 100 + k, court: 0, spare: true });
  const votes = {};
  for (const p of [...players].sort(() => r() - 0.5)) { const x = r(); if (!p.spare) votes[p.id] = x < 0.15 ? "notcoming" : x < 0.95 ? "coming" : undefined; else if (x < 0.7) votes[p.id] = "coming"; }
  for (const k of Object.keys(votes)) if (votes[k] === undefined) delete votes[k];
  const pre = {}; for (const p of players) { const x = r(); if (x < 0.04) pre[p.id] = "absent"; else if (x < 0.07 && votes[p.id] === "notcoming") pre[p.id] = "present"; }
  const shape = [1, 2, 3, 4, 5, 6].map((c) => players.filter((p) => p.court === c && !p.spare).length).join(" ");
  test(`lineup · generated ${String(i + 1).padStart(3, "0")} · ${mode} · earned ${shape} · ${nSpare} spares`, () => {
    const got = check(players, votes, pre);
    const flat = Object.values(got.assign).flat();
    assert.equal(new Set(flat).size, flat.length, "nobody on two courts");
    if (!got.problem) for (let c = 1; c <= 6; c++) assert.ok(got.assign[c].length !== 1 && got.assign[c].length <= 5, `Court ${c}: ${got.assign[c].length} players`);
  });
}
