// p96: only the players who said yes are on tonight's courts. From the organizer: "when I am going to assign courts, only
// those who responded to votes and said yes should be shown in the courts list, whoever not responded or said no has to
// be removed from the list" — and why: "its hard for me to know how many spares I have to invite".
// Before this, a regular who had not answered was seated on the court they earned, exactly as if they had said yes, and
// the spare-seat count counted them as coming, so it read far too low.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";
import { upcoming, spareSeatCount } from "./oracle";
import { kvOf } from "./checks";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

/** A league a day before the session, two sessions played, every regular answering "coming" unless `silent`/`no` says otherwise. */
function league(seed: number, { silent = 0, no = 0, spares = 0 } = {}) {
  const opts = { ...variety(31), regulars: 24, spares, pending: 0, live: "none", sessions: 2 } as GenOpts;
  const L: League = genLeague(seed, { ...opts, dates: ctx.dates });
  L.nowMs = ctx.fd[L.upcoming - 1] - 24 * 3600e3;   // the day before the session: the regulars' vote has closed (46 hours)
  const regs = L.players.filter((p) => p.approved && !p.waitlisted && p.membership_type !== "spare" && p.current_court > 0);
  const at = new Date(L.nowMs - 86400e3).toISOString();
  L.rsvps = regs.slice(silent + no).map((p) => ({ session_number: L.upcoming, player_id: p.id, response: "coming", note: "", updated_at: at }))
    .concat(regs.slice(silent, silent + no).map((p) => ({ session_number: L.upcoming, player_id: p.id, response: "notcoming", note: "", updated_at: at }))) as League["rsvps"];
  return { L, quiet: regs.slice(0, silent), declined: regs.slice(silent, silent + no), yes: regs.slice(silent + no) };
}
const seatOf = (a: Record<string, number[]>, id: number) => [1, 2, 3, 4, 5, 6].find((c) => (a[c] || []).includes(id)) ?? 0;

test("a regular who has not answered is not on a court, and nobody moves up into their place", async () => {
  const { L, quiet, yes } = league(96001, { silent: 3 });
  await load(ctx, L);
  const page = ctx.page;
  const assign = await page.evaluate(() => upcomingLineup().assign as Record<string, number[]>);
  for (const p of quiet) expect(seatOf(assign, p.id), `${p.name} never answered`).toBe(0);
  for (const p of yes) expect(seatOf(assign, p.id), `${p.name} said yes and keeps Court ${p.current_court}`).toBe(Math.min(6, p.current_court));
  // Every court the app shows is the court the independent oracle shows.
  const want = upcoming(L).assign;
  for (let c = 1; c <= 6; c++) expect([...(assign[c] || [])].sort((x, y) => x - y), `Court ${c}`).toEqual([...(want[c] || [])].sort((x, y) => x - y));
});

test("the Courts page names who is being waited on, in one line", async () => {
  const { L, quiet } = league(96002, { silent: 2 });
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => nav("courts"));
  const notes = page.locator("#lineup-notes-list");
  await expect(notes).toContainText("2 regulars have not answered yet, so they are not in tonight's line-up:");
  for (const p of quiet) await expect(notes, `${p.name} is named`).toContainText(p.name);
  // The courts themselves hold nobody who has not answered.
  const shown = await page.locator("#court-gym-view").innerText();
  for (const p of quiet) expect(shown.includes(p.name), `${p.name} is not on a court`).toBe(false);
});

test("the board arranges only the players who said yes", async () => {
  const { L, quiet } = league(96003, { silent: 4, no: 2 });
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => { nav("admin"); showSec("admin", "a-assign"); });
  const board = page.locator("#assign-ui");
  const onCourts = await board.locator('.dnd-court:not([data-court="0"]) .dnd-player').evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-pid"))));
  for (const p of quiet) expect(onCourts.includes(p.id), `${p.name} is not on a court on the board`).toBe(false);
  // They are under Not playing instead, where the organizer can still seat them.
  const pool = await board.locator('.dnd-court[data-court="0"] .dnd-player').evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-pid"))));
  for (const p of quiet) expect(pool.includes(p.id), `${p.name} can still be seated`).toBe(true);
});

