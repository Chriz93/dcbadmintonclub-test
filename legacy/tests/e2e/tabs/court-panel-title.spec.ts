// p91: the court panel's title stops repeating the court name, and the page says which build it is running.
// From the organizer, screenshotting the Court 4 panel headed "Court 4 — Court 4": "what is this".
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

test("each court panel is titled once, with a medal only where there is one", async () => {
  const opts = { ...variety(31), regulars: 24, spares: 0, pending: 0, live: "none", sessions: 1 } as GenOpts;
  const L: League = genLeague(59001, { ...opts, dates: ctx.dates });
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => nav("courts"));
  const title = page.locator("#modal.open #modal-title");
  const want: Record<number, string> = { 1: "Court 1 — 🥇 Top Court", 2: "Court 2 — 🥈 2nd Court", 3: "Court 3 — 🥉 3rd Court",
    4: "Court 4", 5: "Court 5", 6: "Court 6" };
  for (let c = 1; c <= 6; c++) {
    await page.evaluate((x) => showCourtDetail(x), c);
    await expect(title, `Court ${c} is named once`).toHaveText(want[c]);
    await page.evaluate(() => closeModal());
  }
});

test("the page says which build it is running", async () => {
  const opts = { ...variety(31), regulars: 12, spares: 0, pending: 0, live: "none", sessions: 0 } as GenOpts;
  await load(ctx, genLeague(59002, { ...opts, dates: ctx.dates }));
  const page = ctx.page;
  // The tag reads the cache actually serving this page, so a tab left open on an old build can be recognised.
  const version = await page.evaluate(async () => {
    const prefix = SITE_ENV === "production" ? "dcbc-prod-" : "dcbc-test-";
    const mine = (await caches.keys()).filter((k) => k.startsWith(prefix)).sort();
    await showBuildTag();
    return mine.length ? mine[mine.length - 1].slice(prefix.length) : "";
  });
  expect(version, "the service worker has cached this build").not.toBe("");
  await expect(page.locator("#build-tag")).toHaveText(` · build ${version}`);
  await expect(page.locator(".watermark")).toContainText(`DC Badminton Club · Christy George · build ${version}`);
  // A cache belonging to the OTHER site is never reported as this page's build.
  const other = await page.evaluate(async () => {
    const otherPrefix = SITE_ENV === "production" ? "dcbc-test-" : "dcbc-prod-";
    await caches.open(otherPrefix + "zzz-v999");
    await showBuildTag();
    return (document.getElementById("build-tag") as HTMLElement).textContent;
  });
  expect(other, "the other site's cache is ignored").toBe(` · build ${version}`);
});
