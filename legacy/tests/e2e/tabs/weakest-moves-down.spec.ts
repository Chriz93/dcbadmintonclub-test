// p97: an over-full court sends its bottom player down — the fewest wins, then the fewest points scored.
// From the organizer: "if a player was absent and he comes back and say he ended on court 3 last time he played, compare
// the points of current player on court 3, if any player has low score than the drop in player who missed a session the
// least point person moves down". The ranking is the one they gave for p93: wins first, then points scored, never Elo.
// Before this the engine sent down "the last to join" the court — registration order, nothing to do with play — so a
// player coming back to the court they earned lost it every time, whatever their record.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, type League } from "./gen";
import { upcoming } from "./oracle";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

/** A league of `n` regulars, one session played, where `court[i]` is the court player i+1 earned and `wins[id]` the games they won. */
function crowded(seed: number, courts: number[], wins: Record<number, number>, pts: Record<number, number> = {}) {
  const L: League = genLeague(seed, { regulars: courts.length, spares: 0, pending: 0, sessions: 0, live: "none", absentRate: 0, declineRate: 0, dates: ctx.dates });
  L.players.forEach((p, i) => { p.current_court = courts[i]; p.highest_court = courts[i]; p.season_wins = 0; p.season_losses = 0; p.games_played = 0; });
  // One played session whose games give each player exactly the record the case wants: wins at 21-10, then one loss
  // scoring `pts[id]` so that players level on wins are separated by the points they scored.
  const scores: Record<string, unknown> = {}; let g = 0;
  for (const p of L.players) {
    for (let k = 0; k < (wins[p.id] || 0); k++) scores[`c1_y1_g${++g}`] = { a1: p.id, a2: null, b1: 0, b2: null, sA: 21, sB: 10, w: "A" };
    if (pts[p.id] !== undefined) scores[`c1_y2_g${++g}`] = { a1: p.id, a2: null, b1: 0, b2: null, sA: pts[p.id], sB: 21, w: "B" };
  }
  L.sessions = [{ id: 1, number: 1, date: ctx.dates[0], cycle: 2, assignments: {}, initialAssignments: {}, scores, movements: [], completed: true, preTosses: {}, attendance: {}, absentFrom: {} }] as never;
  L.upcoming = 2;
  L.nowMs = ctx.fd[1] - 24 * 3600e3;
  const at = new Date(L.nowMs - 3600e3).toISOString();
  L.rsvps = L.players.map((p) => ({ session_number: 2, player_id: p.id, response: "coming", note: "", updated_at: at })) as League["rsvps"];
  // The statistics columns follow the games, as End Session writes them.
  for (const p of L.players) { p.season_wins = wins[p.id] || 0; p.season_losses = pts[p.id] !== undefined ? 1 : 0; p.games_played = p.season_wins + p.season_losses; }
  return L;
}
const seatOf = (a: Record<string, number[]>, id: number) => [1, 2, 3, 4, 5, 6].find((c) => (a[c] || []).includes(id)) ?? 0;
/** Every court in use: four on Courts 1, 2, 4, 5 and 6, and six earned on Court 3 (ids 9 to 14). */
const LADDER6 = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];

test("six earned one court: the fewest wins moves down, and the court lists strongest first", async () => {
  // Players 1-4 on Court 1, 5-10 on Court 2 (six of them), 11-14 on Court 3. Player 7 has won nothing.
  const courts = [1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3];
  const L = crowded(97001, courts, { 5: 5, 6: 4, 7: 0, 8: 3, 9: 2, 10: 1, 1: 2, 2: 2, 3: 2, 4: 2, 11: 1, 12: 1, 13: 1, 14: 1 });
  await load(ctx, L);
  const page = ctx.page;
  const assign = await page.evaluate(() => upcomingLineup().assign as Record<string, number[]>);
  expect(assign[2].length, "Court 2 is back to five").toBe(5);
  expect(seatOf(assign, 7), "the winless player is the one who moves down").toBe(3);
  expect(assign[2], "strongest first, so the bottom player is the one to move").toEqual([5, 6, 8, 9, 10]);
  // The independent oracle says the same.
  const want = upcoming(L).assign;
  for (let c = 1; c <= 6; c++) expect(assign[c] || [], `Court ${c}`).toEqual(want[c] || []);
  // And the Courts page says why.
  await page.evaluate(() => nav("courts"));
  await expect(page.locator("#lineup-notes-list")).toContainText(`Court 2 would have more than five players, so ${L.players.find((p) => p.id === 7)!.name} starts on Court 3.`);
});

