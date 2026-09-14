// Call In (p61), found by the organizer on TEST: before a session the button did nothing. Now, before a session, a
// regular with no court joins the ladder on the bottom court in use; a spare is answered "coming" for the next session
// and takes an open seat, waits for the e-transfer, or waits on standby; a spare who is already coming shows their
// status instead of a button. During a session Call In seats the player through the court engine, and the pool then
// shows where they play tonight (p66). Expected courts and
// seats come from the stand-in database and the independent lineup reference (oracle upcoming), not from the page.
import { test, expect, type Page } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";
import { upcoming, courtOf } from "./oracle";
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

for (let i = 0; i < 16; i++) {
  const declines = i % 4, paid = i % 3 === 0;
  test(`Call in ${String(i + 13).padStart(3, "0")} · before a session · a spare is answered coming (${declines} declines, ${paid ? "paid" : "not paid"})`, async () => {
    const opts: GenOpts = { ...variety(i + 420), regulars: 10 + (i % 9), spares: 3, pending: 0, live: "none", sessions: 1 + (i % 3) };
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
    const L2 = fromDb(ctx, L), up = upcoming(L2), court = courtOf(up.assign, sp.id);
    const reserved = declines > 0;                                   // the only spare claim, so it gets a seat when a regular declined
    const want = court ? `${sp.name} is coming to Session ${U} and takes an open seat on Court ${court}`
      : reserved ? `${sp.name} is coming to Session ${U}; the seat is confirmed once the e-transfer is verified`
      : `${sp.name} is coming to Session ${U} and is on standby until a regular declines`;
    await expect(page.locator("#_t")).toHaveText(want);
    expect(!!court, "seated only with an open seat and a verified payment").toBe(reserved && paid);
    // The pool now shows the spare's status instead of a button.
    await expect(page.getByRole("button", { name: `Call in ${sp.name}` })).toHaveCount(0);
    await expect(poolTag(page, sp.name)).toHaveText(court ? `✓ Coming · Court ${court}` : "Coming · standby");
  });
}

for (let i = 0; i < 12; i++) {
  test(`Call in ${String(i + 29).padStart(3, "0")} · during a session · the court engine seats the player or says why not`, async () => {
    const opts: GenOpts = { ...variety(i + 440), regulars: 8 + i, spares: 2, pending: 0, live: "r1-partial", sessions: 1 + (i % 3), absentRate: 0 };
    const L = genLeague(52200 + i, { ...opts, dates: ctx.dates });
    const seated = new Set(Object.values(L.current!.assignments).flat());
    // A pool player: not seated tonight and no court on the ladder (a spare who played before keeps a court, see docs/32).
    const who = L.players.find((p) => p.approved && !p.waitlisted && !seated.has(p.id) && p.current_court === 0);
    test.skip(!who, "everyone is on a court in this league");
    await load(ctx, L);
    const page = ctx.page, cs0 = kvOf(ctx, "current_session");
    const ref = reference({ ...adjustInput(cs0), absent: [], returning: [{ id: who!.id, court: callInCourt(cs0.assignments, who!.current_court) }], late: [] }) as { ok: boolean };
    await openPlayers(page);
    await page.getByRole("button", { name: `Call in ${who!.name}` }).click();
    if (ref.ok) {
      await expect.poll(() => courtOf(kvOf(ctx, "current_session").assignments, who!.id), { message: "seated tonight" }).toBeGreaterThan(0);
      // p66: the pool shows the seat instead of Call In (the organizer saw "nothing happening" when it had worked).
      const c = courtOf(kvOf(ctx, "current_session").assignments, who!.id);
      await expect(playingTag(page, "a-pl", who!.name), "the pool shows where they play tonight").toHaveText(`✓ Playing · Court ${c}`);
      await expect(page.getByRole("button", { name: `Call in ${who!.name}` }), "no second Call In").toHaveCount(0);
    }
    else { await expect(page.locator("#_t")).not.toHaveText(""); expect(courtOf(kvOf(ctx, "current_session").assignments, who!.id)).toBe(0); }
  });
}

