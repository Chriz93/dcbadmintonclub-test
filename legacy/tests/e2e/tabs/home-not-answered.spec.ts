// p88: Home counts everyone who was asked, splits the count into regulars and spares, and tells the organizer exactly
// who has not answered. From the organizer, looking at Session 2: "I want to see total coming, spares included ... also
// add another section where people who have not responsed on this home screen, coz otherwise its hard for me to know
// how many spares I have to invite."
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League, type Player } from "./gen";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

const isReg = (p: Player) => p.approved && !p.waitlisted && p.membership_type !== "spare";
const isSpare = (p: Player) => p.approved && p.membership_type === "spare";

test("the headline counts spares too, and the split underneath adds up to it", async () => {
  // The organizer sees the vote card on Home when they play as well — which is how this league is run.
  const opts: GenOpts = { ...variety(21), regulars: 18, spares: 4, pending: 0, live: "none", sessions: 1, hoursBefore: 100, viewerEmail: ctx.email } as GenOpts;
  const L: League = genLeague(56010, { ...opts, dates: ctx.dates });
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => nav("home"));
  const card = page.locator("#home-vote");
  await expect(card.locator(".card-title")).toContainText(`Session ${L.upcoming}`);

  const U = L.upcoming;
  const vote: Record<number, string> = {};
  for (const r of L.rsvps.filter((x) => x.session_number === U)) vote[r.player_id] = r.response;
  const count = (list: Player[]) => [list.filter((p) => vote[p.id] === "coming").length, list.filter((p) => vote[p.id] === "notcoming").length, list.filter((p) => !vote[p.id]).length];
  const reg = count(L.players.filter(isReg)), spare = count(L.players.filter(isSpare)), all = reg.map((n, k) => n + spare[k]);
  expect(spare.some((n) => n > 0), "this league has spares, so the split is worth showing").toBe(true);

  for (const [k, want] of [["coming", all[0]], ["notcoming", all[1]], ["none", all[2]]] as const)
    await expect(card.locator(`[data-k="${k}"]`), `the headline ${k} count includes spares`).toHaveText(String(want));
  const split = card.locator("table.vote-split");
  expect(await split.locator('tr[data-g="regular"] td:not(:first-child)').allTextContents()).toEqual(reg.map(String));
  expect(await split.locator('tr[data-g="spare"] td:not(:first-child)').allTextContents()).toEqual(spare.map(String));
  expect(await split.locator('tr[data-g="total"] td:not(:first-child)').allTextContents(), "the total row is the headline again").toEqual(all.map(String));
});

test("the organizer sees who has not answered, and how many spare seats that leaves", async () => {
  const opts: GenOpts = { ...variety(23), regulars: 16, spares: 4, pending: 0, live: "none", sessions: 2, hoursBefore: 100 };
  const L: League = genLeague(56011, { ...opts, dates: ctx.dates });
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => nav("home"));
  const card = page.locator("#not-answered");
  await expect(card.locator(".card-title")).toHaveText(`🔕 Not answered — Session ${L.upcoming}`);

  const U = L.upcoming;
  const answered = new Set(L.rsvps.filter((x) => x.session_number === U).map((x) => x.player_id));
  const silentReg = L.players.filter((p) => isReg(p) && !answered.has(p.id));
  const silentSpare = L.players.filter((p) => isSpare(p) && !answered.has(p.id));
  const silent = [...silentReg, ...silentSpare];

  if (!silent.length) { await expect(card).toContainText("Everybody has answered."); return; }
  const listed = await card.locator("tr.na-row").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-pid"))));
  expect(listed, "exactly the people who have not answered, regulars before spares").toEqual(silent.map((p) => p.id));
  for (const p of silent) await expect(card.locator(`tr.na-row[data-pid="${p.id}"] .vname`)).toContainText(p.name);
  // Everyone listed can be chased from here, one at a time (p85).
  await expect(card.locator("tr.na-row button.vote-remind")).toHaveCount(silent.length);
  if (silentReg.length) await expect(card, "the count of silent regulars is why the seat number can still move")
    .toContainText(`${silentReg.length} regular${silentReg.length === 1 ? " has" : "s have"} still not answered`);
});

test("when the seats are settled the card says how many spares to invite", async () => {
  // Past the 46-hour deadline the seats are decided, so the open-seat number is the one to act on.
  const opts: GenOpts = { ...variety(25), regulars: 12, spares: 4, pending: 0, live: "none", sessions: 1, hoursBefore: 30 };
  const L: League = genLeague(56012, { ...opts, dates: ctx.dates });
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => nav("home"));
  const card = page.locator("#not-answered");
  const open = await page.evaluate(() => spareSeats().open as number);
  await expect(card).toContainText(`${open} spare seat${open === 1 ? "" : "s"} still to fill.`);
  await expect(card).toContainText(open ? `Invite ${open} more spare` : "Every seat is taken.");
});
