// Every place the 2026-27 rule wording appears, for each kind of viewer: the late rule, two shuttlecocks per player,
// "the app can make mistakes", the removed waitlist sentence, fees only where they apply, the payment acknowledgement
// only on step 1, the Session tab's shuttle form, and a scan of every page and tab for wording that was retired.
import { test, expect, type Page } from "@playwright/test";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety, type League, type LiveState } from "./gen";

const LATE = "Players arriving more than 5 minutes late move down one court.";
const BOTTOM = "On the bottom court in use there is no lower court, so a late player stays there.";
const SHUTTLE_HOME = "Shuttlecocks: two per player on each court — 8 for four players, 10 for five, 6 for three and 4 for two. Players provide any extra shuttlecocks.";
const SHUTTLE_REG = "Each court gets two shuttlecocks per player: 8 for a court of four, 10 for a court of five (6 for three, 4 for two). Players provide any extra shuttlecocks.";
const NOTE = "The app can make mistakes. Please keep a note of your court's score for each round on your phone. If you notice an error, send your recorded scores to the organizer on the same day, after the session.";
const ABSENCE = "Missing a session without notice will move your court one down at the start of the following session.";
const RETIRED = ["moves you to the last court", "moved to the last court", "Repeated unexcused absences", "losing your spot to a waitlist player", "allotted 8 shuttlecocks", "Each court started with 8 birds", "5+ = top gets extras", "TERMS AGREED TO"];
const FEE_BOTH = "Regular season $400 (26 players). Spare session $20, confirmed once the admin verifies the e-transfer.";
const bodyText = async (page: Page) => norm(await page.locator("body").innerText());

type Role = "organizer" | "regular" | "spare" | "newcomer";
const EMAIL: Record<Role, string> = { organizer: "", regular: "wording.regular@example.invalid", spare: "wording.spare@example.invalid", newcomer: "wording.newcomer@example.invalid" };
/** A league in which the viewer (if a player) is player 1 with the given membership, registered this season. */
function leagueFor(role: Role, seed: number, live: LiveState = "r1-partial"): League {
  const L = genLeague(seed, { ...variety(seed), live });
  if (role === "regular" || role === "spare") Object.assign(L.players[0], { email: EMAIL[role], membership_type: role, approved: true, waitlisted: false, registered_at: "2026-09-03T00:00:00Z", current_court: role === "spare" ? 0 : L.players[0].current_court || 1 });
  return L;
}

// ═══ Home, Schedule and Scores for each viewer ═══
for (const role of ["organizer", "regular", "spare", "newcomer"] as Role[]) {
  test.describe(`wording · ${role}`, () => {
    let ctx: Ctx;
    test.beforeAll(async ({ browser }) => { ctx = await openAs(browser, role === "organizer" ? "admin" : EMAIL[role]); });
    test.afterAll(async () => { await closeCtx(ctx); });
    const CHECKS: [string, (page: Page) => Promise<void>][] = [
      ["Home rules: the late rule", async (p) => expect(await p.locator("#season-rules-card").innerText()).toContain(LATE)],
      ["Home rules: a late player on the bottom court in use stays", async (p) => expect(await p.locator("#season-rules-card").innerText()).toContain(BOTTOM)],
      ["Home rules: two shuttlecocks per player, extras from players", async (p) => expect(norm(await p.locator("#season-rules-card").innerText())).toContain(SHUTTLE_HOME)],
      ["Home rules: the app can make mistakes (in bold)", async (p) => await expect(p.locator("#season-rules-card strong", { hasText: "The app can make mistakes." })).toHaveText(NOTE)],
      ["Home rules: the old late wording is gone", async (p) => { const t = await p.locator("#season-rules-card").innerText(); expect(t).not.toContain("moves you to the last court"); expect(t).not.toContain("more than 5 minutes late moves you"); }],
      ["Home: the waitlist sentence is gone", async (p) => expect(await bodyText(p)).not.toContain("Repeated unexcused absences")],
      ["Home rules: the fee line shows only what applies", async (p) => await expect(p.locator("#rules-fee")).toHaveText(role === "regular" ? "Regular season $400 (26 players)." : role === "spare" ? "Spare session $20, confirmed once the admin verifies the e-transfer." : FEE_BOTH)],
      ["Schedule: the fee tile shows only what applies", async (p) => { await p.evaluate(() => nav("schedule")); await expect(p.locator("#sched-fee-amt")).toHaveText(role === "spare" ? "$20" : "$400"); await expect(p.locator("#sched-fee-lbl")).toHaveText(role === "spare" ? "Per session" : "Season"); }],
      ["Scores: the note above the court picker", async (p) => { await p.evaluate(() => nav("scores")); await expect(p.locator("#score-note")).toHaveText(`📝 ${NOTE}`); }],
    ];
    CHECKS.forEach(([label, check], k) => test(`Wording ${role} · ${label}`, async () => {
      await load(ctx, leagueFor(role, 49000 + k * 7 + role.length));
      await ctx.page.evaluate(() => nav("home"));
      await check(ctx.page);
    }));
  });
}