test("silence frees a spare seat: the seats are 24 minus the players who said yes", async () => {
  for (const silent of [0, 1, 5]) {
    const { L } = league(96010 + silent, { silent, spares: 3 });
    await load(ctx, L);
    const got = await ctx.page.evaluate(() => { const s = spareSeats(); return { coming: s.coming, seats: s.seats }; });
    const want = spareSeatCount(L);
    expect(got, `${silent} silent regulars`).toEqual({ coming: want.coming, seats: want.seats });
    expect(got.seats, "each silence opens a seat").toBe(Math.max(0, 24 - (24 - silent)));
  }
});

test("the home screen says how many spare seats are still to fill", async () => {
  const { L } = league(96020, { silent: 4, spares: 1 });
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => nav("home"));
  const card = page.locator("#not-answered");
  await expect(card).toContainText("Not answered — Session 3");
  // The vote has closed, so the number of seats is settled: four regulars went quiet, so four seats are open.
  await expect(card).toContainText("4 spare seats still to fill.");
  await expect(card).toContainText("Invite 4 more spares.");
  await expect(card.locator("tr.vg").first()).toContainText("Regulars (4)");
});

test("starting the session records the silence, and it costs nothing", async () => {
  const { L, quiet } = league(96030, { silent: 3 });
  await load(ctx, L);
  const page = ctx.page;
  const before = await page.evaluate(() => S.players.map((p: { id: number; currentCourt: number; noShowCount: number }) => [p.id, p.currentCourt, p.noShowCount]));
  await page.evaluate(() => startSession());
  await expect(page.locator("#_t")).toContainText("never answered");
  const cur = kvOf(ctx, "current_session");
  for (const p of quiet) {
    expect(cur.attendance[p.id], `${p.name} is recorded as having never answered`).toBe("noanswer");
    expect(cur.absentFrom?.[p.id], "and not as absent, which would cost a court").toBeUndefined();
    expect(Object.values(cur.assignments as Record<string, number[]>).flat().includes(p.id), "not seated").toBe(false);
  }
  expect(await page.evaluate(() => S.players.map((p: { id: number; currentCourt: number; noShowCount: number }) => [p.id, p.currentCourt, p.noShowCount])),
    "no court changed and nobody gained a no-show").toEqual(before);
  // The night's own summary lists them, separately from the players who declined.
  await page.evaluate(() => nav("courts"));
  await page.evaluate(() => { nav("admin"); showSec("admin", "a-att"); });
  const silentCard = page.locator("#silent-tonight");
  await expect(silentCard).toContainText("3 regulars did not answer the vote — no court penalty and no no-show");
  for (const p of quiet) await expect(silentCard).toContainText(p.name);
});

test("the organizer's seat on the board beats the silence (p98)", async () => {
  const { L, quiet } = league(96040, { silent: 2 });
  await load(ctx, L);
  const page = ctx.page;
  const p = quiet[0];
  await page.evaluate((id) => assignMove(id, 4), p.id);           // the Assign board: this is about tonight
  const assign = await page.evaluate(() => upcomingLineup().assign as Record<string, number[]>);
  expect(seatOf(assign, p.id), `${p.name} was seated by hand and stays seated`).toBeGreaterThan(0);
  expect(kvOf(ctx, "pre_session_attendance")[p.id], "the seat is recorded as a Present mark").toBe("present");
  expect(seatOf(assign, quiet[1].id), "the other silent regular is still not seated").toBe(0);
});

// p103: the same call also sets the ladder court from Admin → Players, which must not answer for the player — at the
// start of a season every regular is given a court before anybody has voted.
test("setting the ladder court answers for nobody", async () => {
  const { L, quiet, yes } = league(96050, { silent: 2 });
  await load(ctx, L);
  const page = ctx.page;
  const p = quiet[0];
  await page.evaluate((id) => setPlayerCourt(id, 4), p.id);        // Admin → Players: the ladder, not tonight
  expect(await page.evaluate((id) => S.players.find((x: { id: number }) => x.id === id).currentCourt, p.id), "the court is set").toBe(4);
  expect(kvOf(ctx, "pre_session_attendance"), "and nothing was marked on their behalf").toBeNull();
  expect(seatOf(await page.evaluate(() => upcomingLineup().assign as Record<string, number[]>), p.id), "still not in tonight's line-up").toBe(0);
  // A regular who said yes keeps their place through a ladder change, and a later "not coming" still counts.
  const q = yes[0];
  await page.evaluate((id) => setPlayerCourt(id, 5), q.id);
  await page.evaluate((id) => adminSetVote(id, "notcoming"), q.id);
  expect(seatOf(await page.evaluate(() => upcomingLineup().assign as Record<string, number[]>), q.id), "their own answer wins").toBe(0);
});
