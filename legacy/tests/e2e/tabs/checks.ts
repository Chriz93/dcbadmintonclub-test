// Cross-tab checks: after an action, rebuild the league from what the database now holds and re-check every tab against
// the independent oracles. Used by the interoperation suite.
import { expect, type Page } from "@playwright/test";
import { norm, inOrder, type Ctx } from "./harness";
import { NC, type League } from "./gen";
import { leaders, rankings, stats, sessionsTab, history, courtHistory, pos, courts } from "./oracle";

export function kvOf(ctx: Ctx, k: string) { const v = ctx.state.state[k]; return v && v.value !== "null" ? JSON.parse(v.value) : null; }
/** The league exactly as the database holds it now. */
export function fromDb(ctx: Ctx, base: League): League {
  const s = ctx.state, sessions = kvOf(ctx, "completed_sessions") || [], current = kvOf(ctx, "current_session");
  return { ...base, players: structuredClone(s.players), sessions, current, rsvps: structuredClone(s.rsvps), payments: structuredClone(s.payments),
    questions: structuredClone(s.questions) as never, announcements: structuredClone(s.announcements) as never, nowMs: s.nowMs!, upcoming: current ? current.number : Math.min(sessions.length + 1, 28), pre: current ? {} : kvOf(ctx, "pre_session_attendance") || {} };
}
async function standings(page: Page, label: RegExp) {
  await page.evaluate(() => nav("standings"));
  await page.locator("#page-standings .ptab").filter({ hasText: label }).click();
}
export async function checkLeaders(page: Page, L: League) {
  await standings(page, /Leaders$/);
  const exp = leaders(L);
  if (!exp.length) return expect(page.locator("#sec-lb")).toContainText("No active players yet");
  const rows = await page.$$eval("#sec-lb .lbrow", (rs) => rs.map((r) => ({ name: (r.querySelector(".lbname")!.textContent || "").replace(/\s+/g, " ").trim(), sub: (r.querySelector(".lbsub")!.textContent || "").replace(/\s+/g, " ").trim(), nums: [...r.querySelectorAll(".lbnum .v")].map((v) => (v.textContent || "").trim()) })));
  expect(rows.length, "Leaders: one row per player").toBe(exp.length);
  exp.forEach((e, k) => {
    expect(rows[k].name.startsWith(e.name), `Leaders row ${k + 1}: expected ${e.name}, got ${rows[k].name}`).toBe(true);
    expect(rows[k].sub.startsWith(`${e.label} · ${e.W}W ${e.L}L · ${e.wr}%`), `Leaders row ${k + 1} (${e.name}): ${rows[k].sub}`).toBe(true);
    expect(rows[k].nums, `Leaders row ${k + 1} (${e.name})`).toEqual([String(e.W), String(e.L), `${e.wr}%`]);
  });
}
export async function checkRankings(page: Page, L: League) {
  await standings(page, /Rankings$/);
  const { elo, rows: exp } = rankings(L);
  if (!exp.length) return;
  expect(await page.evaluate(() => computeEloRatings()), "Rankings: every rating equals the independent Elo").toEqual(elo);
  const shown = await page.$$eval("#sec-rank .lbrow", (rs) => rs.map((r) => parseInt((r.textContent || "").match(/(\d{3,4})\s*ELO/)![1])));
  expect(shown, "Rankings: sorted by rating").toEqual(exp.map((e) => e.rating));
}
export async function checkStats(page: Page, L: League) {
  await standings(page, /Stats$/);
  const { cards: exp } = stats(L);
  if (!exp.length) return;
  const cards = await page.$$eval("#sec-pstats > .card", (cs) => cs.filter((c) => !(c.textContent || "").includes("Season Awards")).map((c) => [...c.querySelectorAll(".sbox .sv")].map((v) => (v.textContent || "").trim())));
  expect(cards, "Stats: wins, losses, win rate, best court per player").toEqual(exp.map((e) => [String(e.W), String(e.L), `${e.wr}%`, e.bestCourt]));
}
export async function checkSessions(page: Page, L: League) {
  await standings(page, /Sessions$/);
  const exp = sessionsTab(L);
  if (!exp.length) return expect(page.locator("#sec-sessstand")).toContainText("No completed sessions yet");
  // textContent: the card titles are styled in capitals once the tab is on screen.
  const cards = (await page.locator("#sec-sessstand .card").allTextContents()).map(norm);
  expect(cards.length, "Sessions: one card per finished night").toBe(exp.length);
  exp.forEach((e, k) => { expect(cards[k]).toContain(e.title); inOrder(cards[k], e.courts.flat(), `Sessions card ${k + 1}`); });
}
export async function checkHistory(page: Page, L: League) {
  await standings(page, /History$/);
  const exp = history(L);
  if (!exp.length) return expect(page.locator("#sec-hist")).toContainText("No completed sessions yet");
  const heads = (await page.locator("#sec-hist .card").allInnerTexts()).map(norm);
  expect(heads.length).toBe(exp.length);
  exp.forEach((e, k) => { expect(heads[k]).toContain(e.head); expect(heads[k]).toContain(`${e.rounds} rounds`); expect(heads[k]).toContain(`${e.games} games`); });
}
export async function checkCourtHistory(page: Page, L: League) {
  await standings(page, /Court history$/);
  if (!L.sessions.length) return expect(page.locator("#sec-heat")).toContainText("No sessions yet");
  const rows = await page.$$eval("#sec-heat .heatmap-row", (rs) => rs.map((r) => ({ name: r.querySelector(".heatmap-name")?.textContent || "", cells: [...r.querySelectorAll(".hm-cell")].map((c) => c.textContent || "") })));
  expect(rows, "Court history").toEqual(courtHistory(L));
}
export async function checkPOS(page: Page, L: League) {
  const p = pos(L), banner = page.locator("#pos-standings");
  if (p) { await expect(banner.locator(".pos-name")).toHaveText(p.name); expect(norm(await banner.locator(".pos-stat").innerText())).toBe(p.stat); }
  else expect(norm(await banner.innerText())).toBe("");
}
export async function checkCourts(page: Page, L: League) {
  await page.evaluate(() => nav("courts"));
  const exp = courts(L);
  await expect(page.locator("#courts-sub")).toHaveText(exp.sub);
  if (!L.players.length) return;
  for (const e of exp.courts) {
    const t = norm(await page.locator(`#court-gym-view .gym-court[onclick="showCourtDetail(${e.c})"]`).innerText());
    expect(t, `Courts C${e.c}: count`).toContain(`${e.count}/${e.cap}`);
    for (const f of e.firsts) expect(t, `Courts C${e.c}: ${f}`).toContain(f);
  }
}
export async function checkSchedule(page: Page, L: League) {
  await page.evaluate(() => nav("schedule"));
  const rows = (await page.locator("#sched-list .sched-row").allInnerTexts()).map(norm);
  rows.forEach((t, k) => {
    const want = L.sessions.some((s) => s.number === k + 1) ? "Done" : L.current?.number === k + 1 ? "Active" : "—";
    expect(t.endsWith(want), `Schedule row ${k + 1}: ${t}`).toBe(true);
  });
}
export async function checkHomeLine(page: Page, L: League, dates: string[]) {
  await page.evaluate(() => nav("home"));
  const done = !L.current && L.sessions.length >= 28, U = L.current ? L.current.number : Math.min(L.sessions.length + 1, 28);
  await expect(page.locator("#next-date")).toHaveText(done ? "Season Complete! 🎉" : `Session ${U} — ${dates[U - 1]}${L.current ? " · in progress" : ""}`);
}
/** Every read-only tab against the database state. */
export async function checkAllTabs(ctx: Ctx, L: League) {
  const page = ctx.page;
  await checkLeaders(page, L); await checkRankings(page, L); await checkStats(page, L); await checkSessions(page, L);
  await checkHistory(page, L); await checkCourtHistory(page, L); await checkPOS(page, L);
  await checkCourts(page, L); await checkSchedule(page, L); await checkHomeLine(page, L, ctx.dates);
}
export const courtOfIn = (a: Record<string, number[]> | undefined, id: number) => { for (let c = 1; c <= NC; c++) if ((a?.[c] || []).includes(id)) return c; return 0; };
