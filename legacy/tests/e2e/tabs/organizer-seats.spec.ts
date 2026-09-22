// p71, from the organizer on production (14 September): "if I assign the court for the spare player under admin, it
// should be reflected under main courts, I should have that flexibility, edit, remove, assign courts". Before a session
// the Courts page's + Add seats a spare on that court for the coming session (whatever their answer or payment) and
// moves a regular there; Remove unseats a spare, and marks a regular "not coming" for the session (no penalty).
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";
import { kvOf } from "./checks";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

const isReg = (p: League["players"][number]) => p.approved && !p.waitlisted && p.membership_type !== "spare";
const gymCourt = (c: number) => ctx.page.locator(`#court-gym-view .gym-court[onclick="showCourtDetail(${c})"]`);
/** The court the page's starting lineup gives a player before the session (0: not seated). Court cards show first names. */
const startsOn = (id: number): Promise<number> => ctx.page.evaluate((x) => +(Object.entries(upcomingLineup().assign).find(([, ids]: any) => ids.includes(x))?.[0] || 0), id);
const first = (name: string) => name.split(" ")[0];

for (let i = 0; i < 8; i++) {
  test(`Organizer seats ${String(i + 1).padStart(3, "0")} · before a session · + Add seats a spare on the court, Remove unseats them`, async () => {
    const opts: GenOpts = { ...variety(i + 700), regulars: 6 + i * 2, spares: 2, pending: 0, live: "none", sessions: i % 3, hoursBefore: i % 2 ? 30 : 60 };
    const L = genLeague(53000 + i, { ...opts, dates: ctx.dates });
    const sp = L.players.filter((p) => p.approved && p.membership_type === "spare")[i % 2];
    sp.current_court = 0;                                            // no answer, not paid: the spare seats would not seat them
    L.payments = L.payments.filter((x) => x.player_id !== sp.id);
    L.rsvps = L.rsvps.filter((v) => v.player_id !== sp.id);
    await load(ctx, L);
    const page = ctx.page, c = 1 + (i % 3);
    await page.evaluate(() => nav("courts"));
    expect(await startsOn(sp.id), "not seated yet").toBe(0);
    await gymCourt(c).click();
    await page.locator("#modal-body").getByRole("button", { name: "+ Add Player to Court" }).click();
    await page.locator("#modal-player-sel").selectOption(String(sp.id));
    await page.getByRole("button", { name: `Add to Court ${c}` }).click();
    await expect(page.locator("#_t")).toContainText(`${sp.name} (spare) is seated on Court ${c}`);
    await expect.poll(() => ctx.state.players.find((p) => p.id === sp.id)!.current_court, { message: "court saved" }).toBe(c);
    await expect.poll(() => (kvOf(ctx, "pre_session_attendance") || {})[sp.id], { message: "seated for the session" }).toBe("present");
    // Seated on that court, or where the court engine's usual rules put a fifth player; shown on the main Courts page.
    await expect.poll(() => startsOn(sp.id), { message: "Start Session would seat them" }).toBeGreaterThan(0);
    const at = await startsOn(sp.id);
    await expect(gymCourt(at), "shown on the main Courts page").toContainText(first(sp.name));
    // p95: the panel stays open on the court being arranged, so several players can be seated in a row. Close it
    // before going back to the Courts page for the next step.
    await expect(page.locator("#modal.open"), "the panel is still open after seating").toBeVisible();
    await page.evaluate(() => closeModal());
    // Remove: unseated again.
    await gymCourt(at).click();
    await page.getByRole("button", { name: `Remove ${sp.name} from Court ${at}` }).click();
    await expect(page.locator("#_t")).toContainText(`${sp.name} (spare) is no longer seated`);
    await expect.poll(() => (kvOf(ctx, "pre_session_attendance") || {})[sp.id], { message: "seat cleared" }).toBeUndefined();
    await expect.poll(() => startsOn(sp.id), { message: "gone from the starting courts" }).toBe(0);
  });
}

for (let i = 0; i < 4; i++) {
  test(`Organizer seats ${String(i + 9).padStart(3, "0")} · before a session · Remove marks a regular "not coming" (no penalty, court kept)`, async () => {
    const opts: GenOpts = { ...variety(i + 720), regulars: 10 + i, spares: 1, pending: 0, live: "none", sessions: 1 };
    const L = genLeague(53100 + i, { ...opts, dates: ctx.dates }), U = L.upcoming;
    L.rsvps = L.rsvps.filter((v) => v.session_number !== U);         // nobody has answered: everyone is coming
    await load(ctx, L);
    const page = ctx.page, reg = L.players.filter((p) => isReg(p) && p.current_court > 0)[i];
    const c = await startsOn(reg.id);
    if (i % 2) { // cases 010, 012: also marked present before the night, which would keep them on; Remove clears it
      await page.evaluate(async (id) => { await setKV("pre_session_attendance", { [id]: "present" }); await loadAll(); renderAll(); }, reg.id);
      await expect.poll(() => (kvOf(ctx, "pre_session_attendance") || {})[reg.id]).toBe("present");
    }
    await page.evaluate(() => nav("courts"));
    await gymCourt(c).click();
    // The harness accepts the confirmation ("… is not coming to Session N? No penalty; they keep Court C.").
    await page.getByRole("button", { name: `Remove ${reg.name} from Court ${c}` }).click();
    await expect.poll(() => ctx.state.rsvps.find((v: any) => v.session_number === U && v.player_id === reg.id)?.response, { message: "answered not coming" }).toBe("notcoming");
    expect(ctx.state.players.find((p) => p.id === reg.id)!.current_court, "keeps the court they earned").toBe(reg.current_court);
    await expect.poll(() => startsOn(reg.id), { message: "off the starting courts" }).toBe(0);
    expect((kvOf(ctx, "pre_session_attendance") || {})[reg.id], "no present mark left").toBeUndefined();
  });
}
