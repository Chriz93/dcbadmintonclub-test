// p79, from the organizer: "yes break the tie by win rate then court" and "the 6W are on court 5 and then on court 4
// right? shouldnt we mention like that?". Player of the Session is wins × a court bonus (C1 ×1.51 … C4-6 ×1.00) plus
// half the win rate. Level scores are now separated by win rate, then by the higher court, then by id so the banner
// never changes on a redraw; and the banner names every court the player played that night.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";
import fixture from "../fixtures/session-2026-09-16.json";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

/** The rule, worked out here rather than asked of the page. */
function expected(session: any, players: { id: number; name: string }[]) {
  const wins: Record<number, number> = {}, games: Record<number, number> = {}, court: Record<number, number> = {};
  for (const m of session.movements) for (const [id, w] of Object.entries(m.wins || {})) wins[+id] = (wins[+id] || 0) + (w as number);
  const initA = session.initialAssignments || session.assignments;
  for (let c = 1; c <= 6; c++) for (const id of initA[c] || []) if (!court[id]) court[id] = c;
  for (const sc of Object.values<any>(session.scores || {})) for (const id of [sc.a1, sc.a2, sc.b1, sc.b2]) if (id != null) games[id] = (games[id] || 0) + 1;
  const score = (id: number) => {
    const c = court[id] || 6, bonus = c <= 3 ? 1 + (4 - c) * 0.17 : 1;
    return (wins[id] || 0) * bonus + (wins[id] || 0) / (games[id] || 1) * 0.5;
  };
  const rate = (id: number) => (wins[id] || 0) / (games[id] || 1);
  const ids = Object.keys(wins).map(Number);
  ids.sort((a, b) => score(b) - score(a) || rate(b) - rate(a) || (court[a] || 6) - (court[b] || 6) || a - b);
  // p80: players level on score, win rate and court are separated by the night itself — head to head among them,
  // then the points they scored, then the lower id.
  const key = (id: number) => `${score(id).toFixed(6)}|${rate(id).toFixed(6)}|${court[id] || 6}`;
  const tied = ids.filter((id) => key(id) === key(ids[0]));
  let winner = ids[0];
  if (tied.length > 1) {
    const group = new Set(tied), h2h: Record<number, number> = {}, points: Record<number, number> = {};
    for (const id of tied) { h2h[id] = 0; points[id] = 0; }
    for (const sc of Object.values<any>(session.scores)) {
      const A = [sc.a1, sc.a2].filter((x: number | null) => x != null), B = [sc.b1, sc.b2].filter((x: number | null) => x != null);
      for (const id of A) if (group.has(id)) points[id] += sc.sA;
      for (const id of B) if (group.has(id)) points[id] += sc.sB;
      const ga = A.filter((id: number) => group.has(id)), gb = B.filter((id: number) => group.has(id));
      if (!ga.length || !gb.length) continue;
      for (const id of sc.w === "A" ? ga : gb) h2h[id]++;
      for (const id of sc.w === "A" ? gb : ga) h2h[id]--;
    }
    winner = [...tied].sort((a, b) => h2h[b] - h2h[a] || points[b] - points[a] || a - b)[0];
  }
  const courtsPlayed: number[] = [];
  for (let cy = 1; cy <= 2; cy++) for (let c = 1; c <= 6; c++) {
    const on = Object.entries<any>(session.scores).some(([k, sc]) => k.startsWith(`c${c}_y${cy}_`) && [sc.a1, sc.a2, sc.b1, sc.b2].includes(winner));
    if (on && courtsPlayed[courtsPlayed.length - 1] !== c) courtsPlayed.push(c);
  }
  return { winner, name: players.find((p) => p.id === winner)!.name, wins: wins[winner] || 0, games: games[winner] || 0, courtsPlayed };
}

test("the organizer's own night: the banner names the winner and every court they played", async () => {
  const L: League = genLeague(59000, { ...variety(4), regulars: 24, spares: 0, pending: 0, live: "none", sessions: 0, dates: ctx.dates } as GenOpts);
  L.players = fixture.players.map((p) => ({ ...(L.players[0] as any), id: p.id, name: p.name, email: `p${p.id}@example.invalid`, approved: true, waitlisted: false, membership_type: "regular", current_court: 0, highest_court: 0, season_wins: 0, season_losses: 0, games_played: 0, no_show_count: 0 })) as League["players"];
  L.current = fixture.session as any;
  await load(ctx, L);
  const e = expected(fixture.session, fixture.players);
  expect(e.courtsPlayed.length, "the winner moved court that night").toBeGreaterThan(1);
  const pos = ctx.page.locator("#pos-home, #pos-standings").first();
  await ctx.page.evaluate(() => nav("home"));
  await expect(pos, "the winner").toContainText(e.name);
  await expect(pos, "their record").toContainText(`${e.wins}W ${e.games - e.wins}L`);
  await expect(pos, "every court they played, in order").toContainText(`Courts ${e.courtsPlayed.join(" → ")}`);
});

