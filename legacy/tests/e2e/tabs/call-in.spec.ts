// Call In (p61), found by the organizer on TEST: before a session the button did nothing. Now, before a session, a
// regular with no court joins the ladder on the bottom court in use; a spare is answered "coming" for the next session
// and takes an open seat, waits for the e-transfer, or waits on standby; a spare who is already coming shows their
// status instead of a button. During a session nobody is called in (p68): the pool shows where each player seated
// tonight plays (p66) and that the others are not playing tonight. Expected courts and
// seats come from the stand-in database and the independent lineup reference (oracle upcoming), not from the page.
import { test, expect, type Page } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";
import { upcoming, courtOf, spareSeatCount } from "./oracle";
import { fromDb, kvOf } from "./checks";
import { adjustInput } from "./adjust-oracle";
import { reference } from "../../unit/adjust-reference.mjs";
import { callInCourt } from "./pool";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

const isReg = (p: League["players"][number]) => p.approved && !p.waitlisted && p.membership_type !== "spare";
const poolTag = (page: Page, name: string) => page.locator(`#sec-a-pl .tag[title^="${name} is coming to the next session"]`);
const openPlayers = (page: Page) => page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); });
/** p66: the tag a pool player seated tonight shows instead of Call In, on Admin → Players (a-pl) or Attendance (a-att). */
const playingTag = (page: Page, sec: "a-pl" | "a-att", name: string) => page.locator(`#sec-${sec} .tag[title^="${name} is playing tonight"]`);
/** p68: the tag a pool player not seated tonight shows during a session (nobody is called in once it has started). */
const notPlayingTag = (page: Page, sec: "a-pl" | "a-att", name: string) => page.locator(`#sec-${sec} .tag[title^="${name} is not playing tonight"]`);

for (let i = 0; i < 12; i++) {
  test(`Call in ${String(i + 1).padStart(3, "0")} · before a session · a regular with no court joins the bottom court`, async () => {
    const opts: GenOpts = { ...variety(i + 400), regulars: 8 + i, spares: 2, pending: 0, live: "none", sessions: i % 4 };
    const L = genLeague(52000 + i, { ...opts, dates: ctx.dates });
    const who = L.players.filter(isReg)[i % L.players.filter(isReg).length];
    who.current_court = 0;                                            // back from a break: no court yet
    await load(ctx, L);
    const page = ctx.page, bottom = Math.max(...L.players.filter((p) => isReg(p) && p.id !== who.id && p.current_court > 0).map((p) => p.current_court));
    await openPlayers(page);
    const btn = page.getByRole("button", { name: `Call in ${who.name}` });
    await expect(btn, "Call In is offered for a regular with no court").toBeVisible();
    await btn.click();
    await expect.poll(() => ctx.state.players.find((p) => p.id === who.id)!.current_court, { message: "earned court saved" }).toBe(bottom);
    // Where they start next session comes from the starting-courts reference (a full bottom court sends them on).
    const next = courtOf(upcoming(fromDb(ctx, L)).assign, who.id);
    await expect(page.locator("#_t")).toHaveText(`${who.name} joins the ladder on Court ${bottom} (the bottom court)` + (next === bottom ? " and starts there next session" : next ? `; next session they start on Court ${next}` : ""));
    await expect(page.getByRole("button", { name: `Call in ${who.name}` }), "no longer in the pool").toHaveCount(0);
  });
}

// p69: spare seats fill the courts up to 24 players and are decided when the regulars' vote closes; the only spare
// claim takes a seat once it has closed and fewer than 24 regulars are coming, confirmed when paid.
for (let i = 0; i < 16; i++) {
  const declines = i % 4, paid = i % 3 === 0, closed = i % 2 === 1, regulars = i % 8 >= 6 ? 26 : 10 + (i % 9);
  test(`Call in ${String(i + 13).padStart(3, "0")} · before a session · a spare is answered coming (${regulars} regulars, ${declines} declines, ${closed ? "after" : "before"} the regulars' deadline, ${paid ? "paid" : "not paid"})`, async () => {
    const opts: GenOpts = { ...variety(i + 420), regulars, spares: 3, pending: 0, live: "none", sessions: 1 + (i % 3), hoursBefore: closed ? 30 : 60 };
    const L = genLeague(52100 + i, { ...opts, dates: ctx.dates }), U = L.upcoming;
    const spares = L.players.filter((p) => p.approved && p.membership_type === "spare"), sp = spares[i % spares.length];
    sp.current_court = 0;   // a spare who has not played yet is in the pool (one who played keeps that court, see docs/32)
    // Votes for the next session: every regular coming except `declines` of them; no spare has answered.
    L.rsvps = L.rsvps.filter((v) => v.session_number !== U);
    L.players.filter(isReg).forEach((p, k) => L.rsvps.push({ session_number: U, player_id: p.id, response: k < declines ? "notcoming" : "coming", note: "", updated_at: `2026-09-10T0${k % 9}:00:00Z` }));
    L.payments = L.payments.filter((x) => !(x.player_id === sp.id && x.kind === "spare" && x.session_number === U));
    if (paid) L.payments.push({ id: 90000 + i, player_id: sp.id, kind: "spare", amount: 20, session_number: U, method: "etransfer", received_on: "2026-09-09", note: "" } as never);
    await load(ctx, L);
    const page = ctx.page;
    await openPlayers(page);
    await page.getByRole("button", { name: `Call in ${sp.name}` }).click();
    await expect.poll(() => ctx.state.rsvps.find((v) => v.session_number === U && v.player_id === sp.id)?.response, { message: "answered coming for the next session" }).toBe("coming");
    const L2 = fromDb(ctx, L), up = upcoming(L2), court = courtOf(up.assign, sp.id), sc = spareSeatCount(L2);
    expect(sc.decided, "the case is on the side of the deadline its title says").toBe(closed);
    const reserved = sc.decided && sc.seats > 0;                    // the only spare claim: a seat once decided, if any
    const want = court ? `${sp.name} is coming to Session ${U} and takes an open seat on Court ${court}`
      : reserved ? `${sp.name} is coming to Session ${U}; the seat is confirmed once the e-transfer is verified`
      : !sc.decided ? `${sp.name} is coming to Session ${U}; spare seats are decided when the regulars' vote closes`
      : `${sp.name} is coming to Session ${U} and is on standby: ${sc.seats ? "every spare seat is taken" : "24 or more regulars are coming"}`;
    await expect(page.locator("#_t")).toHaveText(want);
    expect(!!court, "seated only with a decided seat and a verified payment").toBe(reserved && paid);
    // The pool now shows the spare's status instead of a button.
    await expect(page.getByRole("button", { name: `Call in ${sp.name}` })).toHaveCount(0);
    await expect(poolTag(page, sp.name)).toHaveText(court ? `✓ Coming · Court ${court}` : "Coming · standby");
  });
}

