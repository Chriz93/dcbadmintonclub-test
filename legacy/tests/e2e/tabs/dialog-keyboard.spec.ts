// Dialogs for keyboard and screen-reader users (p45–p47): each main dialog opens from the keyboard, is announced as a
// dialog named by its title, takes the focus, keeps Tab and Shift+Tab inside, closes with Escape or its Close button, and
// gives the focus back to the control that opened it. Also: the Courts page's court cards are reached and opened with
// the keyboard, the Players tab's note buttons say whose note they are, and Escape with no dialog open does nothing.
import { test, expect, type Page, type Locator } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety } from "./gen";

type Opened = { page: Page; opener: Locator; title: string | RegExp };
const inDialog = (page: Page) => page.evaluate(() => !!document.activeElement?.closest("#modal .modal"));
async function pressOpen(o: Opened) { await o.opener.focus(); await o.page.keyboard.press("Enter"); await expect(o.page.locator("#modal.open")).toBeVisible(); }

/** The four checks every dialog gets, each on a fresh league. */
function dialogChecks(name: string, open: (k: number) => Promise<Opened>, base: number) {
  test(`Dialog · ${name}: opened from the keyboard, it is announced as a dialog named by its title and takes the focus`, async () => {
    const o = await open(base); await pressOpen(o);
    await expect(o.page.getByRole("dialog", { name: o.title })).toBeVisible();
    expect(await inDialog(o.page), "the focus is in the dialog").toBe(true);
  });
  test(`Dialog · ${name}: Tab and Shift+Tab stay inside it`, async () => {
    const o = await open(base + 1); await pressOpen(o);
    const n = await o.page.locator("#modal.open .modal").evaluate((b) => b.querySelectorAll("button,[href],input,select,textarea,summary,[tabindex]:not([tabindex='-1'])").length);
    for (const key of ["Tab", "Shift+Tab"]) for (let i = 0; i < n + 3; i++) {
      await o.page.keyboard.press(key);
      expect(await inDialog(o.page), `${key} × ${i + 1}`).toBe(true);
    }
  });
  test(`Dialog · ${name}: Escape closes it and the focus goes back to the control that opened it`, async () => {
    const o = await open(base + 2); await pressOpen(o);
    await o.page.keyboard.press("Escape");
    await expect(o.page.locator("#modal.open")).toHaveCount(0);
    await expect(o.opener).toBeFocused();
  });
  test(`Dialog · ${name}: its Close button closes it and the focus goes back to the control that opened it`, async () => {
    const o = await open(base + 3); await pressOpen(o);
    await o.page.locator('#modal.open .modal > button[onclick="closeModal()"]').focus();
    await o.page.keyboard.press("Enter");
    await expect(o.page.locator("#modal.open")).toHaveCount(0);
    await expect(o.opener).toBeFocused();
  });
}