for (let i = 0; i < 4; i++) {
  test(`Player of the session ${String(i + 1).padStart(3, "0")} · the banner matches the rule, ties broken by win rate then court`, async () => {
    const L = genLeague(59100 + i, { ...variety(i + 970), regulars: 12 + i * 2, spares: 0, pending: 0, live: "complete", sessions: i % 2, dates: ctx.dates } as GenOpts);
    test.skip(!L.current || !L.current.movements?.length, "needs a played session");
    await load(ctx, L);
    const sess = (L.sessions.length ? L.sessions[L.sessions.length - 1] : L.current) as any;
    const e = expected(sess, L.players as { id: number; name: string }[]);
    await ctx.page.evaluate(() => nav("home"));
    const pos = ctx.page.locator("#pos-home");
    await expect(pos, "the player the rule picks").toContainText(e.name);
    await expect(pos, "their record").toContainText(`${e.wins}W ${e.games - e.wins}L`);
    const label = e.courtsPlayed.length > 1 ? `Courts ${e.courtsPlayed.join(" → ")}` : `Court ${e.courtsPlayed[0] ?? ""}`;
    if (e.courtsPlayed.length) await expect(pos, "the courts played").toContainText(label);
    // The same league drawn twice names the same player (a tie must not flip between redraws).
    const once = (await pos.innerText()).replace(/\s+/g, " ");
    await ctx.page.evaluate(() => { renderPOS("pos-home"); });
    expect((await pos.innerText()).replace(/\s+/g, " "), "the banner is stable").toBe(once);
  });
}

// p80: a night that really does end level. Seed 59101 leaves two players identical on the weighted score, the win rate
// and the court, so only head to head (then points) can separate them. The banner must crown the head-to-head winner,
// not whoever the plain ordering would have put first.
test("a genuine tie is decided head to head, not by the order players happen to be in", async () => {
  const L = genLeague(59101, { ...variety(971), regulars: 14, spares: 0, pending: 0, live: "complete", sessions: 1, dates: ctx.dates } as GenOpts);
  test.skip(!L.current?.movements?.length, "needs a played session");
  await load(ctx, L);
  const sess = (L.sessions.length ? L.sessions[L.sessions.length - 1] : L.current) as any;

  // Work out the tied group exactly as the rule describes, without asking the page.
  const wins: Record<number, number> = {}, games: Record<number, number> = {}, court: Record<number, number> = {};
  for (const m of sess.movements) for (const [id, w] of Object.entries(m.wins || {})) wins[+id] = (wins[+id] || 0) + (w as number);
  const initA = sess.initialAssignments || sess.assignments;
  for (let c = 1; c <= 6; c++) for (const id of initA[c] || []) if (!court[id]) court[id] = c;
  for (const sc of Object.values<any>(sess.scores || {})) for (const id of [sc.a1, sc.a2, sc.b1, sc.b2]) if (id != null) games[id] = (games[id] || 0) + 1;
  const score = (id: number) => { const c = court[id] || 6, b = c <= 3 ? 1 + (4 - c) * 0.17 : 1; return (wins[id] || 0) * b + (wins[id] || 0) / (games[id] || 1) * 0.5; };
  const rate = (id: number) => (wins[id] || 0) / (games[id] || 1);
  const ids = Object.keys(wins).map(Number).sort((a, b) => score(b) - score(a) || rate(b) - rate(a) || (court[a] || 6) - (court[b] || 6) || a - b);
  const key = (id: number) => `${score(id).toFixed(6)}|${rate(id).toFixed(6)}|${court[id] || 6}`;
  const tied = ids.filter((id) => key(id) === key(ids[0]));
  expect(tied.length, "this seed ends level, so the tie-break is what decides").toBeGreaterThan(1);

  const group = new Set(tied), h2h: Record<number, number> = {}, points: Record<number, number> = {};
  for (const id of tied) { h2h[id] = 0; points[id] = 0; }
  for (const sc of Object.values<any>(sess.scores)) {
    const A = [sc.a1, sc.a2].filter((x: number | null) => x != null), B = [sc.b1, sc.b2].filter((x: number | null) => x != null);
    for (const id of A) if (group.has(id)) points[id] += sc.sA;
    for (const id of B) if (group.has(id)) points[id] += sc.sB;
    const ga = A.filter((id: number) => group.has(id)), gb = B.filter((id: number) => group.has(id));
    if (!ga.length || !gb.length) continue;
    for (const id of sc.w === "A" ? ga : gb) h2h[id]++;
    for (const id of sc.w === "A" ? gb : ga) h2h[id]--;
  }
  const byRule = [...tied].sort((a, b) => h2h[b] - h2h[a] || points[b] - points[a] || a - b)[0];
  const byPlainOrder = tied[0];
  await ctx.page.evaluate(() => nav("home"));
  const banner = ctx.page.locator("#pos-home");
  await expect(banner, "the head-to-head winner is crowned").toContainText(L.players.find((p) => p.id === byRule)!.name);
  if (byRule !== byPlainOrder) {
    const loser = L.players.find((p) => p.id === byPlainOrder)!.name;
    expect((await banner.innerText()).includes(loser), `the tie-break changed the answer away from ${loser}`).toBe(false);
  }
});
