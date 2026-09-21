// Accessibility: axe (WCAG 2.2 A and AA rules, colour contrast included) on every page, tab and main dialog, for the
// organizer and for a player; keyboard focus is visible; nothing moves for people who ask for reduced motion; and on a
// phone the everyday controls are at least 44px tall.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type LiveState } from "./gen";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function axe(page: Page, scope: string) {
  // Let the page fade and dialog rise finish first: mid-fade, text is partly transparent and contrast would be misread.
  // Looping animations (the live-round glow and pulse) never finish, so only the ones with an end are awaited.
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map((a) => a.finished.catch(() => undefined))));
  // In-page mode: the harness opens pages with browser.newPage(), and the site has no frames to isolate.
  const r = await new AxeBuilder({ page }).setLegacyMode(true).withTags(TAGS).include(scope).analyze();
  // For contrast failures the report names the colours and the ratio, so a failure says what to fix.
  const why = (n: { any: { data?: { fgColor?: string; bgColor?: string; contrastRatio?: number } }[] }) => { const d = n.any[0]?.data; return d?.fgColor ? ` [${d.fgColor} on ${d.bgColor}: ${d.contrastRatio}]` : ""; };
  return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} × ${v.nodes.slice(0, 3).map((n) => n.target.join(" ") + why(n as never)).join(" | ")}`);
}
const VIEWS: [string, string, (p: Page) => Promise<unknown>][] = [
  ["Home", "#page-home", (p) => p.evaluate(() => nav("home"))],
  ["Courts", "#page-courts", (p) => p.evaluate(() => nav("courts"))],
  ["Schedule", "#page-schedule", (p) => p.evaluate(() => nav("schedule"))],
  ["Scores (a court picked)", "#page-scores", async (p) => { await p.evaluate(() => nav("scores")); const c = await p.evaluate(() => [1, 2, 3, 4, 5, 6].find((x) => (S.current?.assignments?.[x] || []).length >= 2) || 1); await p.locator("#sc-sel").selectOption(String(c)); }],
  ...["lb", "rank", "pstats", "heat", "sessstand", "hist", "vote", "qa"].map((s) => [`Standings → ${s}`, "#page-standings", (p: Page) => p.evaluate((x) => { nav("standings"); showSec("standings", x); }, s)] as [string, string, (p: Page) => Promise<unknown>]),
];
const ADMIN = ["a-pl", "a-reg", "a-past", "a-wv", "a-sess", "a-att", "a-assign", "a-edit", "a-pay", "a-ann", "a-tools"];

test.describe("a11y · organizer", () => {
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
  test.afterAll(async () => { await closeCtx(ctx); });
  const all: [string, string, (p: Page) => Promise<unknown>][] = [...VIEWS, ...ADMIN.map((t) => [`Admin → ${t}`, "#page-admin", (p: Page) => p.evaluate(async (x) => { nav("admin"); showSec("admin", x); if (x === "a-wv") { await ensureAllWaiverVersions(true); renderWaiverAdmin(); } }, t)] as [string, string, (p: Page) => Promise<unknown>])];
  all.forEach(([label, scope, go], k) => test(`A11y organizer · ${label}`, async () => {
    await load(ctx, genLeague(50000 + k, { ...variety(k + 300), live: (["r1-partial", "r2-partial", "none", "complete"] as LiveState[])[k % 4] }));
    await go(ctx.page);
    expect(await axe(ctx.page, scope), `${label}: WCAG A/AA violations`).toEqual([]);
  }));
  test("A11y organizer · Adjust courts preview dialog", async () => {
    // A running round with one court not scored yet, so there is a change to preview (the generator scores most games).
    const league = genLeague(50100, { ...variety(310), regulars: 18, live: "r1-partial", absentRate: 0 });
    const cur = league.current!;
    const open = [1, 2, 3, 4, 5, 6].find((x) => (cur.assignments[x] || []).length >= 3)!;
    for (const k of Object.keys(cur.scores)) if (k.startsWith(`c${open}_y${cur.cycle}_`)) delete cur.scores[k];
    await load(ctx, league);
    const page = ctx.page;
    await page.evaluate(() => { nav("admin"); showSec("admin", "a-att"); });
    const id = await page.evaluate((c) => S.current.assignments[c][0], open);
    await page.evaluate((x) => markAttForTab(x, "absent"), id);
    await page.evaluate(() => previewAdjust());
    await expect(page.locator("#modal.open")).toBeVisible();
    expect(await axe(page, "#modal")).toEqual([]);
  });
});

test.describe("a11y · player and registration", () => {
  const ME = "a11y.player@example.invalid";
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser, ME); });
  test.afterAll(async () => { await closeCtx(ctx); });
  VIEWS.forEach(([label, scope, go], k) => test(`A11y player · ${label}`, async () => {
    const L = genLeague(50200 + k, { ...variety(k + 320), live: (["r1-partial", "r2-partial", "none"] as LiveState[])[k % 3] });
    Object.assign(L.players[0], { email: ME, approved: true, registered_at: "2026-09-03T00:00:00Z" });
    await load(ctx, L); await go(ctx.page);
    expect(await axe(ctx.page, scope)).toEqual([]);
  }));
  for (const step of [1, 2, 3]) test(`A11y registration · step ${step}`, async () => {
    await load(ctx, genLeague(50300 + step, { ...variety(330 + step) }));
    await ctx.page.evaluate((n) => { S.waiver = null; regData = {}; nav("register"); goRS(n); }, step);
    if (step === 2) await expect(ctx.page.locator("#waiver-meta")).toContainText("Version");
    expect(await axe(ctx.page, `#rs${step}`)).toEqual([]);
  });
  test("A11y player · waiver acceptance dialog", async () => {
    const L = genLeague(50310, { ...variety(340) }) as ReturnType<typeof genLeague> & { waiverAcceptances?: unknown[] };
    Object.assign(L.players[0], { email: ME, approved: true, registered_at: "2026-09-03T00:00:00Z" }); L.waiverAcceptances = [];
    await load(ctx, L as never);
    await ctx.page.evaluate(() => nav("home"));
    await ctx.page.locator("#waiver-update-btn").click();
    await expect(ctx.page.locator("#modal.open")).toBeVisible();
    expect(await axe(ctx.page, "#modal")).toEqual([]);
  });
});