// The organizer's TEST night (p66): during Round 1 a regular with no ladder court (back from a break) and a spare are
// called in one after the other. Each call seats the player (or the court engine says why not, per the reference), and
// both Spare Pool lists, Admin → Players and Admin → Attendance, then show where each plays tonight instead of offering
// Call In again. Before p66 both stayed in the pool with the same button, so it looked as if nothing had happened.
for (let i = 0; i < 8; i++) {
  test(`Call in ${String(i + 41).padStart(3, "0")} · during a session · two call-ins, and both pools show where each plays tonight`, async () => {
    const opts: GenOpts = { ...variety(i + 460), regulars: 14 + i, spares: 3, pending: 0, live: "r1-partial", sessions: 1 + (i % 3), absentRate: 0, declineRate: 0.3 };
    // The first league from this seed on like that night (the same leagues every run): a regular and a spare off tonight's
    // courts, and a court in use without scores yet, so the court engine can seat the regular (the reference says so).
    // A court that already has scores keeps its lineup until the round ends; when every court in use has scores the
    // engine refuses, which the during-session cases above check against the reference.
    let L!: League, reg: League["players"][number] | undefined, sp: League["players"][number] | undefined;
    const seatable = (x: League, id: number) => (reference({ ...adjustInput(x.current as never), absent: [], returning: [{ id, court: callInCourt(x.current!.assignments, 0) }], late: [] }) as { ok: boolean }).ok;
    for (let k = 0; k < 80 && !(reg && sp && seatable(L, reg.id)); k++) {
      L = genLeague(52300 + i * 80 + k, { ...opts, dates: ctx.dates });
      const seated = new Set(Object.values(L.current!.assignments).flat());
      reg = L.players.find((p) => isReg(p) && !seated.has(p.id)); sp = L.players.find((p) => p.approved && !p.waitlisted && p.membership_type === "spare" && !seated.has(p.id));
    }
    expect(reg && sp && seatable(L, reg.id), "a league like that night: a regular and a spare off tonight's courts, and room to seat the regular").toBeTruthy();
    reg!.current_court = 0; sp!.current_court = 0;                 // neither has a ladder court: both are in the pool
    await load(ctx, L);
    const page = ctx.page;
    await openPlayers(page);
    const called: { name: string; court: number }[] = [];
    for (const who of [reg!, sp!]) {
      const cs = kvOf(ctx, "current_session");
      const ref = reference({ ...adjustInput(cs), absent: [], returning: [{ id: who.id, court: callInCourt(cs.assignments, 0) }], late: [] }) as { ok: boolean };
      await page.getByRole("button", { name: `Call in ${who.name}` }).click();
      if (!ref.ok) { await expect(page.locator("#_t")).not.toHaveText(""); expect(courtOf(kvOf(ctx, "current_session").assignments, who.id), "not seated").toBe(0); continue; }
      await expect.poll(() => courtOf(kvOf(ctx, "current_session").assignments, who.id), { message: `${who.name} seated tonight` }).toBeGreaterThan(0);
      const c = courtOf(kvOf(ctx, "current_session").assignments, who.id);
      await expect(page.locator("#_t")).toHaveText(`${who.name} called in → Court ${c}`);
      await expect(playingTag(page, "a-pl", who.name), "Players: the pool shows where they play tonight").toHaveText(`✓ Playing · Court ${c}`);
      await expect(page.getByRole("button", { name: `Call in ${who.name}` }), "no second Call In").toHaveCount(0);
      called.push({ name: who.name, court: c });
    }
    expect(called[0]?.name, "the regular is seated, as the reference said").toBe(reg!.name);
    await page.evaluate(() => showSec("admin", "a-att"));
    for (const x of called) await expect(playingTag(page, "a-att", x.name), "Attendance: the pool shows where they play tonight").toHaveText(`✓ Playing · Court ${courtOf(kvOf(ctx, "current_session").assignments, L.players.find((p) => p.name === x.name)!.id)}`);
  });
}
