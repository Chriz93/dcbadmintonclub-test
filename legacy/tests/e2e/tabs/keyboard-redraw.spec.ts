// p64: clickable parts that a list or section draws again on its own (not by a full redraw) stay reachable from the
// keyboard: each still has a button role and a Tab stop, and Enter works it. Found with the keyboard census: the
// Players tag, history rows and past attendance rows lost their Tab stop after being drawn again, until the next full
// redraw. Each case fails on the page without p64.
import { test, expect, type Page } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type LiveState } from "./gen";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

const nn = (i: number) => String(i + 1).padStart(2, "0");
type Part = { text: string; tab: number; role: string | null };
/** The clickable parts in a section that are not native buttons, links or fields, as shown. */
const parts = (page: Page, scope: string) => page.evaluate((sc) => [...document.querySelectorAll(`${sc} [onclick]:not(button):not(a):not(input):not(select):not(textarea)`)]
  .filter((e) => !e.closest("button,a") && (e as HTMLElement).getBoundingClientRect().width > 0)
  .map((e) => ({ text: (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40), tab: (e as HTMLElement).tabIndex, role: e.getAttribute("role") })), scope);
const unreachable = (ps: Part[]) => ps.filter((p) => p.tab < 0 || p.role !== "button").map((p) => p.text);

type Case = { name: string; live: LiveState; sessions: number; open: (page: Page) => Promise<unknown>; scope: string; target: string };
const CASES: Case[] = [
  { name: "the Players tag after a tap (before a session)", live: "none", sessions: 2, scope: "#a-pl-list", target: `#a-pl-list span[onclick^="togglePlayerPresence("]`,
    open: (page) => page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); }) },
  { name: "history rows after one is opened", live: "none", sessions: 4, scope: "#sec-hist", target: `#sec-hist [onclick^="_expandedHist["]`,
    open: (page) => page.evaluate(() => { nav("standings"); showSec("standings", "hist"); }) },
  { name: "past attendance after a session is opened", live: "none", sessions: 4, scope: "#sec-a-att", target: `#sec-a-att [onclick^="_expandedHist['att"]`,
    open: (page) => page.evaluate(() => { nav("admin"); showSec("admin", "a-att"); }) },
];

for (const c of CASES) {
  for (let i = 0; i < 4; i++) {
    test(`Keyboard after a redraw · ${c.name} ${nn(i)}`, async () => {
      const L = genLeague(58000 + i * 7 + c.sessions, { ...variety(58000 + i), regulars: 10 + 3 * i, spares: 2, pending: 0, live: c.live, sessions: c.sessions + i, hoursBefore: 50, dates: ctx.dates });
      await load(ctx, L);
      const page = ctx.page;
      await c.open(page);
      const target = page.locator(c.target).first();
      await expect(target, "something to open or tap").toBeVisible();
      expect(unreachable(await parts(page, c.scope)), "reachable after the full redraw").toEqual([]);
      await target.click();                                            // the section draws itself again
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
      const after = await parts(page, c.scope);
      expect(after.length, "clickable parts are shown again").toBeGreaterThan(0);
      expect(unreachable(after), "every clickable part is still reachable with Tab and has a button role").toEqual([]);
      // And the keyboard works it: Enter on the first one does what a click does (the section changes).
      const first = page.locator(`${c.scope} [role="button"][onclick]`).first(), before = await page.locator(c.scope).innerHTML();
      await first.focus();
      await expect(first, "takes the keyboard focus").toBeFocused();
      await page.keyboard.press("Enter");
      await expect.poll(() => page.locator(c.scope).innerHTML(), { message: "Enter works it" }).not.toBe(before);
    });
  }
}
