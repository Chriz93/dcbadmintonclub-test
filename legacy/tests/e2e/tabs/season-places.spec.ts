// p104 (with L29): the organizer sets how many regular places the season has, and moves a member between regular and
// spare in one click. From the organizer, 6 October: "Lets keep 28 regulars as every session am looking for spares to
// fill in … ultimately admin decides whether to run with 27 regualrs or 28 regulars or 29 regulars and so on, but we cap
// at 30, thats the max", and "Admin → Players → rahul tamrakar — I should be able Make him a spare … keep waiver and all
// 12 games. That frees a place, so the cap is no longer in the way."
// Before this neither existed: the number could only be changed by starting a new season, and toggleMembership had been
// in the page from the beginning with no control anywhere that called it.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, type League, type Player } from "./gen";
import { kvOf } from "./checks";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

/** A season of `regulars` approved regulars and `spares` spares, one session played so records exist. */
function league(seed: number, regulars = 24, spares = 2) {
  const L: League = genLeague(seed, { regulars, spares, pending: 0, sessions: 1, live: "none", absentRate: 0, declineRate: 0, dates: ctx.dates });
  return L;
}
const regulars = () => ctx.state.players.filter((p) => p.membership_type !== "spare" && !p.waitlisted && p.approved && !p.archived_at);
const places = () => JSON.parse(ctx.state.state.season_config?.value || "{}").regular_capacity;
const openRegistered = async () => { await ctx.page.evaluate(() => nav("admin")); await ctx.page.getByRole("button", { name: /^📋 Registered/ }).click(); };
/** The harness accepts every dialog, so the question is read by standing in for confirm — and a case can answer no. */
const asking = async (answer: boolean) => ctx.page.evaluate((yes) => {
  (window as unknown as { __asked: string[] }).__asked = [];
  window.confirm = (m?: string) => { (window as unknown as { __asked: string[] }).__asked.push(String(m)); return yes; };
}, answer);
const asked = () => ctx.page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);

test("the season's regular places are the organizer's to set", async () => {
  await load(ctx, league(104001, 24));
  const page = ctx.page;
  await openRegistered();
  const card = page.locator("#season-places");
  await expect(card).toContainText("24 of 26 taken.");
  await expect(card).toContainText("up to 30");
  await expect(page.locator("#rc-places")).toHaveValue("26");

  await page.fill("#rc-places", "28");
  await page.click("#rc-save");
  await expect(page.locator("#_t")).toContainText("The season now has 28 regular places");
  expect(places(), "the season carries the new number").toBe(28);
  expect(await page.evaluate(() => REGULAR_CAPACITY), "and the page knows it").toBe(28);
  await expect(page.locator("#season-places")).toContainText("24 of 28 taken.");
  // The registration form stops at the new number, not the old one.
  expect(await page.evaluate(() => regularPlacesClaimed() >= REGULAR_CAPACITY), "four places still free").toBe(false);
});

test("the number is refused below the roster and outside 2 to 30", async () => {
  await load(ctx, league(104002, 24));
  const page = ctx.page;
  await openRegistered();
  for (const bad of ["1", "31", "99"]) {
    await page.fill("#rc-places", bad);
    await page.click("#rc-save");
    await expect(page.locator("#_t"), `${bad} places`).toContainText("Regular places must be a number from 2 to 30");
  }
  await page.fill("#rc-places", "10");
  await page.click("#rc-save");
  await expect(page.locator("#_t")).toContainText("There are already 24 regular members");
  expect(places(), "nothing was written").toBeUndefined();
  // Saving the number it already has says so and writes nothing.
  await page.fill("#rc-places", "26");
  await page.click("#rc-save");
  await expect(page.locator("#_t")).toContainText("The season already has 26 regular places");
});

test("a regular becomes a spare in one click, keeping everything they have earned", async () => {
  await load(ctx, league(104003, 24));
  const page = ctx.page;
  await openRegistered();
  const before = regulars().length;
  const who = ctx.state.players.find((p) => p.membership_type !== "spare" && p.approved && !p.waitlisted && p.games_played > 0)!;
  const had = { games: who.games_played, wins: who.season_wins, waiver: who.waiver_signed, court: who.current_court };

  await asking(true);
  await page.locator(`#sec-a-reg .member-type[data-pid="${who.id}"]`).click();
  await expect(page.locator("#_t")).toContainText(`${who.name} changed to Spare`);
  expect((await asked())[0], "it says what the change keeps").toContain("keep their waiver, their payment record and every game they have played");
  expect((await asked())[0]).toContain("Their regular place is freed");

  const now = ctx.state.players.find((p) => p.id === who.id)!;
  expect(now.membership_type).toBe("spare");
  expect({ games: now.games_played, wins: now.season_wins, waiver: now.waiver_signed, court: now.current_court }, "nothing they earned changed").toEqual(had);
  expect(regulars().length, "a regular place is free").toBe(before - 1);
  await expect(page.locator("#sec-a-reg .card").filter({ has: page.locator(".card-title", { hasText: /^🔄 Spare Players/ }) })).toContainText(who.name);
});

test("saying no to that question changes nothing", async () => {
  await load(ctx, league(104004, 24));
  const page = ctx.page;
  await openRegistered();
  const who = ctx.state.players.find((p) => p.membership_type !== "spare" && p.approved && !p.waitlisted)!;
  await asking(false);
  await page.locator(`#sec-a-reg .member-type[data-pid="${who.id}"]`).click();
  expect(ctx.state.players.find((p) => p.id === who.id)!.membership_type, "still a regular").not.toBe("spare");
  expect(kvOf(ctx, "membership_overrides"), "nothing was written").toBeNull();
});

test("a spare becomes a regular, and over a full season it asks and adds the place", async () => {
  await load(ctx, league(104005, 26, 2));
  const page = ctx.page;
  await openRegistered();
  expect(regulars().length, "the season is full").toBe(26);
  const sp = ctx.state.players.find((p) => p.membership_type === "spare" && p.approved)!;
  await asking(true);
  await page.locator(`#sec-a-reg .member-type[data-pid="${sp.id}"]`).click();
  await expect(page.locator("#_t")).toContainText(`${sp.name} changed to Regular`);
  expect((await asked())[0]).toContain("the season's regular places become 27");
  expect(places()).toBe(27);
  expect(regulars().length).toBe(27);
});

test("the same control is on the player's row in Admin → Players", async () => {
  await load(ctx, league(104006, 24));
  const page = ctx.page;
  await page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); });
  const who = ctx.state.players.find((p) => p.membership_type !== "spare" && p.approved && !p.waitlisted && p.current_court > 0)!;
  const tag = page.locator(`#sec-a-pl .member-type[data-pid="${who.id}"]`);
  await expect(tag).toHaveText("Regular");
  await asking(true);
  await tag.click();
  await expect(page.locator("#_t")).toContainText(`${who.name} changed to Spare`);
  await expect(page.locator(`#sec-a-pl .member-type[data-pid="${who.id}"]`), "and it now offers the way back").toHaveText("Spare");
  expect((ctx.state.players.find((p) => p.id === who.id) as Player).membership_type).toBe("spare");
  // Asking for the type they already have changes nothing and says so, rather than writing a no-op.
  const writes = ctx.state.requests.filter((r) => r.includes("/rpc/set_state")).length;
  await page.evaluate((id) => setMembership(id, "spare"), who.id);
  await expect(page.locator("#_t")).toContainText(`${who.name} is already a spare`);
  expect(ctx.state.requests.filter((r) => r.includes("/rpc/set_state")).length, "nothing was written").toBe(writes);
});