// p105: the rating decides, because it is the only one of these numbers that does not move when a player misses a night.
/** A league whose season is the given singles games, [winner, loser] at 21-10, with attendance marks per session. */
function singlesLeague(seed: number, courts: number[], seasons: [number, number][][], attendance: Record<number, Record<string, string>> = {}) {
  const L: League = genLeague(seed, { regulars: courts.length, spares: 0, pending: 0, sessions: 0, live: "none", absentRate: 0, declineRate: 0, dates: ctx.dates });
  L.players.forEach((p, i) => { p.current_court = courts[i]; p.highest_court = courts[i]; p.season_wins = 0; p.season_losses = 0; p.games_played = 0; });
  L.sessions = seasons.map((games, k) => {
    const scores: Record<string, unknown> = {}; let g = 0;
    for (const [w, l] of games) scores[`c1_y1_g${++g}`] = { a1: w, a2: null, b1: l, b2: null, sA: 21, sB: 10, w: "A" };
    return { id: k + 1, number: k + 1, date: ctx.dates[k], cycle: 1, assignments: {}, initialAssignments: {}, scores, movements: [], completed: true, preTosses: {}, attendance: attendance[k + 1] || {}, absentFrom: {} };
  }) as never;
  L.upcoming = seasons.length + 1;
  L.nowMs = ctx.fd[L.upcoming - 1] - 24 * 3600e3;
  const at = new Date(L.nowMs - 3600e3).toISOString();
  L.rsvps = L.players.map((p) => ({ session_number: L.upcoming, player_id: p.id, response: "coming", note: "", updated_at: at })) as League["rsvps"];
  for (const p of L.players) {
    const w = seasons.flat().filter(([x]) => x === p.id).length, l = seasons.flat().filter(([, y]) => y === p.id).length;
    p.season_wins = w; p.season_losses = l; p.games_played = w + l;
  }
  return L;
}

test("a player back after missing a night keeps the court: the rating, not the games played", async () => {
  // Court 3 is earned by 9 to 14. Player 14 missed Session 1 entirely; 9, 10 and 11 beat 12 and 13 twice over; then 14
  // plays two games in Session 2 and wins both. On season totals 14 is bottom of the court; on rating they are top.
  const L = singlesLeague(97010, LADDER6, [[[9, 12], [9, 13], [10, 12], [10, 13], [11, 12], [11, 13]], [[14, 9], [14, 10]]]);
  await load(ctx, L);
  const page = ctx.page;
  const assign = await page.evaluate(() => upcomingLineup().assign as Record<string, number[]>);
  const gained = await page.evaluate(() => eloEarnedCached() as Record<string, number>);
  expect(assign[3].length, "Court 3 is back to five").toBe(5);
  expect(seatOf(assign, 14), "the player who was away keeps the court they earned").toBe(3);
  for (const id of [9, 10, 11]) expect(seatOf(assign, id), `player ${id} keeps Court 3`).toBe(3);
  const moved = [9, 10, 11, 12, 13, 14].find((id) => seatOf(assign, id) !== 3)!;
  expect(gained[14], "and has earned more than the player who went down, on fewer games").toBeGreaterThan(gained[moved]);
  expect(gained[moved], "who has earned the least on the court").toBe(Math.min(...[9, 10, 11, 12, 13, 14].map((id) => gained[id])));
  // The independent reference says the same.
  const want = upcoming(L).assign;
  for (let c = 1; c <= 6; c++) expect(assign[c] || [], `Court ${c}`).toEqual(want[c] || []);
});

test("a no-show costs 25 rating points, and that is what sends them down", async () => {
  // Nobody has played, so everyone on Court 3 starts level at 1300 — except player 11, who said they were coming to
  // Session 1 and did not turn up.
  const L = singlesLeague(97011, LADDER6, [[]], { 1: { 11: "absent" } });
  await load(ctx, L);
  const page = ctx.page;
  const rate = await page.evaluate(() => eloCached() as Record<string, number>);
  const gained = await page.evaluate(() => eloEarnedCached() as Record<string, number>);
  expect(rate[11], "1300 on Court 3, less 25 for the night they did not turn up").toBe(1275);
  expect(gained[11], "which is 25 off what they have earned this season").toBe(-25);
  expect(rate[12], "everybody else is untouched").toBe(1300);
  expect(gained[12], "and has earned nothing either way").toBe(0);
  const assign = await page.evaluate(() => upcomingLineup().assign as Record<string, number[]>);
  expect(seatOf(assign, 11), "and that is what sends them down from a court of six").toBe(4);
  // Declining in time costs nothing: the player is simply not in the line-up, and their rating is where it was.
  expect(rate[9]).toBe(1300);
  expect(gained[9]).toBe(0);
});

