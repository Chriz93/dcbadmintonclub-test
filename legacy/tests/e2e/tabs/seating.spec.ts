// Start Session seats tonight's starting courts (p54): everyone who is coming keeps the court they earned (the court in
// Admin → Players); a court left with one player or more than five is settled as at the gym; the night is refused, with
// the reason, for nobody, one player, or more than the six courts seat (30). One case for every number of players from 0
// to 32, each with earned courts scattered over the ladder so that lone and crowded courts come up. Expectations come
// from the independent reference (legacy/tests/unit/starting-reference.mjs, through rules-model.ts), not from the app.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, rng, NC } from "./gen";
import { Model, members, modelMembers, startingCourts } from "../rules-model";
import { kvOf } from "./checks";
import { courtOf } from "./oracle";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

const earnedFor = (n: number) => { const r = rng(6300 + n); return Array.from({ length: n }, () => 1 + Math.floor(r() * NC)); };
for (let n = 0; n <= 32; n++) {
  const courts = earnedFor(n), per = [1, 2, 3, 4, 5, 6].map((c) => courts.filter((x) => x === c).length);
  const title = n === 0 ? "nobody coming: refused" : n === 1 ? "one player: refused" : n > 30 ? `${n} players: refused (six courts seat 30)` : `${n} players, earned ${per.join(" ")}`;
  test(`Seating · ${title}`, async () => {
    const L = genLeague(63000 + n, { regulars: n, spares: 0, pending: 0, sessions: 0, live: "none", absentRate: 0, declineRate: 0, dates: ctx.dates });
    L.players.forEach((p, i) => { p.current_court = courts[i]; p.highest_court = courts[i]; });
    // Everyone answered "coming" for Session 1.
    L.rsvps = L.players.map((p) => ({ session_number: 1, player_id: p.id, response: "coming", note: "", updated_at: "2026-09-10T12:00:00Z" }));
    await load(ctx, L);
    const page = ctx.page, toast = page.locator("#_t");
    await page.evaluate(() => startSession());
    const refused = n === 0 ? "Nobody is coming — a game needs at least two players. Start the session when players are coming."
      : n === 1 ? "Only one player is coming — a game needs at least two. Start the session when another player is coming."
      : n > 30 ? `${n} players are coming, but the 6 courts seat at most 30. Mark someone absent or not coming, then start the session.` : "";
    if (refused) {
      await expect(toast).toHaveText(refused);
      expect(kvOf(ctx, "current_session"), "no session was started").toBeNull();
      return;
    }
    await expect(toast).toHaveText("Session 1 started — 0 excused, 0 spares seated");
    const cs = kvOf(ctx, "current_session"), model = new Model(L.players);
    model.seat();
    expect(members(cs.assignments), "who sits where (reference)").toEqual(modelMembers(model));
    // Each player keeps the earned court unless the reference moved them (a court of one, or more than five).
    const start = startingCourts(L.players.map((p) => ({ id: p.id, court: p.current_court })), []), moved = new Map(start.moves.map((m) => [m.id, m.to]));
    for (const p of L.players) expect(courtOf(cs.assignments, p.id), `${p.name} (earned Court ${p.current_court})`).toBe(moved.get(p.id) ?? p.current_court);
    expect(Object.values(cs.assignments).every((ids) => (ids as number[]).length !== 1 && (ids as number[]).length <= 5), "no court of one, none over five").toBe(true);
    expect(members(cs.initialAssignments), "the starting lineup is kept as the initial allocation").toEqual(members(cs.assignments));
    expect(Object.values(cs.assignments).flat().every((id) => cs.attendance[id as number] === "present"), "everyone seated is present").toBe(true);
  });
}
