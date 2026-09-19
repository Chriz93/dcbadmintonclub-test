// p82, from the organizer: "already entered court 2 scores, why its asking here on home page to enter court 2 scores?"
// Home offered "Enter Court N scores" whenever the player was on a court in the session, whatever the state of the
// night. It must say what is true: offer the button only while that court still owes games this round, say so when
// they are in, and after the last round say the session is complete and waiting to be ended.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

/** The organizer plays too, so sign in as a player who is on a court tonight. */
async function loadAsSeatedPlayer(live: "complete" | "r1-partial", seed: number) {
  // The signed-in user is the first player, so the card under test is their own.
  const L: League = genLeague(seed, { ...variety(seed % 40), regulars: 16, spares: 0, pending: 0, live, sessions: 1, dates: ctx.dates, viewerEmail: ctx.email } as GenOpts);
  if (!L.current) return null;
  await load(ctx, L);
  const court = await ctx.page.evaluate(() => { const me = myPlayer(); return me ? courtOfPlayer(me.id) : 0; });
  return court ? { L, court } : null;
}

test("after the last round Home says the session is complete, and does not ask for scores", async () => {
  const set = await loadAsSeatedPlayer("complete", 62000);
  test.skip(!set, "needs the signed-in player on a court");
  const { court } = set!;
  await ctx.page.evaluate(() => nav("home"));
  const card = ctx.page.locator("#home-tonight");
  await expect(card, "no request for scores once the night is over").not.toContainText(`Enter Court ${court} scores`);
  await expect(card, "it says the night is finished").toContainText("complete");
  await expect(card, "and what happens next").toContainText("ends the session");
});

test("while a round is open, Home asks only for the games that are still missing", async () => {
  const set = await loadAsSeatedPlayer("r1-partial", 62010);
  test.skip(!set, "needs the signed-in player on a court");
  const { court } = set!;
  await ctx.page.evaluate(() => nav("home"));
  const card = ctx.page.locator("#home-tonight");
  const scored = await ctx.page.evaluate((c) => isCourtDone(c), court);
  if (scored) {
    await expect(card, "the court's games are in").toContainText(`Court ${court}'s Round`);
    await expect(card, "so it offers a review, not an entry").toContainText(`Review Court ${court} scores`);
  } else {
    await expect(card, "the court still owes games").toContainText(`Enter Court ${court} scores`);
  }
});