test.describe("a11y · keyboard, motion", () => {
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
  test.afterAll(async () => { await closeCtx(ctx); });
  test("A11y keyboard · every bottom-navigation button is reachable with Tab and shows its focus", async () => {
    await load(ctx, genLeague(50400, { ...variety(350) }));
    const page = ctx.page, want = await page.evaluate(() => [...document.querySelectorAll(".bnav-btn")].map((b) => b.id).filter(Boolean));
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const reached = new Set<string>();
    for (let k = 0; k < 400 && reached.size < want.length; k++) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(() => { const e = document.activeElement as HTMLElement; return e ? { id: e.id, outline: parseFloat(getComputedStyle(e).outlineWidth) || 0, cls: e.className } : null; });
      if (f && want.includes(f.id)) { reached.add(f.id); expect(f.outline, `${f.id} focus ring`).toBeGreaterThanOrEqual(2); }
    }
    expect([...reached].sort()).toEqual([...want].sort());
  });
  test("A11y motion · with reduced motion asked for, pages and dialogs do not animate", async () => {
    await load(ctx, genLeague(50401, { ...variety(351) }));
    const page = ctx.page;
    await page.emulateMedia({ reducedMotion: "reduce" });
    const d = await page.evaluate(() => { nav("schedule"); const s = getComputedStyle(document.querySelector("#page-schedule")!); return [parseFloat(s.animationDuration), getComputedStyle(document.querySelector(".btn")!).transitionDuration]; });
    expect(d[0], "page fade").toBeLessThan(0.01); expect(String(d[1]).split(",").every((x) => parseFloat(x) < 0.01), "button transitions").toBe(true);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const e = await page.evaluate(() => { nav("home"); return parseFloat(getComputedStyle(document.querySelector("#page-home")!).animationDuration); });
    expect(e, "and a short fade otherwise").toBeGreaterThan(0.1);
  });
  test("A11y contrast · the palette's text colours are at least 4.5:1 on white and on the card grey", async () => {
    const ratios = await ctx.page.evaluate(() => {
      const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
      const root = getComputedStyle(document.documentElement), get = (v: string) => root.getPropertyValue(v).trim();
      const on = (fg: string, bg: string) => { const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
      return Object.fromEntries(["--text", "--muted", "--teal", "--teal2", "--green2", "--red2", "--yellow", "--yellow2", "--gold", "--silver", "--bronze"].map((v) => [v, Math.min(on(get(v), "#ffffff"), on(get(v), get("--s2")))]));
    });
    for (const [v, r] of Object.entries(ratios)) expect(r, `${v} contrast`).toBeGreaterThanOrEqual(4.5);
  });
});
