// One signed-in page per suite; each case swaps a whole generated league into the mock database and re-renders.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { installMock, freshState, ORGANIZER, type MockState } from "../mock-supabase";
import { waiverVersions, type Acceptance } from "../mock-waiver";
import { signIn, unlockOrganizer } from "../helpers";
import { dateLabel, sessionStartMs, type League } from "./gen";
import season from "../../../automation/season.json";
import fs from "node:fs";

// COVERAGE_DIR=<folder> records which parts of the page ran (Chrome's own coverage), for coverage-report.mjs.
const COVER = process.env.COVERAGE_DIR;

export type Ctx = { page: Page; state: MockState; dates: string[]; fd: number[]; email: string; prompts: string[] };
/** A signed-in page. Pass another page's state to have two people share one database (organizer and player). */
export async function openAs(browser: Browser, who: "admin" | string = "admin", nowMs = Date.parse("2026-09-10T12:00:00-04:00"), shared?: MockState): Promise<Ctx> {
  // Desktop suites use a tall laptop window; the phone project opens the page at that phone's size, with touch.
  const use = test.info().project.use;
  const page = await browser.newPage(use.isMobile ? { viewport: use.viewport, userAgent: use.userAgent, deviceScaleFactor: use.deviceScaleFactor, isMobile: true, hasTouch: use.hasTouch } : { viewport: { width: 1280, height: 900 } });
  if (COVER) await page.coverage.startJSCoverage({ resetOnNavigation: false });
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
  // The sign-in gate closes before its first load completes. Wait for that load
  // before stopping the timer, otherwise startSync can run after we cleared it
  // and race a later synthetic database replacement.
  await expect.poll(()=>page.evaluate(()=>_activeLoads===0&&document.getElementById('slbl')?.textContent==='Synced'),{timeout:15000}).toBe(true);
  await page.evaluate(() => { clearInterval(_syncTimer); _syncTimer = null; });
  await pinSession(page);
  // Expected dates and session starts are worked out here, independently of the app's own DATES table, in the league's
  // time zone whatever zone the tests run in (GitHub's machines use UTC).
  const iso = season.approved_dates as string[];
  const dates = iso.map(dateLabel);
  const fd = iso.map(sessionStartMs);
  return { page, state, dates, fd, email, prompts };
}

