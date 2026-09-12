// Reflow on a small phone (WCAG 2.2, 1.4.10): at 320 CSS pixels wide, every page, tab, registration step and main dialog
// fits the width of the screen. The page never scrolls sideways, and no button, field, link or card runs off the right
// edge unless it sits in a box that scrolls on its own (a wide table may). For the organizer and for a player.
import { test, expect, type Page } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "../harness";
import { genLeague, variety, type LiveState } from "../gen";

async function overflow(page: Page, scope: string) {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map((a) => a.finished.catch(() => undefined))));
  return page.evaluate((sel) => {
    const w = document.documentElement.clientWidth, out: string[] = [];
    if (document.documentElement.scrollWidth > w) out.push(`the page is ${document.documentElement.scrollWidth}px wide`);
    const scrolls = (e: Element | null): boolean => { for (let x = e?.parentElement; x && x !== document.body; x = x.parentElement) { const s = getComputedStyle(x); if (/(auto|scroll)/.test(s.overflowX) && x.getBoundingClientRect().right <= w + 1) return true; } return false; };
    for (const e of document.querySelectorAll(`${sel} button, ${sel} input, ${sel} select, ${sel} textarea, ${sel} a, ${sel} .card`)) {
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(e).visibility === "hidden") continue;
      if ((r.right > w + 1 || r.left < -1) && !scrolls(e)) out.push(`${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""} "${(e.textContent || (e as HTMLInputElement).placeholder || "").trim().slice(0, 30)}" reaches ${Math.round(r.right)}px`);
    }
    return out.slice(0, 8);
  }, scope);
}
const VIEWS: [string, string, (p: Page) => Promise<unknown>][] = [
  ["Home", "#page-home", (p) => p.evaluate(() => nav("home"))],
  ["Courts", "#page-courts", (p) => p.evaluate(() => nav("courts"))],
  ["Schedule", "#page-schedule", (p) => p.evaluate(() => nav("schedule"))],
  ["Scores (a court picked)", "#page-scores", async (p) => { await p.evaluate(() => nav("scores")); const c = await p.evaluate(() => [1, 2, 3, 4, 5, 6].find((x) => (S.current?.assignments?.[x] || []).length >= 2) || 1); await p.locator("#sc-sel").selectOption(String(c)); }],
  ...["lb", "rank", "pstats", "heat", "sessstand", "hist", "vote", "qa"].map((s) => [`Standings → ${s}`, "#page-standings", (p: Page) => p.evaluate((x) => { nav("standings"); showSec("standings", x); }, s)] as [string, string, (p: Page) => Promise<unknown>]),
];
const ADMIN = ["a-pl", "a-reg", "a-past", "a-wv", "a-sess", "a-att", "a-assign", "a-pay", "a-ann", "a-tools"];

test.describe("reflow · organizer", () => {
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
  test.afterAll(async () => { await closeCtx(ctx); });
  const all: [string, string, (p: Page) => Promise<unknown>][] = [...VIEWS, ...ADMIN.map((t) => [`Admin → ${t}`, "#page-admin", (p: Page) => p.evaluate(async (x) => { nav("admin"); showSec("admin", x); if (x === "a-wv") { await ensureAllWaiverVersions(true); renderWaiverAdmin(); } }, t)] as [string, string, (p: Page) => Promise<unknown>])];
  all.forEach(([label, scope, go], k) => test(`Reflow 320px organizer · ${label}`, async () => {
    await load(ctx, genLeague(65000 + k, { ...variety(k + 500), regulars: 20 + (k % 7), live: (["r1-partial", "r2-partial", "none", "complete"] as LiveState[])[k % 4] }));
    await go(ctx.page);
    expect(await overflow(ctx.page, scope), `${label} at 320px`).toEqual([]);
  }));
  test("Reflow 320px organizer · Adjust courts preview dialog", async () => {
    const L = genLeague(65100, { ...variety(510), regulars: 18, live: "r1-partial", absentRate: 0 }), cur = L.current!;
    const open = [1, 2, 3, 4, 5, 6].find((x) => (cur.assignments[x] || []).length >= 3)!;
    for (const k of Object.keys(cur.scores)) if (k.startsWith(`c${open}_y${cur.cycle}_`)) delete cur.scores[k];
    await load(ctx, L);
    const page = ctx.page;
    await page.evaluate((c) => { nav("admin"); showSec("admin", "a-att"); return markAttForTab(S.current.assignments[c][0], "absent"); }, open);
    await page.evaluate(() => previewAdjust());
    await expect(page.locator("#modal.open")).toBeVisible();
    expect(await overflow(page, "#modal")).toEqual([]);
  });
});