// During a session nobody is called in (p68, the organizer: "all player numbers will be finalized before a session
// begin"): the pool offers no Call In and says who is not playing tonight; a Call In that reaches the page anyway is
// refused and tonight's courts do not change.
for (let i = 0; i < 12; i++) {
  test(`Call in ${String(i + 29).padStart(3, "0")} · during a session · players are set: no Call In, and a call-in is refused`, async () => {
    const opts: GenOpts = { ...variety(i + 440), regulars: 8 + i, spares: 2, pending: 0, live: (["r1-partial", "r1-done", "r2-partial"] as const)[i % 3], sessions: 1 + (i % 3), absentRate: 0 };
    // The first league from this seed on with a spare not playing tonight (the same leagues every run).
    let L!: League, who: League["players"][number] | undefined;
    for (let k = 0; k < 40 && !who; k++) {
      L = genLeague(52200 + i * 40 + k, { ...opts, dates: ctx.dates });
      const seated = new Set(Object.values(L.current!.assignments).flat());
      who = L.players.find((p) => p.approved && p.membership_type === "spare" && !seated.has(p.id));
    }
    expect(who, "a spare not playing tonight").toBeTruthy();
    who!.current_court = 0;
    await load(ctx, L);
    const page = ctx.page, before = JSON.stringify(kvOf(ctx, "current_session"));
    await openPlayers(page);
    await expect(page.locator("#sec-a-pl button[onclick^='callInSpare']"), "Players: no Call In during a session").toHaveCount(0);
    await expect(notPlayingTag(page, "a-pl", who!.name)).toHaveText("Not playing tonight");
    await page.evaluate(() => showSec("admin", "a-att"));
    await expect(page.locator("#sec-a-att button[onclick^='callInSpare']"), "Attendance: no Call In during a session").toHaveCount(0);
    await expect(page.locator("#sec-a-att button", { hasText: "Seat anyway" }), "no \"Seat anyway\" for a regular who voted out").toHaveCount(0);
    await expect(notPlayingTag(page, "a-att", who!.name)).toHaveText("Not playing tonight");
    await page.evaluate((id) => callInSpare(id), who!.id);
    await expect(page.locator("#_t")).toHaveText("Players are set before the session starts — Call In is only used before the session.");
    expect(JSON.stringify(kvOf(ctx, "current_session")), "tonight's courts unchanged").toBe(before);
  });
}

// The organizer's TEST night (p66): players seated tonight without a ladder court (a regular back from a break, a spare
// seated when the session started) show where they play in both pools, and nobody is offered Call In (p68).
for (let i = 0; i < 8; i++) {
  test(`Call in ${String(i + 41).padStart(3, "0")} · during a session · players seated tonight without a ladder court show where they play`, async () => {
    const opts: GenOpts = { ...variety(i + 460), regulars: 14 + i, spares: 3, pending: 0, live: "r1-partial", sessions: 1 + (i % 3), absentRate: 0, declineRate: 0.3 };
    // The first league from this seed on with a spare seated tonight (the same leagues every run).
    let L!: League, reg: League["players"][number] | undefined, sp: League["players"][number] | undefined;
    for (let k = 0; k < 80 && !(reg && sp); k++) {
      L = genLeague(52300 + i * 80 + k, { ...opts, dates: ctx.dates });
      const seated = new Set(Object.values(L.current!.assignments).flat());
      reg = L.players.find((p) => isReg(p) && seated.has(p.id)); sp = L.players.find((p) => p.approved && p.membership_type === "spare" && seated.has(p.id));
    }
    expect(reg && sp, "a league with a regular and a spare seated tonight").toBeTruthy();
    reg!.current_court = 0; sp!.current_court = 0;                 // neither has a ladder court: both are listed in the pool
    await load(ctx, L);
    const page = ctx.page, cur = L.current!;
    await openPlayers(page);
    for (const who of [reg!, sp!]) await expect(playingTag(page, "a-pl", who.name), "Players: where they play tonight").toHaveText(`✓ Playing · Court ${courtOf(cur.assignments, who.id)}`);
    await expect(page.locator("#sec-a-pl button[onclick^='callInSpare']"), "no Call In during a session").toHaveCount(0);
    await page.evaluate(() => showSec("admin", "a-att"));
    for (const who of [reg!, sp!]) await expect(playingTag(page, "a-att", who.name), "Attendance: where they play tonight").toHaveText(`✓ Playing · Court ${courtOf(cur.assignments, who.id)}`);
    await expect(page.locator("#sec-a-att button[onclick^='callInSpare']"), "no Call In during a session").toHaveCount(0);
  });
}
