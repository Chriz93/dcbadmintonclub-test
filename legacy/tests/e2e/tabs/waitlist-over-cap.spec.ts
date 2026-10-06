// p100 and p101 (with L29): the organizer can take a player off the waitlist when the season is already full. From the
// organizer: "admin should be able to approve the waitlist and make a player regular, even if the cap is reached."
// Before this the 26-place cap was enforced against the organizer too: with 26 places taken, Promote was not drawn at
// all, so when a regular withdrew mid-season there was no way to put the next player in line into their place. And the
// database refused it underneath, so showing the button alone would have produced a database error — confirming now adds
// the place to the season (set_regular_capacity), on the record, and the cap goes on working at the new number.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, type League, type Player } from "./gen";
import { kvOf } from "./checks";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

/** A full season: 26 approved regulars, plus `n` approved players on the waitlist. */
function full(seed: number, n = 2) {
  const L: League = genLeague(seed, { regulars: 26, spares: 0, pending: n, sessions: 0, live: "none", absentRate: 0, declineRate: 0, dates: ctx.dates });
  const waiting = L.players.filter((p) => !p.approved).slice(0, n);
  waiting.forEach((p, k) => { p.approved = true; p.waitlisted = true; p.membership_type = "regular"; p.registered_at = new Date(Date.parse("2026-09-05T12:00:00Z") + k * 6e4).toISOString(); });
  return { L, waiting };
}
const taken = (ctxState: Player[]) => ctxState.filter((p) => p.membership_type !== "spare" && !p.waitlisted && p.approved).length;
const openRegistered = async (page: Ctx["page"]) => { await page.evaluate(() => nav("admin")); await page.getByRole("button", { name: /^📋 Registered/ }).click(); };
/** The harness accepts every dialog, so the question itself is read by standing in for confirm — which also lets a case
 *  answer no. Reset before each use, because the page is shared by the whole suite. */
const asking = async (page: Ctx["page"], answer: boolean) => page.evaluate((yes) => {
  (window as unknown as { __asked: string[] }).__asked = [];
  window.confirm = (m?: string) => { (window as unknown as { __asked: string[] }).__asked.push(String(m)); return yes; };
}, answer);
const asked = (page: Ctx["page"]) => page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);

test("with all 26 places taken, Promote is still offered — and says what it would mean", async () => {
  const { L, waiting } = full(100001);
  await load(ctx, L);
  const page = ctx.page;
  expect(taken(ctx.state.players as Player[]), "the season is full").toBe(26);
  await openRegistered(page);
  const card = page.locator("#sec-a-reg .card").filter({ has: page.locator(".card-title", { hasText: /^⏳ Waitlist/ }) });
  await expect(card.locator("button:has-text('↑ Promote')")).toHaveCount(waiting.length);
  await expect(card.locator(".tag:has-text('26/26 full')")).toHaveCount(waiting.length);
  // The confirm the organizer reads before it happens.
  await asking(page, true);
  await page.evaluate((id) => promoteFromWaitlist(id), waiting[0].id);
  await expect(page.locator("#_t")).toContainText(`${waiting[0].name} promoted from waitlist!`);
  const q = await asked(page);
  expect(q[0]).toContain("All 26 regular places are taken");
  expect(q[0]).toContain("puts the season at 27 regulars");
  expect(q[0]).toContain("confirming adds a place, so the season's regular places become 27");
  expect(kvOf(ctx, "player_approvals")[String(waiting[0].id)], "they are a regular now").toMatchObject({ approved: true, waitlisted: false });
  expect(taken(ctx.state.players as Player[]), "27 regulars, as the organizer decided").toBe(27);
  expect(kvOf(ctx, "season_config").regular_capacity, "the season has the place it now needs").toBe(27);
  expect(await page.evaluate(() => REGULAR_CAPACITY), "and the page knows it").toBe(27);
});

test("saying no to the confirm changes nothing", async () => {
  const { L, waiting } = full(100002);
  await load(ctx, L);
  const page = ctx.page;
  await openRegistered(page);
  await asking(page, false);
  await page.evaluate((id) => promoteFromWaitlist(id), waiting[0].id);
  expect(kvOf(ctx, "player_approvals")[String(waiting[0].id)], "still on the waitlist").toMatchObject({ waitlisted: true });
  expect(taken(ctx.state.players as Player[])).toBe(26);
  expect(kvOf(ctx, "season_config"), "and no place was added").toBeNull();
});