test("a player back from a night off keeps the court they earned when somebody on it is weaker", async () => {
  // Court 3 is earned by five players plus player 14, who missed Session 1 and is back. Player 12 has won nothing.
  const courts = LADDER6;
  const L = crowded(97003, courts, { 9: 5, 10: 4, 11: 3, 12: 0, 13: 2, 14: 1, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2 });
  await load(ctx, L);
  const assign = await ctx.page.evaluate(() => upcomingLineup().assign as Record<string, number[]>);
  expect(seatOf(assign, 14), "the returning player keeps Court 3").toBe(3);
  expect(seatOf(assign, 12), "the weakest on it moves down").toBe(4);
});

test("the returning player with the weakest record is the one who moves — the rule cuts both ways", async () => {
  const courts = LADDER6;
  const L = crowded(97004, courts, { 9: 5, 10: 4, 11: 3, 12: 2, 13: 1, 14: 0, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2 });
  await load(ctx, L);
  const assign = await ctx.page.evaluate(() => upcomingLineup().assign as Record<string, number[]>);
  expect(seatOf(assign, 14), "nobody on Court 3 is below them, so they are the one who moves").toBe(4);
  expect(assign[3]).toEqual([9, 10, 11, 12, 13]);
});

// p102: found here. seasonRecord() cached its answer against each session's id and how many scores it held, so two
// leagues with the same number of games — or one league whose score was corrected — were ranked on the first one's
// numbers until the page was reloaded. These two cases differ only in who won.
test("a league with the same number of games but different winners is ranked on its own games", async () => {
  const courts = LADDER6;
  const a = crowded(97006, courts, { 9: 5, 10: 4, 11: 3, 12: 0, 13: 2, 14: 1, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2 });
  await load(ctx, a);
  expect(seatOf(await ctx.page.evaluate(() => upcomingLineup().assign as Record<string, number[]>), 12), "the winless player moves down").toBe(4);
  const b = crowded(97006, courts, { 9: 5, 10: 4, 11: 3, 12: 2, 13: 1, 14: 0, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2 });
  expect(Object.keys(b.sessions[0].scores).length, "the same number of games as the league before it").toBe(Object.keys(a.sessions[0].scores).length);
  await load(ctx, b);
  expect(seatOf(await ctx.page.evaluate(() => upcomingLineup().assign as Record<string, number[]>), 14), "ranked on its own games, not the previous league's").toBe(4);
});

test("correcting a score changes the order straight away", async () => {
  const courts = LADDER6;
  const L = crowded(97007, courts, { 9: 5, 10: 4, 11: 3, 12: 0, 13: 2, 14: 1, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2 });
  await load(ctx, L);
  const page = ctx.page;
  expect(seatOf(await page.evaluate(() => upcomingLineup().assign as Record<string, number[]>), 12), "the winless player is down").toBe(4);
  // Hand player 12 the five wins and take them off player 9, as a correction through Edit scores would: the same games,
  // the same count, a different result. The order must follow.
  await page.evaluate(() => {
    const sess = S.sessions[0], keys = Object.keys(sess.scores).filter((k) => sess.scores[k].a1 === 9);
    for (const k of keys) sess.scores[k] = { ...sess.scores[k], a1: 12 };
    _seasonRecKey = _seasonRecKey;   // nothing resets the cache: the key itself has to notice
  });
  const rec = await page.evaluate(() => seasonRecord() as Record<string, { w: number }>);
  expect(rec[12].w, "player 12 now has the five wins").toBe(5);
  expect(rec[9], "and player 9 has none").toBeUndefined();
});

test("the Courts page and the Assign board list each court in the same order", async () => {
  const courts = [1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3];
  const L = crowded(97005, courts, { 5: 5, 6: 4, 7: 0, 8: 3, 9: 2, 10: 1 });
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => nav("courts"));
  // The gym view shows first names, in the order the line-up holds them (the net splits the court, not the order).
  const onPage = await page.locator("#court-gym-view .gym-court").nth(1).locator(".gc-player:not(.empty)")
    .evaluateAll((els) => els.map((e) => (e.textContent || "").replace(/[↑↓]/g, "").trim()));
  await page.evaluate(() => { nav("admin"); showSec("admin", "a-assign"); });
  const onBoard = await page.locator('#assign-ui .dnd-court[data-court="2"] .dnd-player').evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-pid"))));
  const names = onBoard.map((id) => L.players.find((p) => p.id === id)!.name.split(" ")[0]);
  expect(onPage.length, "five players on Court 2").toBe(5);
  expect(onPage, "the page and the board agree, in order").toEqual(names);
});
