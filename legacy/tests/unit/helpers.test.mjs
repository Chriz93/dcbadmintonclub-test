// Unit tests for the small page functions this release added or changed, loaded straight out of index.html (the shipped
// code): the CSV cell guard for waiver exports, shuttlecocks per court, the seating refusals, the games a court plays
// (best of three), the ladder's "next court in use", the waiver fingerprint and league-time formatting.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { load } from "./load-app.mjs";

const { api } = load(["csvCell", "birdsAllotted", "seatingProblem", "courtGames", "courtInUse", "courtAbove", "courtBelow", "hasPlayersBelow", "bestOfThreeDecided", "gamesNeeded", "sha256Hex", "tzTime"], { LEAGUE_TZ: "America/Toronto" });
const players = (ids) => ids.map((id) => ({ id, name: `P${id}` }));
const session = (assignments, scores = {}, cycle = 1) => api.setS({ players: players([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), current: { cycle, assignments, scores } });
const win = (w) => ({ w, sA: w === "A" ? 21 : 10, sB: w === "A" ? 10 : 21 });

// ── CSV cells: a spreadsheet must never run a formula typed into a name, and commas, quotes and line breaks stay inside the cell
for (const [label, input, want] of [
  ["empty (null)", null, ""], ["empty (undefined)", undefined, ""], ["plain text", "Ana Diaz", "Ana Diaz"], ["a comma", "Diaz, Ana", '"Diaz, Ana"'],
  ["quotes", 'say "hi"', '"say ""hi"""'], ["a line break", "two\nlines", '"two\nlines"'], ["a formula (=)", "=SUM(A1:A9)", "'=SUM(A1:A9)"],
  ["a leading plus", "+14165550100", "'+14165550100"], ["a leading minus", "-5", "'-5"], ["a leading @", "@SUM(1)", "'@SUM(1)"], ["a leading tab", "\tcmd", "'\tcmd"],
  ["a leading carriage return (guarded and quoted)", "\rcmd", "\"'\rcmd\""], ["a formula with quotes and commas", '=HYPERLINK("http://x","y")', '"\'=HYPERLINK(""http://x"",""y"")"'],
  ["a number", 42, "42"], ["accents and symbols", "Zoë Ōta — ☕", "Zoë Ōta — ☕"], ["an equals sign that is not first", "1=1", "1=1"],
]) test(`csvCell · ${label}`, () => assert.equal(api.csvCell(input), want));

// ── Shuttlecocks: two per player on a court that can play; none for a court of one or none
for (const [n, want] of [[0, 0], [1, 0], [2, 4], [3, 6], [4, 8], [5, 10]]) test(`birdsAllotted · ${n} player${n === 1 ? "" : "s"} → ${want}`, () => assert.equal(api.birdsAllotted(n), want));

// ── Start Session refusals
const NOBODY = "Nobody is coming — a game needs at least two players. Start the session when players are coming.";
const ONE = "Only one player is coming — a game needs at least two. Start the session when another player is coming.";
const cap = (n) => `${n} players are coming, but the 6 courts seat at most 30. Mark someone absent or not coming, then start the session.`;
for (const [n, want] of [[0, NOBODY], [1, ONE], [2, ""], [24, ""], [25, ""], [30, ""], [31, cap(31)], [40, cap(40)]]) test(`seatingProblem · ${n} coming`, () => assert.equal(api.seatingProblem(n), want));

// ── Games per court
for (const [n, want] of [[2, 3], [3, 3], [4, 3], [5, 5]]) test(`courtGames · ${n} players play ${want} games`, () => assert.equal(api.courtGames(n), want));
test("gamesNeeded · a court of two with no scores plays up to three", () => { session({ 1: [1, 2] }); assert.equal(api.gamesNeeded(1, 1), 3); });
test("gamesNeeded · a court of two after one game still needs up to three", () => { session({ 1: [1, 2] }, { c1_y1_g1: win("A") }); assert.equal(api.gamesNeeded(1, 1), 3); });
test("gamesNeeded · a court of two after a 2–0 for side A is done in two", () => { session({ 1: [1, 2] }, { c1_y1_g1: win("A"), c1_y1_g2: win("A") }); assert.equal(api.bestOfThreeDecided(1, 1), true); assert.equal(api.gamesNeeded(1, 1), 2); });
test("gamesNeeded · a court of two after a 2–0 for side B is done in two", () => { session({ 1: [1, 2] }, { c1_y1_g1: win("B"), c1_y1_g2: win("B") }); assert.equal(api.gamesNeeded(1, 1), 2); });
test("gamesNeeded · a court of two at 1–1 plays Game 3", () => { session({ 1: [1, 2] }, { c1_y1_g1: win("A"), c1_y1_g2: win("B") }); assert.equal(api.bestOfThreeDecided(1, 1), false); assert.equal(api.gamesNeeded(1, 1), 3); });
test("gamesNeeded · only Game 2 saved is not a decided match", () => { session({ 1: [1, 2] }, { c1_y1_g2: win("A") }); assert.equal(api.gamesNeeded(1, 1), 3); });
test("gamesNeeded · a 2–0 in round 1 does not shorten round 2", () => { session({ 1: [1, 2] }, { c1_y1_g1: win("A"), c1_y1_g2: win("A") }, 2); assert.equal(api.gamesNeeded(1, 2), 3); });
test("gamesNeeded · without a round, the session's current round is used", () => { session({ 1: [1, 2] }, { c1_y2_g1: win("A"), c1_y2_g2: win("A") }, 2); assert.equal(api.gamesNeeded(1), 2); });
test("gamesNeeded · a 2–0 on another court does not shorten this one", () => { session({ 1: [1, 2], 2: [3, 4] }, { c2_y1_g1: win("A"), c2_y1_g2: win("A") }); assert.equal(api.gamesNeeded(1, 1), 3); });
test("gamesNeeded · three players always play three singles games", () => { session({ 1: [1, 2, 3] }, { c1_y1_g1: win("A"), c1_y1_g2: win("A") }); assert.equal(api.gamesNeeded(1, 1), 3); });
test("gamesNeeded · four players play three games", () => { session({ 1: [1, 2, 3, 4] }); assert.equal(api.gamesNeeded(1, 1), 3); });
test("gamesNeeded · five players play five games", () => { session({ 1: [1, 2, 3, 4, 5] }); assert.equal(api.gamesNeeded(1, 1), 5); });
test("gamesNeeded · a court of one or none plays nothing", () => { session({ 1: [1], 2: [] }); assert.equal(api.gamesNeeded(1, 1), 0); assert.equal(api.gamesNeeded(2, 1), 0); });
test("gamesNeeded · a removed player is not counted: one real player left plays nothing", () => { session({ 1: [1, 999] }); assert.equal(api.gamesNeeded(1, 1), 0); });

// ── The ladder's "next court in use" (the rotation and the late rule move to it, skipping empty courts)
const lineupOf = (mask) => Object.fromEntries([1, 2, 3, 4, 5, 6].map((c) => [c, mask & (1 << (c - 1)) ? [c * 2 - 1, c * 2] : []]));
test("courtAbove and courtBelow · every one of the 64 patterns of courts in use, against a brute-force search", () => {
  for (let mask = 0; mask < 64; mask++) {
    const a = lineupOf(mask); session(a);
    for (let c = 1; c <= 6; c++) {
      const up = [c - 1, c - 2, c - 3, c - 4, c - 5].find((x) => x >= 1 && mask & (1 << (x - 1))) ?? 0;
      const down = [c + 1, c + 2, c + 3, c + 4, c + 5].find((x) => x <= 6 && mask & (1 << (x - 1))) ?? 0;
      assert.equal(api.courtAbove(c, a), up, `above Court ${c}, pattern ${mask.toString(2)}`);
      assert.equal(api.courtBelow(c, a), down, `below Court ${c}, pattern ${mask.toString(2)}`);
      assert.equal(api.hasPlayersBelow(c), down > 0);
    }
  }
});
test("courtAbove · Court 1 has nothing above", () => { session(lineupOf(63)); assert.equal(api.courtAbove(1), 0); });
test("courtBelow · the bottom court in use has nothing below, even when it is not Court 6", () => { session(lineupOf(0b000111)); assert.equal(api.courtBelow(3), 0); });
test("courtBelow · skips one empty court", () => { session(lineupOf(0b000101)); assert.equal(api.courtBelow(1), 3); assert.equal(api.courtAbove(3), 1); });
test("courtBelow · skips two empty courts", () => { session(lineupOf(0b100001)); assert.equal(api.courtBelow(1), 6); assert.equal(api.courtAbove(6), 1); });
test("courtInUse · a court holding only removed players counts as empty", () => { session({ 1: [1, 2], 2: [998, 999], 3: [5, 6] }); assert.equal(api.courtInUse(S_lineup(), 2), false); assert.equal(api.courtBelow(1), 3); });
function S_lineup() { return { 1: [1, 2], 2: [998, 999], 3: [5, 6] }; }
test("courtAbove · a lineup passed in is used instead of the session's", () => { session(lineupOf(63)); assert.equal(api.courtAbove(4, lineupOf(0b000001)), 1); assert.equal(api.courtBelow(1, lineupOf(0b100001)), 6); });

// ── The waiver fingerprint: SHA-256 of exactly the words shown, the same as the database computes
const node = (t) => createHash("sha256").update(t, "utf8").digest("hex");
test("sha256Hex · the empty text", async () => assert.equal(await api.sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"));
test("sha256Hex · the standard 'abc' test vector", async () => assert.equal(await api.sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
test("sha256Hex · accents, dashes and symbols are hashed as UTF-8", async () => assert.equal(await api.sha256Hex("Zoë — ☕ “waiver”"), node("Zoë — ☕ “waiver”")));
test("sha256Hex · a Windows line ending gives a different fingerprint from a plain one", async () => { const a = await api.sha256Hex("a\r\nb"), b = await api.sha256Hex("a\nb"); assert.notEqual(a, b); assert.equal(a, node("a\r\nb")); });
test("sha256Hex · a long waiver-sized text", async () => { const t = "PLEASE READ CAREFULLY.\n".repeat(4000); assert.equal(await api.sha256Hex(t), node(t)); });

// ── League time on waiver records (Ottawa, with the daylight-saving name)
test("tzTime · a summer acceptance shows Eastern Daylight Time", () => { const s = api.tzTime("2026-07-01T16:00:00Z"); assert.match(s, /July 1, 2026/); assert.match(s, /12:00:00\s?p\.m\./); assert.match(s, /EDT/); });
test("tzTime · a winter acceptance shows Eastern Standard Time", () => { const s = api.tzTime("2026-01-15T16:00:00Z"); assert.match(s, /January 15, 2026/); assert.match(s, /11:00:00\s?a\.m\./); assert.match(s, /EST/); });
test("tzTime · just after midnight UTC is still the previous evening in Ottawa", () => { const s = api.tzTime("2026-09-16T01:30:00Z"); assert.match(s, /September 15, 2026/); assert.match(s, /9:30:00\s?p\.m\./); });