// Cases jump the clock by weeks; the session is pinned valid so the app never starts a token refresh mid-load.
export async function pinSession(page: Page) {
  const ok = await page.evaluate(async () => { if (_refreshing) await _refreshing; if (!_session) return false; _session.expires_at = 4102444800; return true; });
  expect(ok, "still signed in").toBe(true);
}
/** Close a suite's page (saving its coverage when COVERAGE_DIR is set). */
export async function closeCtx(ctx?: Ctx) {
  if (!ctx) return;
  try {
    expect(ctx.state.blocked ?? [], "requests that tried to leave the TEST stand-in (production, another project, the live sites)").toEqual([]);
    expect(ctx.state.schemaErrors ?? [], "queries the real database would refuse (a column the table does not have)").toEqual([]);
  }
  finally { await closePage(ctx); }
}
async function closePage(ctx: Ctx) {
  if (COVER) {
    const main = (await ctx.page.coverage.stopJSCoverage()).filter((e) => e.source?.includes("function renderLeaderboard"));
    fs.mkdirSync(COVER, { recursive: true });
    if (main[0] && !fs.existsSync(`${COVER}/source.js`)) fs.writeFileSync(`${COVER}/source.js`, main[0].source!);
    fs.writeFileSync(`${COVER}/cov-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`, JSON.stringify(main.map((e) => e.functions)));
  }
  await ctx.page.close();
}
/** Another person's page catching up with the database (the 20-second sync, in real use). */
export async function refresh(ctx: Ctx) {
  await pinSession(ctx.page);
  await ctx.page.clock.setFixedTime(new Date(ctx.state.nowMs ?? Date.now()));
  const ok = await ctx.page.evaluate(async () => { _undoEpoch++; closeModal(); const r = await loadAll(); renderAll(); return r; });
  expect(ok, "page caught up with the database").toBe(true);
}
export async function load(ctx: Ctx, L: League) {
  // A synthetic database replacement must wait for the previous UI action and read transaction to settle.
  // Otherwise an old league's in-flight reply correctly causes the new optimistic-load guard to discard the result.
  await expect.poll(()=>ctx.page.evaluate(()=>_ckDepth===0&&_activeLoads===0),{timeout:15000}).toBe(true);
  const s = ctx.state;
  const latency = s.latency; s.latency = undefined;   // the league swap itself runs at full speed (slow-connection suites)
  s.players = structuredClone(L.players);
  s.state = {};
  if (L.sessions.length) s.state["completed_sessions"] = { value: JSON.stringify(L.sessions), version: 1 };
  if (L.current) s.state["current_session"] = { value: JSON.stringify(L.current), version: 1 };
  s.state["player_approvals"] = { value: JSON.stringify(Object.fromEntries(L.players.map((p) => [p.id, { approved: p.approved, waitlisted: p.waitlisted }]))), version: 1 };
  s.rsvps = structuredClone(L.rsvps); s.payments = structuredClone(L.payments); s.questions = structuredClone(L.questions) as never; s.announcements = structuredClone(L.announcements) as never;
  s.invitations = { ...L.invitations }; s.undo = []; s.rsvpLog = []; s.audit = []; s.requests = []; s.pushSubs = [];
  s.nowMs = L.nowMs;
  // L20: everyone who registered this season accepted the current waiver when they did, unless the case brings its own records.
  s.waiverVersions = waiverVersions();
  const cur = s.waiverVersions.find((v) => v.is_current)!;
  s.waiverAcceptances = structuredClone((L as { waiverAcceptances?: Acceptance[] }).waiverAcceptances ?? s.players.filter((p) => p.registered_at && String(p.registered_at) >= "2026-09-01").map((p, i) => ({
    id: i + 1, player_id: p.id, user_id: p.user_id ?? s.users[p.email.toLowerCase()] ?? null, email: p.email, participant_name: p.name, typed_signature: p.name, waiver_version: cur.version, waiver_sha256: cur.sha256,
    accepted_at: String(p.registered_at), client_timezone: "America/Toronto", client_utc_offset_minutes: -240, action: "registration", age_declaration: "adult", minor_name: "", media_consent: false, registration_ref: `REG-${p.id}-fixture`, user_agent: "fixture",
  }) as Acceptance));
  await pinSession(ctx.page);
  await ctx.page.clock.setFixedTime(new Date(L.nowMs));
  // Chromium occasionally drops the reply to this long page call ("Resulting promise was garbage collected": twice in
  // about 21,000 cases, on a loaded machine, never with an assertion involved). The load starts by resetting everything,
  // so it is repeated once for that error only; any other error, and every check, fails as before.
  const inPage = async () => {
    // A load the previous case left in flight (a save's own reload) must finish first: finishing after the reset below, it
    // would write the previous database's state versions back and the new league's load would be refused as out of date.
    for (let k = 0; k < 500 && _activeLoads > 0; k++) await new Promise((r) => setTimeout(r, 20));
    // Cancel work the previous league left pending (a save's delayed round advance checks this epoch; the Players tag's
    // attendance save waits a second and would otherwise write the previous league's marks into this one).
    _undoEpoch++; _autoAdvancing = false; _lastAllScoredState = false; clearTimeout(_attSaveTimer); _attSaveTimer = null;
    // A whole new database: forget the versions the page cached from the previous one (a real reload starts empty too).
    for (const k of Object.keys(_stateVersion)) delete _stateVersion[k];
    closeModal(); _expandedHist = {}; _roundSnapshots = []; S.lastUndo = null;
    const t = document.getElementById("_t"); if (t) t.textContent = "";   // no toast carried over from the previous case
    const sel = document.getElementById("sc-sel") as HTMLSelectElement | null; if (sel) sel.value = "";
    const area = document.getElementById("score-area"); if (area) { area.innerHTML = ""; delete area.dataset.cy; delete area.dataset.court; }
    const errs: string[] = []; const orig = console.error;
    console.error = (...a: unknown[]) => { errs.push(a.map((x) => (x instanceof Error ? x.stack || x.message : String(x))).join(" ")); orig(...a); };
    try { const loaded = await loadAll(); renderAll(); closeModal(); return loaded ? "" : errs.join(" | ") || "loadAll returned false"; }
    catch (e) { return String((e as Error).stack || e); } finally { console.error = orig; }
  };
  let ok: string;
  try { ok = await ctx.page.evaluate(inPage); }
  catch (e) { if (!/Resulting promise was garbage collected/.test(String(e))) throw e; ok = await ctx.page.evaluate(inPage); }
  expect(ok, "the league loaded into the app").toBe("");
  s.latency = latency;
}

/** Text of an element with whitespace collapsed, for stable comparisons. */
export const norm = (s: string) => s.replace(/\s+/g, " ").trim();
export async function text(page: Page, sel: string) { return norm(await page.locator(sel).first().innerText()); }
export function inOrder(hay: string, needles: string[], label: string) {
  let at = 0;
  for (const n of needles) { const i = hay.indexOf(n, at); expect(i, `${label}: "${n}" missing or out of order`).toBeGreaterThanOrEqual(0); at = i + n.length; }
}
