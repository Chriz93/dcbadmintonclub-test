// The organizer's own vote locks at the deadline too (p68). Found by the organizer on TEST: "I am still able to vote no,
// not coming is working, not locked … its past Sun 10.00 pm". While unlocked, the organizer skipped the 46-hour lock on
// their own Home card. Now the Home buttons lock for them as for every regular; they change any answer, their own
// included, in Standings → RSVP. The locked cases fail on the page without p68.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety } from "./gen";
import { ORGANIZER } from "../mock-supabase";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

const H = 3600e3;
const HOURS = [80, 47, 46.05, 45.95, 30, 12, 3, 60];
for (let i = 0; i < HOURS.length; i++) {
  const h = HOURS[i], open = h > 46;
  test(`Organizer vote ${String(i + 1).padStart(2, "0")} · ${h} h before play · ${open ? "open on Home" : "locked on Home, changed in Standings → RSVP"}`, async () => {
    const L = genLeague(59000 + i, { ...variety(59000 + i), regulars: 12 + i, spares: 2, pending: 0, live: "none", sessions: 1 + (i % 3), hoursBefore: h, viewerEmail: ORGANIZER, viewerKind: "regular", dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page, me = L.players.find((p) => p.email === ORGANIZER)!, U = Math.min(L.sessions.length + 1, 28);
    expect(me, "the organizer plays as a regular").toBeTruthy();
    const dbVote = () => ctx.state.rsvps.filter((x) => x.session_number === U && x.player_id === me.id).at(-1)?.response;
    await page.evaluate(() => nav("home"));
    const card = page.locator("#home-vote");
    const yes = card.getByRole("button", { name: "✅ I'm Coming" }), no = card.getByRole("button", { name: "❌ Not Coming" });
    expect(L.nowMs > ctx.fd[U - 1] - 46 * H, "the case is on the side of the deadline its title says").toBe(!open);
    if (open) {
      await expect(yes).toBeEnabled(); await expect(no).toBeEnabled();
      await no.click();
      await expect.poll(dbVote, { message: "saved from Home" }).toBe("notcoming");
      return;
    }
    await expect(yes, "locked for the organizer too").toBeDisabled();
    await expect(no, "locked for the organizer too").toBeDisabled();
    const was = dbVote();
    await page.evaluate(() => submitRSVP(false));
    await expect(page.locator("#_t")).toHaveText("Voting is closed for this session. Message the admin in the group to change your answer.");
    expect(dbVote(), "unchanged").toBe(was);
    // The organizer changes their own answer in Standings → RSVP.
    await page.evaluate(() => nav("standings"));
    await page.locator("#page-standings .ptab").filter({ hasText: /RSVP$/ }).click();
    const want = was === "notcoming" ? "coming" : "notcoming";
    await page.locator(`[onclick="adminSetVote(${me.id},'${want}')"]`).first().click();
    await expect.poll(dbVote, { message: "changed by the organizer in RSVP" }).toBe(want);
  });
}
