// p83, from the organizer pasting what Copy Summary produced: "the data is wrong, please double check, also check
// share to messenger". It counted every win twice (season total + the current round again: Shivam read 9W from six
// games), said "3 Rounds Played" for a two-round night, and listed next week's courts as the night's final standings.
// Share to Messenger sends the same text. This checks the summary against the session's own record.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";
import fixture from "../fixtures/session-2026-09-16.json";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

test("the organizer's own night: every figure in the summary matches the session record", async () => {
  const L: League = genLeague(63000, { ...variety(4), regulars: 24, spares: 0, pending: 0, live: "none", sessions: 0, dates: ctx.dates } as GenOpts);
  L.players = fixture.players.map((p) => ({ ...(L.players[0] as any), id: p.id, name: p.name, email: `p${p.id}@example.invalid`, approved: true, waitlisted: false, membership_type: "regular", current_court: 0, highest_court: 0, season_wins: 0, season_losses: 0, games_played: 0, no_show_count: 0 })) as League["players"];
  const session = fixture.session as any;
  L.current = session;
  // The season totals the app shows come from the players table; give them the night's record, as production does.
  const wins: Record<number, number> = {}, games: Record<number, number> = {};
  for (const m of session.movements) for (const [id, w] of Object.entries(m.wins || {})) wins[+id] = (wins[+id] || 0) + (w as number);
  for (const sc of Object.values<any>(session.scores)) for (const id of [sc.a1, sc.a2, sc.b1, sc.b2]) if (id != null) games[id] = (games[id] || 0) + 1;
  for (const p of L.players) { p.season_wins = wins[p.id] || 0; p.season_losses = (games[p.id] || 0) - (wins[p.id] || 0); p.games_played = games[p.id] || 0; }
  await load(ctx, L);

  const text: string = await ctx.page.evaluate(() => buildRoundSummary());

  // The rounds played, not one more.
  expect(text, "two rounds were played").toContain(`${session.movements.length} rounds played`);
  expect(text, "no phantom extra round").not.toContain(`${session.movements.length + 1} rounds played`);

  // Nobody can win more games than they played — the double count made Shivam 9W from six games.
  const lines = text.split("\n").filter((l) => /—\s+\d+W\s+\d+L/.test(l));
  expect(lines.length, "the summary lists players with records").toBeGreaterThan(10);
  for (const line of lines) {
    const m = line.match(/^\s*(?:\d+\.\s*)?(.+?)\s+—\s+(\d+)W\s+(\d+)L/);
    if (!m) continue;
    const p = L.players.find((x) => m[1].includes(x.name));
    if (!p) continue;
    const w = +m[2], l = +m[3];
    expect(w, `${p.name}: wins cannot exceed games played`).toBeLessThanOrEqual(games[p.id] || 0);
    expect(w + l, `${p.name}: the record adds up to the games played`).toBe(games[p.id] || 0);
    expect(w, `${p.name}: the night's wins`).toBe(wins[p.id] || 0);
  }

  // The courts as played come from the last round's scores, not from next week's line-up.
  const lastCy = session.cycle;
  for (let c = 1; c <= 6; c++) {
    const playedThere = new Set<number>();
    for (const [k, sc] of Object.entries<any>(session.scores)) if (k.startsWith(`c${c}_y${lastCy}_`)) for (const id of [sc.a1, sc.a2, sc.b1, sc.b2]) if (id != null) playedThere.add(id);
    if (!playedThere.size) continue;
    const block = text.split(`Court ${c}:`)[1]?.split("\n\n")[0] ?? "";
    for (const id of playedThere) expect(block, `Court ${c} as played lists ${L.players.find((p) => p.id === id)!.name}`).toContain(L.players.find((p) => p.id === id)!.name);
  }
  // And next week's courts are the session's current line-up.
  const nextBlock = text.split("NEXT WEEK COURTS:")[1] ?? "";
  for (let c = 1; c <= 6; c++) for (const id of session.assignments[c] || []) {
    expect(nextBlock, `next week's Court ${c} lists ${L.players.find((p) => p.id === id)!.name}`).toContain(L.players.find((p) => p.id === id)!.name.split(" ")[0]);
  }
});

test("Share to Messenger carries the summary: the share sheet on a phone, the clipboard on a desktop", async () => {
  const L: League = genLeague(63010, { ...variety(6), regulars: 16, spares: 0, pending: 0, live: "complete", sessions: 1, dates: ctx.dates } as GenOpts);
  test.skip(!L.current, "needs a played session");
  await load(ctx, L);
  const page = ctx.page;
  // A desktop browser: no share sheet. The summary must reach the clipboard, with the organizer told.
  const copied = await page.evaluate(() => {
    const w = window as any;
    const realShare = w.navigator.share, realClip = w.navigator.clipboard;
    let captured = "";
    try { delete (w.navigator as any).share; } catch { w.navigator.share = undefined; }
    Object.defineProperty(w.navigator, "clipboard", { configurable: true, value: { writeText: (t: string) => { captured = t; return Promise.resolve(); } } });
    w.open = () => null;                       // do not open a window during the test
    shareMessenger();
    if (realShare) w.navigator.share = realShare;
    Object.defineProperty(w.navigator, "clipboard", { configurable: true, value: realClip });
    return captured;
  });
  expect(copied, "the Messenger fallback copies the summary itself").toContain("DC Badminton Club");
  expect(copied, "including the courts as played").toContain("COURTS AS PLAYED");
  await expect(page.locator("#_t"), "and says so").toContainText("paste it into the Messenger chat");
});