test.describe("reflow · messages and round bars (p51)", () => {
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
  test.afterAll(async () => { await closeCtx(ctx); });
  test("Reflow 320px · a long message wraps inside the screen instead of running off it", async () => {
    await load(ctx, genLeague(65400, { ...variety(550) }));
    const page = ctx.page;
    await page.setViewportSize({ width: 320, height: 640 });
    const msg = "Omar marked absent — press Adjust courts to update the courts. One court down next week.";
    await page.evaluate((m) => toast(m, "warn"), msg);
    const t = page.locator("#_t");
    await expect(t).toHaveText(msg);
    const b = (await t.boundingBox())!;
    expect(b.x, "left edge on screen").toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, "right edge on screen").toBeLessThanOrEqual(320);
    expect(await t.evaluate((e) => e.scrollWidth <= e.clientWidth), "no text cut off inside the message").toBe(true);
  });
  for (const [live, cy] of [["r1-partial", 1], ["r2-partial", 2]] as const) test(`Round bars · round ${cy}: the Scores and Courts bars show the session's two rounds`, async () => {
    await load(ctx, genLeague(65410 + cy, { ...variety(560 + cy), regulars: 16, live }));
    const page = ctx.page;
    await page.evaluate(() => nav("scores"));
    await expect(page.locator(".round-seg")).toHaveCount(2);
    await page.evaluate(() => nav("courts"));
    await expect(page.locator(".cyseg")).toHaveCount(2);
    await expect(page.locator(".cyseg.act")).toHaveCount(1);
    expect(await page.locator(".cyseg").evaluateAll((e) => e.findIndex((x) => x.classList.contains("act"))), "the current round is marked").toBe(cy - 1);
  });
});

test.describe("reflow · player and registration", () => {
  const ME = "reflow.player@example.invalid";
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser, ME); });
  test.afterAll(async () => { await closeCtx(ctx); });
  VIEWS.forEach(([label, scope, go], k) => test(`Reflow 320px player · ${label}`, async () => {
    const L = genLeague(65200 + k, { ...variety(k + 520), live: (["r1-partial", "r2-partial", "none"] as LiveState[])[k % 3] });
    Object.assign(L.players[0], { email: ME, approved: true, registered_at: "2026-09-03T00:00:00Z" });
    await load(ctx, L); await go(ctx.page);
    expect(await overflow(ctx.page, scope), `${label} at 320px`).toEqual([]);
  }));
  for (const step of [1, 2, 3]) test(`Reflow 320px registration · step ${step}`, async () => {
    await load(ctx, genLeague(65300 + step, { ...variety(530 + step) }));
    await ctx.page.evaluate((n) => { S.waiver = null; regData = {}; nav("register"); goRS(n); }, step);
    if (step === 2) await expect(ctx.page.locator("#waiver-meta")).toContainText("Version");
    expect(await overflow(ctx.page, `#rs${step}`)).toEqual([]);
  });
  test("Reflow 320px player · waiver acceptance dialog", async () => {
    const L = genLeague(65310, { ...variety(540) }) as ReturnType<typeof genLeague> & { waiverAcceptances?: unknown[] };
    Object.assign(L.players[0], { email: ME, approved: true, registered_at: "2026-09-03T00:00:00Z" }); L.waiverAcceptances = [];
    await load(ctx, L as never);
    await ctx.page.evaluate(() => nav("home"));
    await ctx.page.locator("#waiver-update-btn").click();
    await expect(ctx.page.locator("#modal.open")).toBeVisible();
    expect(await overflow(ctx.page, "#modal")).toEqual([]);
  });
});