// ═══ Registration, step by step ═══
test.describe("wording · registration", () => {
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser, EMAIL.newcomer); });
  test.afterAll(async () => { await closeCtx(ctx); });
  const li = (p: Page) => p.locator("#rs3 ol > li");
  const toStep = async (p: Page, n: number, spare = false) => {
    await p.evaluate(() => { regData = {}; goRS(1); }); await p.evaluate(() => nav("register"));
    await p.locator(spare ? "#mt-spare-box" : "#mt-regular-box").click();
    if (n === 1) return;
    await p.evaluate((x) => goRS(x), n);
  };
  const CHECKS: [string, (p: Page) => Promise<void>][] = [
    ["step 3: the late rule is the first rule", async (p) => { await toStep(p, 3); await expect(li(p).first()).toHaveText(`Arrive 5 minutes early. ${LATE} ${BOTTOM}`); }],
    ["step 3: two shuttlecocks per player", async (p) => { await toStep(p, 3); await expect(li(p).nth(2)).toHaveText(SHUTTLE_REG); }],
    ["step 3: the app can make mistakes follows the score-entry rule", async (p) => { await toStep(p, 3); await expect(li(p).nth(5)).toHaveText(NOTE); await expect(li(p).nth(4)).toContainText("Scores are entered by one person per court"); }],
    ["step 3: missing a session costs one court, and nothing about the waitlist", async (p) => { await toStep(p, 3); await expect(li(p).filter({ hasText: "Missing a session" })).toHaveText(ABSENCE); expect(await p.locator("#rs3").innerText()).not.toContain("waitlist player"); }],
    ["step 3: the remaining-shuttlecocks rule appears once", async (p) => { await toStep(p, 3); expect((await p.locator("#rs3").innerText()).match(/remaining shuttlecocks/gi)?.length).toBe(1); }],
    ["step 3: eighteen rules", async (p) => { await toStep(p, 3); await expect(li(p)).toHaveCount(18); }],
    ["step 1: a regular sees the $400 choices and not the $20 one", async (p) => { await toStep(p, 1); await expect(p.locator("#pay-decl-paid-row")).toContainText("$400"); await expect(p.locator("#pay-decl-will-row")).toBeVisible(); await expect(p.locator("#pay-decl-spare-row")).toBeHidden(); }],
    ["step 1: a spare sees the $20 choice and not the $400 ones", async (p) => { await toStep(p, 1, true); await expect(p.locator("#pay-decl-spare-row")).toHaveText("Spare: I pay $20 per session I play"); await expect(p.locator("#pay-decl-paid-row")).toBeHidden(); await expect(p.locator("#pay-decl-will-row")).toBeHidden(); }],
    ["step 2 (regular): no second payment acknowledgement and no fee", async (p) => { await toStep(p, 2); await expect(p.locator("#w5, #w6, #w5-row, #w6-row")).toHaveCount(0); const t = await p.locator("#rs2").innerText(); expect(t).not.toContain("$400"); expect(t).not.toContain("$20"); }],
    ["step 2 (spare): no second payment acknowledgement and no fee", async (p) => { await toStep(p, 2, true); await expect(p.locator("#w5, #w6, #w5-row, #w6-row")).toHaveCount(0); const t = await p.locator("#rs2").innerText(); expect(t).not.toContain("$400"); expect(t).not.toContain("$20"); }],
    ["step 4: the note about keeping your own scores", async (p) => { await expect(p.locator("#reg-score-note")).toHaveText(`📝 ${NOTE}`); }],
  ];
  CHECKS.forEach(([label, check], k) => test(`Wording registration · ${label}`, async () => { await load(ctx, leagueFor("newcomer", 49100 + k)); await check(ctx.page); }));
});

