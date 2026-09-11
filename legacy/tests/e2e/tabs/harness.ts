// One signed-in page per suite; each case swaps a whole generated league into the mock database and re-renders.
import { expect, type Browser, type Page } from "@playwright/test";
import { installMock, freshState, ORGANIZER, type MockState } from "../mock-supabase";
import { signIn, unlockOrganizer } from "../helpers";
import type { League } from "./gen";
import season from "../../../automation/season.json";

export type Ctx = { page: Page; state: MockState; dates: string[]; fd: number[]; email: string; prompts: string[] };
/** A signed-in page. Pass another page's state to have two people share one database (organizer and player). */
export async function openAs(browser: Browser, who: "admin" | string = "admin", nowMs = Date.parse("2026-09-10T12:00:00-04:00"), shared?: MockState): Promise<Ctx> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const state = shared ?? freshState();
  if (!shared) { state.players = []; state.invitations = {}; state.nowMs = nowMs; }
  const email = who === "admin" ? ORGANIZER : who;
  if (who !== "admin") state.invitations[email] = "regular";
  await page.clock.setFixedTime(new Date(nowMs));
  await installMock(page, state);
  // Confirms are accepted; prompts take the next queued answer (none queued = the user pressed OK on an empty box).
  const prompts: string[] = [];
  page.on("dialog", (d) => (d.type() === "prompt" ? d.accept(prompts.shift() ?? "") : d.accept()));
  await page.goto("/");
  await signIn(page, email);
  if (who === "admin") await unlockOrganizer(page);
  await page.evaluate(() => { clearInterval(_syncTimer); _syncTimer = null; });
  await pinSession(page);
  // Expected dates are formatted here, independently of the app's own DATES table.
  const iso = season.approved_dates as string[];
  const dates = await page.evaluate((a) => a.map((s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }); }), iso);
  const fd = await page.evaluate((a) => a.map((s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 20, 0, 0).getTime(); }), iso);
  return { page, state, dates, fd, email, prompts };
}

// Cases jump the clock by weeks; the session is pinned valid so the app never starts a token refresh mid-load.
export async function pinSession(page: Page) {
  const ok = await page.evaluate(async () => { if (_refreshing) await _refreshing; if (!_session) return false; _session.expires_at = 4102444800; return true; });
  expect(ok, "still signed in").toBe(true);
}
/** Another person's page catching up with the database (the 20-second sync, in real use). */
export async function refresh(ctx: Ctx) {
  await pinSession(ctx.page);
  await ctx.page.clock.setFixedTime(new Date(ctx.state.nowMs ?? Date.now()));
  const ok = await ctx.page.evaluate(async () => { _undoEpoch++; closeModal(); const r = await loadAll(); renderAll(); return r; });
  expect(ok, "page caught up with the database").toBe(true);
}
export async function load(ctx: Ctx, L: League) {
  const s = ctx.state;
  s.players = structuredClone(L.players);
  s.state = {};
  if (L.sessions.length) s.state["completed_sessions"] = { value: JSON.stringify(L.sessions), version: 1 };
  if (L.current) s.state["current_session"] = { value: JSON.stringify(L.current), version: 1 };
  s.state["player_approvals"] = { value: JSON.stringify(Object.fromEntries(L.players.map((p) => [p.id, { approved: p.approved, waitlisted: p.waitlisted }]))), version: 1 };
  s.rsvps = structuredClone(L.rsvps); s.payments = structuredClone(L.payments); s.questions = structuredClone(L.questions) as never; s.announcements = structuredClone(L.announcements) as never;
  s.invitations = { ...L.invitations }; s.undo = []; s.rsvpLog = []; s.audit = []; s.requests = []; s.pushSubs = [];
  s.nowMs = L.nowMs;
  await pinSession(ctx.page);
  await ctx.page.clock.setFixedTime(new Date(L.nowMs));
  const ok = await ctx.page.evaluate(async () => {
    // Cancel work the previous league left pending (a save's delayed round advance checks this epoch).
    _undoEpoch++; _autoAdvancing = false; _lastAllScoredState = false;
    closeModal(); _expandedHist = {}; _roundSnapshots = []; S.lastUndo = null;
    const t = document.getElementById("_t"); if (t) t.textContent = "";   // no toast carried over from the previous case
    const sel = document.getElementById("sc-sel") as HTMLSelectElement | null; if (sel) sel.value = "";
    const area = document.getElementById("score-area"); if (area) { area.innerHTML = ""; delete area.dataset.cy; delete area.dataset.court; }
    const errs: string[] = []; const orig = console.error;
    console.error = (...a: unknown[]) => { errs.push(a.map((x) => (x instanceof Error ? x.stack || x.message : String(x))).join(" ")); orig(...a); };
    try { const loaded = await loadAll(); renderAll(); closeModal(); return loaded ? "" : errs.join(" | ") || "loadAll returned false"; }
    catch (e) { return String((e as Error).stack || e); } finally { console.error = orig; }
  });
  expect(ok, "the league loaded into the app").toBe("");
}

/** Text of an element with whitespace collapsed, for stable comparisons. */
export const norm = (s: string) => s.replace(/\s+/g, " ").trim();
export async function text(page: Page, sel: string) { return norm(await page.locator(sel).first().innerText()); }
export function inOrder(hay: string, needles: string[], label: string) {
  let at = 0;
  for (const n of needles) { const i = hay.indexOf(n, at); expect(i, `${label}: "${n}" missing or out of order`).toBeGreaterThanOrEqual(0); at = i + n.length; }
}