test.describe("dialogs · organizer", () => {
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
  test.afterAll(async () => { await closeCtx(ctx); });
  dialogChecks("Adjust courts preview", async (k) => {
    const L = genLeague(67000 + k, { ...variety(700 + k), regulars: 16, live: "r1-partial", absentRate: 0 }), cur = L.current!;
    const open = [1, 2, 3, 4, 5, 6].find((x) => (cur.assignments[x] || []).length >= 3)!;
    for (const key of Object.keys(cur.scores)) if (key.startsWith(`c${open}_y${cur.cycle}_`)) delete cur.scores[key];
    await load(ctx, L);
    const page = ctx.page;
    await page.evaluate((c) => { nav("admin"); showSec("admin", "a-att"); return markAttForTab(S.current.assignments[c][0], "absent"); }, open);
    return { page, opener: page.locator("#adj-btn"), title: `Adjust courts — Round ${cur.cycle}` };
  }, 0);
  dialogChecks("private note", async (k) => {
    const L = genLeague(67100 + k, { ...variety(710 + k), regulars: 10 });
    await load(ctx, L);
    const page = ctx.page;
    await page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); });
    const opener = page.locator("#sec-a-pl button.notes-btn").first(), id = Number((await opener.getAttribute("onclick"))!.match(/\d+/)![0]);
    return { page, opener, title: `📝 Admin Note — ${L.players.find((p) => p.id === id)!.name}` };
  }, 0);
  dialogChecks("court details", async (k) => {
    await load(ctx, genLeague(67200 + k, { ...variety(720 + k), regulars: 16, live: "r1-partial" }));
    await ctx.page.evaluate(() => nav("courts"));
    return { page: ctx.page, opener: ctx.page.locator("#page-courts .gym-court").first(), title: /^Court 1 — / };
  }, 0);
  dialogChecks("add a player to a court", async (k) => {
    await load(ctx, genLeague(67300 + k, { ...variety(730 + k), regulars: 16, spares: 2, live: "r1-partial" }));
    await ctx.page.evaluate(() => nav("courts"));
    return { page: ctx.page, opener: ctx.page.locator("#admin-court-panel").getByRole("button", { name: "+ Court 2" }), title: "Add Player to Court 2" };
  }, 0);

  test("Courts page · the court cards can be reached with Tab, show the focus ring, and open with Space", async () => {
    await load(ctx, genLeague(67400, { ...variety(740), regulars: 16, live: "r1-partial" }));
    const page = ctx.page;
    await page.evaluate(() => { nav("courts"); (document.activeElement as HTMLElement | null)?.blur(); });
    let ring = -1;
    for (let k = 0; k < 200 && ring < 0; k++) {
      await page.keyboard.press("Tab");
      ring = await page.evaluate(() => { const e = document.activeElement as HTMLElement; return e?.classList.contains("gym-court") ? parseFloat(getComputedStyle(e).outlineWidth) || 0 : -1; });
    }
    expect(ring, "a court card took the focus, with a visible ring").toBeGreaterThanOrEqual(2);
    await page.keyboard.press(" ");
    await expect(page.getByRole("dialog", { name: /^Court \d — / })).toBeVisible();
  });
  test("Players tab · every note button says whose note it is", async () => {
    const L = genLeague(67500, { ...variety(750), regulars: 12 });
    L.players[1].admin_note = "Knee brace";
    await load(ctx, L);
    const page = ctx.page;
    await page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); });
    const btns = await page.locator("#sec-a-pl button.notes-btn").all();
    expect(btns.length).toBeGreaterThan(0);
    for (const b of btns) {
      const id = Number((await b.getAttribute("onclick"))!.match(/\d+/)![0]), p = L.players.find((x) => x.id === id)!;
      await expect(b).toHaveAccessibleName(`${p.admin_note ? "Private note" : "Add a private note"} for ${p.name}`);
    }
  });
  test("Escape with no dialog open does nothing", async () => {
    await load(ctx, genLeague(67600, { ...variety(760) }));
    const page = ctx.page, errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.evaluate(() => nav("home"));
    await page.keyboard.press("Escape");
    await expect(page.locator("#page-home")).toBeVisible(); await expect(page.locator("#modal.open")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe("dialogs · player", () => {
  const ME = "dialog.player@example.invalid";
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser, ME); });
  test.afterAll(async () => { await closeCtx(ctx); });
  dialogChecks("waiver acceptance", async (k) => {
    const L = genLeague(67700 + k, { ...variety(770 + k) }) as ReturnType<typeof genLeague> & { waiverAcceptances?: unknown[] };
    Object.assign(L.players[0], { email: ME, approved: true, registered_at: "2026-09-03T00:00:00Z" }); L.waiverAcceptances = [];
    await load(ctx, L as never);
    await ctx.page.evaluate(() => nav("home"));
    return { page: ctx.page, opener: ctx.page.locator("#waiver-update-btn"), title: "Waiver — version 2026-09-v2" };
  }, 0);
});
