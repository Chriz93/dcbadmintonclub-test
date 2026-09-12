// The waiver on a phone (iPhone-sized, touch): the wording scrolls inside its own box, every choice is a thumb-sized
// target (44px), the acceptance dialog fits the screen, accepting on the phone leaves a complete record, and the
// organizer's Waivers tab works at phone width. Layout is measured in the page; records come from the TEST stand-in.
import { test, expect, type Page } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "../harness";
import { genLeague, variety } from "../gen";

const ME = "phone.waiver@example.invalid";
const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;
const vw = (page: Page) => page.viewportSize()!.width, vh = (page: Page) => page.viewportSize()!.height;
/** The row a control sits in: what a thumb actually taps. */
const rowOf = (page: Page, sel: string) => page.locator(sel).locator("xpath=ancestor::*[contains(@class,'chk-row')][1]");

test.describe("phone waiver · registration", () => {
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser, ME); });
  test.afterAll(async () => { await closeCtx(ctx); });
  async function toStep2(k: number) {
    await load(ctx, genLeague(66000 + k, { ...variety(600 + k) }));
    const page = ctx.page;
    await page.evaluate(() => { S.waiver = null; regData = {}; goRS(1); nav("register"); });
    await page.locator("#mt-regular-box").click();
    await page.locator("#r-name").fill("Pat Phone"); await page.locator("#r-phone").fill("613-555-0160"); await page.locator("#r-emergency").fill("Lee Phone, 613-555-0161");
    await page.locator("#rs1").getByRole("button", { name: "Continue →" }).click();
    await expect(page.locator("#rs2")).toHaveClass(/active/);
    await expect(page.locator("#waiver-meta")).toContainText("Version");
    return page;
  }
  test("Phone waiver · the wording scrolls inside its own box, which is shorter than the screen", async () => {
    const page = await toStep2(1), b = await box(page, "#waiver-box");
    expect(b.height, "box height").toBeLessThan(vh(page));
    const s = await page.locator("#waiver-box").evaluate((e) => ({ scrolls: e.scrollHeight > e.clientHeight, oy: getComputedStyle(e).overflowY }));
    expect(s.scrolls, "the wording is longer than the box").toBe(true); expect(s.oy).toMatch(/auto|scroll/);
  });
  test("Phone waiver · the wording is at least 12px and stays within the screen's width", async () => {
    const page = await toStep2(2), b = await box(page, "#waiver-box");
    const px = await page.locator("#waiver-box").evaluate((e) => Math.min(...[e, ...e.querySelectorAll("*")].filter((x) => x.textContent?.trim()).map((x) => parseFloat(getComputedStyle(x).fontSize))));
    expect(px).toBeGreaterThanOrEqual(12); expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.width).toBeLessThanOrEqual(vw(page) + 1);
  });
  for (const who of ["adult", "guardian"]) test(`Phone waiver · the "${who}" choice is a tap target at least 44px tall`, async () => {
    const page = await toStep2(who === "adult" ? 3 : 4);
    expect((await rowOf(page, `#wv-age-${who}`).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
  test("Phone waiver · tapping the words of the acceptance sentence ticks the box", async () => {
    const page = await toStep2(5);
    await page.locator("label[for=w1]").tap();
    await expect(page.locator("#w1")).toBeChecked();
  });
  test("Phone waiver · choosing guardian shows the name field inside the screen, and it takes typing", async () => {
    const page = await toStep2(6);
    await rowOf(page, "#wv-age-guardian").tap();
    await expect(page.locator("#wv-minor-row")).toBeVisible();
    const b = await box(page, "#wv-minor");
    expect(b.x + b.width).toBeLessThanOrEqual(vw(page) + 1); expect(b.height).toBeGreaterThanOrEqual(44);
    await page.locator("#wv-minor").fill("Kit Phone"); await expect(page.locator("#wv-minor")).toHaveValue("Kit Phone");
  });
  test("Phone waiver · the optional photo box starts unticked and is a 44px tap target", async () => {
    const page = await toStep2(7);
    await expect(page.locator("#wv-media")).not.toBeChecked();
    expect((await rowOf(page, "#wv-media").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
  test("Phone waiver · the Register button is at least 44px tall and fits the screen", async () => {
    const page = await toStep2(8);
    await page.locator("#reg-btn").scrollIntoViewIfNeeded();
    const b = await box(page, "#reg-btn");
    expect(b.height).toBeGreaterThanOrEqual(44); expect(b.x + b.width).toBeLessThanOrEqual(vw(page) + 1);
  });
});

test.describe("phone waiver · accepting an updated version", () => {
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser, ME); });
  test.afterAll(async () => { await closeCtx(ctx); });
  async function home(k: number) {
    const L = genLeague(66100 + k, { ...variety(610 + k) }) as ReturnType<typeof genLeague> & { waiverAcceptances?: unknown[] };
    Object.assign(L.players[0], { email: ME, approved: true, registered_at: "2026-09-03T00:00:00Z" }); L.waiverAcceptances = [];
    await load(ctx, L as never);
    await ctx.page.evaluate(() => nav("home"));
    await expect(ctx.page.locator("#waiver-update-card")).toBeVisible();
    return { page: ctx.page, pid: L.players[0].id };
  }
  test("Phone waiver · the update card and its button fit the screen, and the button is 44px tall", async () => {
    const { page } = await home(1), c = await box(page, "#waiver-update-card"), b = await box(page, "#waiver-update-btn");
    expect(c.x + c.width).toBeLessThanOrEqual(vw(page) + 1); expect(b.height).toBeGreaterThanOrEqual(44);
  });
  test("Phone waiver · the acceptance dialog fits the screen and its wording scrolls inside it", async () => {
    const { page } = await home(2);
    await page.locator("#waiver-update-btn").tap();
    await expect(page.locator("#modal.open #wva-box")).toBeVisible();
    const m = await box(page, "#modal.open .modal"), w = await box(page, "#modal.open #wva-box");
    expect(m.x).toBeGreaterThanOrEqual(0); expect(m.x + m.width).toBeLessThanOrEqual(vw(page) + 1);
    expect(w.height, "the wording box is shorter than the screen").toBeLessThan(vh(page));
    expect(await page.locator("#modal.open #wva-box").evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  });
  test("Phone waiver · the accept button can be reached and is 44px tall", async () => {
    const { page } = await home(3);
    await page.locator("#waiver-update-btn").tap();
    const btn = page.locator("#modal.open #wva-btn");
    await expect(btn).toBeVisible();
    await btn.scrollIntoViewIfNeeded();
    await expect(btn).toBeInViewport();
    expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
  test("Phone waiver · accepting on the phone records the device's time zone and removes the card", async () => {
    const { page, pid } = await home(4), before = (ctx.state.waiverAcceptances || []).length;
    await page.locator("#waiver-update-btn").tap();
    await expect(page.locator("#modal.open #wva-btn")).toBeVisible();
    await page.locator("#modal.open label[for=wva-ok]").tap(); await page.locator("#modal.open #wva-sig").fill("Pat Phone");
    await page.locator("#modal.open #wva-btn").tap();
    await expect.poll(() => (ctx.state.waiverAcceptances || []).length).toBe(before + 1);
    const a = ctx.state.waiverAcceptances!.at(-1)!;
    expect(a).toMatchObject({ player_id: pid, action: "updated-version", age_declaration: "adult", typed_signature: "Pat Phone" });
    expect(a.client_timezone, "the device's time zone").not.toBe("");
    expect(typeof a.client_utc_offset_minutes).toBe("number");
    expect(a.user_agent, "the phone's description").toMatch(/Mobile|iPhone/);
    await expect(page.locator("#waiver-update-card")).toHaveCount(0);
  });
});

test.describe("phone waiver · the organizer's Waivers tab", () => {
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
  test.afterAll(async () => { await closeCtx(ctx); });
  test("Phone waiver · Admin → Waivers: every download button is 44px tall and the tab fits the screen", async () => {
    await load(ctx, genLeague(66200, { ...variety(620), regulars: 12 }));
    const page = ctx.page;
    await page.evaluate(async () => { nav("admin"); showSec("admin", "a-wv"); await ensureAllWaiverVersions(true); renderWaiverAdmin(); });
    const btns = page.locator("#sec-a-wv button:visible");
    expect(await btns.count(), "download and version buttons").toBeGreaterThan(2);
    for (const b of await btns.all()) { const r = (await b.boundingBox())!; expect(r.height, await b.innerText()).toBeGreaterThanOrEqual(44); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "no sideways scrolling").toBe(true);
  });
});
