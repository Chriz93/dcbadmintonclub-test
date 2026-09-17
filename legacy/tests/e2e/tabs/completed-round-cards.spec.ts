// The organizer, 16 September, after entering both rounds: "there is no round 3, and your round 3 projection itself is
// wrong … why there is down arrow for GARY?". Once the last round's rotation is applied, the session's courts are the
// NEXT session's line-up. The round cards kept recomputing "Round 2" from those new courts, so they mixed next
// session's players with last round's scores: wrong arrows, a "Stay" that means nothing, and a projected Round 3 that
// cannot exist (a night is two rounds). What a completed round shows must match what the app recorded and applied.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts } from "./gen";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

for (let i = 0; i < 6; i++) {
  test(`Completed round ${String(i + 1).padStart(3, "0")} · the cards agree with the movements the app applied, and there is no round after the last`, async () => {
    const opts: GenOpts = { ...variety(i + 900), regulars: 12 + i * 2, spares: 0, pending: 0, live: "complete", sessions: i % 3 };
    const L = genLeague(54000 + i, { ...opts, dates: ctx.dates });
    test.skip(!L.current || !L.current.completed, "needs a session finished after its last round");
    await load(ctx, L);
    const page = ctx.page;
    await page.evaluate(() => nav("courts"));

    const lastRound = L.current!.movements!.length;                       // the round just finished (2 = the last)
    const recorded: Record<string, string> = L.current!.movements![lastRound - 1].mv;
    const shown = await page.evaluate(() => { const s = computeRoundStatus(); return { projected: s.projectedMv, allScored: s.allScored, hasProjection: !!s.projectedAssignments }; });

    // Every up/down the cards show for the finished round must be the one the app recorded and applied.
    const disagreements = Object.entries(shown.projected as Record<string, string>)
      .filter(([id, dir]) => dir !== "stay" && recorded[id] !== dir)
      .map(([id, dir]) => `${L.players.find((p) => p.id === +id)?.name ?? id}: card says ${dir}, applied ${recorded[id] ?? "nothing"}`);
    expect(disagreements, "the finished round's arrows are the ones the app applied").toEqual([]);

    // A night is two rounds: once it is complete there is no next round to project.
    expect(shown.hasProjection, "no next-round projection after the final round").toBe(false);
    await expect(page.locator("#court-gym-view"), "no projected Round 3 card").not.toContainText("Projected Round 3");
    await expect(page.locator("#round-tracker"), "the current courts are not called the finished round's courts")
      .not.toContainText(`Round ${lastRound} Courts`);
  });
}