test("the one-click offer card promotes over the cap too", async () => {
  const { L, waiting } = full(100003);
  await load(ctx, L);
  const page = ctx.page;
  await asking(page, true);
  await page.evaluate((id) => promoteWaitlisted(id), waiting[0].id);
  await expect(page.locator("#_t")).toContainText(`${waiting[0].name} promoted from the waitlist`);
  expect((await asked(page))[0]).toContain("the season's regular places become 27");
  expect(taken(ctx.state.players as Player[])).toBe(27);
});

test("with a place free it promotes as before, asking the plain question", async () => {
  const { L, waiting } = full(100004);
  // One regular withdraws: a place is free, so the cap is not in the way.
  const out = L.players.find((p) => p.approved && !p.waitlisted && p.membership_type === "regular")!;
  out.membership_type = "spare";
  await load(ctx, L);
  const page = ctx.page;
  await asking(page, true);
  await page.evaluate((id) => promoteFromWaitlist(id), waiting[0].id);
  expect((await asked(page))[0]).toBe(`Promote ${waiting[0].name} off the waitlist to Regular member?`);
  expect(taken(ctx.state.players as Player[])).toBe(26);
});

test("switching a spare to regular over the cap asks the same way", async () => {
  const { L } = full(100005, 0);
  const spare = { ...L.players[0], id: 801, name: "Spare Player", email: "spare.player@example.invalid", membership_type: "spare", current_court: 0, highest_court: 0, waitlisted: false, approved: true } as Player;
  L.players.push(spare);
  await load(ctx, L);
  const page = ctx.page;
  await asking(page, true);
  await page.evaluate((id) => toggleMembership(id, "regular"), spare.id);
  await expect(page.locator("#_t")).not.toContainText("Cannot switch to Regular");
  expect((await asked(page))[0]).toContain("the season's regular places become 27");
  expect(kvOf(ctx, "membership_overrides")?.[String(spare.id)] ?? kvOf(ctx, "player_approvals")?.[String(spare.id)]?.membershipType, "they are a regular now").toBeTruthy();
  expect(kvOf(ctx, "season_config").regular_capacity).toBe(27);
});

test("the registration form still sends a player into a full season to the waitlist", async () => {
  const { L } = full(100006, 0);
  await load(ctx, L);
  const page = ctx.page;
  // The cap the form reads is unchanged: the places are full, so the form offers the waitlist.
  expect(await page.evaluate(() => regularPlacesClaimed() >= REGULAR_CAPACITY), "the form still sees a full season").toBe(true);
});

test("adding a regular by hand in a full season asks the same question, and then works", async () => {
  const { L } = full(100007, 0);
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); });
  await page.fill("#np-name", "Walk In Regular");
  await asking(page, true);
  await page.evaluate(() => addPlayer());
  await expect(page.locator("#_t")).toContainText("Walk In Regular added as regular!");
  expect((await asked(page))[0]).toContain("the season's regular places become 27");
  expect(kvOf(ctx, "season_config").regular_capacity).toBe(27);
  expect(taken(ctx.state.players as Player[])).toBe(27);
});

test("declining the question when adding by hand adds nobody and no place", async () => {
  const { L } = full(100008, 0);
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); });
  await page.fill("#np-name", "Not Added");
  await asking(page, false);
  await page.evaluate(() => addPlayer());
  expect(ctx.state.players.some((p) => p.name === "Not Added"), "nobody was added").toBe(false);
  expect(kvOf(ctx, "season_config"), "and no place was added").toBeNull();
  expect(taken(ctx.state.players as Player[])).toBe(26);
});

test("the season's places can never be set below the regulars already approved (L29)", async () => {
  const { L } = full(100009, 0);
  await load(ctx, L);
  const page = ctx.page;
  const refused = await page.evaluate(() => rpc("set_regular_capacity", { p_capacity: 10 }).then(() => "", (e: Error) => e.message));
  expect(refused).toContain("There are already 26 regular members");
  expect(kvOf(ctx, "season_config"), "nothing was written").toBeNull();
  for (const bad of [1, 31]) {
    const why = await page.evaluate((n) => rpc("set_regular_capacity", { p_capacity: n }).then(() => "", (e: Error) => e.message), bad);
    expect(why, `${bad} places`).toContain("from 2 to 30");
  }
});