// ═══ Session tab: the late card and the shuttlecock form, each court's own number ═══
test.describe("wording · session tab", () => {
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
  test.afterAll(async () => { await closeCtx(ctx); });
  for (let i = 0; i < 12; i++) {
    const regulars = [5, 6, 7, 9, 10, 11, 13, 18, 22, 24, 26, 26][i];
    test(`Wording session tab ${String(i + 1).padStart(3, "0")} · ${regulars} regulars · late card and two shuttlecocks per player on each court`, async () => {
      const L = genLeague(49200 + i, { ...variety(i + 200), regulars, spares: i % 3, declineRate: 0, absentRate: 0, live: "r1-partial" });
      await load(ctx, L);
      const page = ctx.page, a = L.current!.assignments;
      await page.evaluate(() => nav("admin")); await page.getByRole("button", { name: "📅 Session" }).click();
      const ui = page.locator("#sess-ui");
      await expect(ui.locator(".card").filter({ hasText: "⏰ Late Arrivals" })).toContainText("Players arriving more than 5 minutes late move down one court, starting now.");
      const birds = ui.locator(".card").filter({ hasText: "🪶 Shuttlecock Distribution" });
      await expect(birds).toContainText("Each court starts with two shuttlecocks per player (8 for four players, 10 for five, 6 for three, 4 for two). Enter how many are left on each court; the top scorers on that court take them home.");
      await expect(birds).toContainText("One each to the players in order of wins this round, then any extras go round again from the top scorer.");
      for (let c = 1; c <= 6; c++) {
        const n = (a[c] || []).length, max = n >= 2 ? 2 * n : 0;
        await expect(page.locator(`#birds_of_${c}`)).toHaveText(max ? `of ${max} remaining (${n} players × 2)` : "not in use");
        await expect(page.locator(`#birds_${c}`)).toHaveAttribute("max", String(max));
        if (!max) await expect(page.locator(`#birds_${c}`)).toBeDisabled();
      }
    });
  }
  // A count above what a court started with (or below zero) is refused, and nothing is saved.
  for (let i = 0; i < 8; i++) {
    test(`Wording session tab · shuttle count check ${i + 1} · ${["one over", "far over", "negative", "exactly the start", "zero", "one over on a court of five", "one over on a court of two", "one over on a court of three"][i]}`, async () => {
      const L = genLeague(49300 + i, { ...variety(i + 210), regulars: i >= 5 ? [25, 22, 23][i - 5] : 16, spares: 0, declineRate: 0, absentRate: 0, live: "r1-partial" });
      await load(ctx, L);
      const page = ctx.page, a = L.current!.assignments, toast = page.locator("#_t");
      const sizeWanted = i === 5 ? 5 : i === 6 ? 2 : i === 7 ? 3 : 4, c = [1, 2, 3, 4, 5, 6].find((x) => (a[x] || []).length === sizeWanted) ?? 1, n = (a[c] || []).length, max = 2 * n;
      await page.evaluate(() => nav("admin")); await page.getByRole("button", { name: "📅 Session" }).click();
      const value = [max + 1, max + 20, -1, max, 0, max + 1, max + 1, max + 1][i];
      await page.locator(`#birds_${c}`).fill(String(value));
      const before = JSON.parse(ctx.state.state["current_session"].value).birdDistribution;
      await page.getByRole("button", { name: "🪶 Distribute to Top Scorers" }).click();
      if (value < 0 || value > max) { await expect(toast).toHaveText(`Court ${c} started with ${max} shuttlecocks — enter a number from 0 to ${max}`); expect(JSON.parse(ctx.state.state["current_session"].value).birdDistribution, "nothing saved").toEqual(before); }
      else { await expect(toast).toHaveText("Birds distributed to top scorers!"); const bd = JSON.parse(ctx.state.state["current_session"].value).birdDistribution; expect(value ? bd[c].total : bd[c], "saved as entered").toBe(value ? value : undefined); }
    });
  }
});

// ═══ Retired wording, page by page ═══
const PAGES: [string, (p: Page) => Promise<void>][] = [
  ["Home", (p) => p.evaluate(() => nav("home"))], ["Courts", (p) => p.evaluate(() => nav("courts"))], ["Schedule", (p) => p.evaluate(() => nav("schedule"))],
  ["Scores", (p) => p.evaluate(() => nav("scores"))], ["Register", (p) => p.evaluate(() => nav("register"))],
  ...["lb", "rank", "pstats", "heat", "sessstand", "hist", "vote", "qa"].map((s) => [`Standings → ${s}`, (p: Page) => p.evaluate((x) => { nav("standings"); showSec("standings", x); }, s)] as [string, (p: Page) => Promise<void>]),
];
const ADMIN_TABS = ["a-pl", "a-reg", "a-past", "a-wv", "a-sess", "a-att", "a-assign", "a-pay", "a-ann", "a-tools"];
test.describe("wording · retired phrases", () => {
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
  test.afterAll(async () => { await closeCtx(ctx); });
  const all: [string, (p: Page) => Promise<void>][] = [...PAGES, ...ADMIN_TABS.map((t) => [`Admin → ${t}`, (p: Page) => p.evaluate((x) => { nav("admin"); showSec("admin", x); if (x === "a-wv") renderWaiverAdmin(true); }, t)] as [string, (p: Page) => Promise<void>])];
  all.forEach(([label, go], k) => test(`Wording retired · ${label} (organizer)`, async () => {
    await load(ctx, genLeague(49400 + k, { ...variety(k + 220), live: (["r1-partial", "r2-partial", "complete", "none"] as LiveState[])[k % 4] }));
    await go(ctx.page);
    const t = await bodyText(ctx.page);
    for (const w of RETIRED) expect(t, `"${w}" is gone`).not.toContain(w);
  }));
});
test.describe("wording · retired phrases (player)", () => {
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser, EMAIL.regular); });
  test.afterAll(async () => { await closeCtx(ctx); });
  PAGES.slice(0, 5).forEach(([label, go], k) => test(`Wording retired · ${label} (regular player)`, async () => {
    await load(ctx, leagueFor("regular", 49500 + k, (["r1-partial", "r2-partial", "complete", "none", "r1-done"] as LiveState[])[k]));
    await go(ctx.page);
    const t = await bodyText(ctx.page);
    for (const w of RETIRED) expect(t, `"${w}" is gone`).not.toContain(w);
  }));
});
