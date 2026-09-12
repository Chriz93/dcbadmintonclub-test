// Start Session seats the night by ranking (the initial allocation, kept separate from Adjust courts): the players who
// are coming, in order of earned court (then id), four to a court from Court 1; a single leftover joins the court above
// as its fifth; with 25 to 30 players the extras are fifth players on Courts 6, 5, 4…; and it is refused, with the
// reason, for nobody, one player, or more than the six courts seat (30). One case for every number from 0 to 32.
// Expectations come from the rules model (rules-model.ts: courtSizes, Model.seat), not from the app.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, rng, NC } from "./gen";
import { Model, courtSizes, members, modelMembers } from "../rules-model";
import { kvOf } from "./checks";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

for (let n = 0; n <= 32; n++) {
  const z = courtSizes(n).slice(1);
  const title = n === 0 ? "nobody coming: refused" : n === 1 ? "one player: refused" : n > 30 ? `${n} players: refused (six courts seat 30)` : `${n} players → ${z.map((x) => x || "·").join(" ")}`;
  test(`Seating · ${title}`, async () => {
    const L = genLeague(63000 + n, { regulars: n, spares: 0, pending: 0, sessions: 0, live: "none", absentRate: 0, declineRate: 0, dates: ctx.dates });
    // Earned courts in no particular order of id, so the ranking (earned court, then id) decides the seating.
    const r = rng(6300 + n);
    for (const p of L.players) { p.current_court = 1 + Math.floor(r() * NC); p.highest_court = p.current_court; }
    // Everyone answered "coming" for Session 1 (a player who did not answer is seated too, but left unmarked).
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
    expect(members(cs.assignments), "who sits where (earned court, then id)").toEqual(modelMembers(model));
    expect([1, 2, 3, 4, 5, 6].map((c) => (cs.assignments[c] || []).length), "players per court").toEqual(z);
    if (n > 24) expect([1, 2, 3, 4, 5, 6].filter((c) => cs.assignments[c].length === 5), "fifth players on the bottom courts").toEqual([6, 5, 4, 3, 2, 1].slice(0, n - 24).reverse());
    expect(members(cs.initialAssignments), "the starting lineup is kept as the initial allocation").toEqual(members(cs.assignments));
    expect(Object.values(cs.assignments).flat().every((id) => cs.attendance[id as number] === "present"), "everyone seated is present").toBe(true);
    expect(Object.values(cs.assignments).every((ids) => (ids as number[]).length !== 1), "nobody alone on a court").toBe(true);
  });
}
