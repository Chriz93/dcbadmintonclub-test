// Scores: pick a court, read the pairings and saved games, type a score, watch the live check and save — on 100 leagues.
import { test, expect } from "@playwright/test";
import { openAs, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, combos, target, NC, type LiveState } from "./gen";

const LIVES: LiveState[] = ["r1-partial", "r2-partial", "r1-partial", "r1-done", "r2-partial", "complete", "r1-partial", "none"];
const modeLabel = (n: number) => (n === 5 ? "Five players — rotating doubles, 5 games to 15" : n === 4 ? "Doubles (4 players) — 3 games to 21" : n === 3 ? "⚠️ 3 Players — Round-Robin Singles" : "⚠️ 2 Players — Singles Best of 3");
function verdict(a: string, b: string, T: number) {
  const sa = parseInt(a), sb = parseInt(b);
  if (isNaN(sa) || isNaN(sb)) return { err: "Enter both scores", sa, sb };
  if (sa === sb) return { err: `Tied ${sa}–${sb} is not a finished game — one side must reach ${T}`, sa, sb };
  const hi = Math.max(sa, sb), lo = Math.min(sa, sb);
  if (hi > T) return { err: `Games end at ${T} — no deuce`, sa, sb };
  if (hi < T) return { err: `The winner must reach ${T} (entered ${hi})`, sa, sb };
  if (lo >= T) return { err: `Only one side can reach ${T}`, sa, sb };
  return { err: "", sa, sb };
}

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await ctx?.page.close(); });
for (let i = 0; i < 100; i++) {
  const size = i % 4 === 0 ? { regulars: 25, declineRate: 0, absentRate: 0 } : i % 4 === 1 ? { regulars: 5 + (i % 3), spares: 0 } : {};
  const opts = { ...variety(i + 2), ...size, live: LIVES[i % LIVES.length], sessions: i % 5 };
  test(`Scores ${String(i + 1).padStart(3, "0")} · ${genLeague(11000 + i, opts).title}`, async () => {
    const L = genLeague(11000 + i, { ...opts, dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page, r = rng(500 + i);
    await page.evaluate(() => nav("scores"));
    const cur = L.current;
    const playable = cur ? [...Array(NC).keys()].map((k) => k + 1).filter((c) => (cur.assignments[c] || []).length >= 2) : [];
    const c = cur && playable.length && i % 9 !== 4 ? playable[Math.floor(r() * playable.length)] : 1 + (i % NC);
    await page.locator("#sc-sel").selectOption(String(c));
    const area = page.locator("#score-area");
    if (!cur) { await expect(area).toContainText("No active session. Ask admin to start one."); return; }
    if (cur.completed) { await expect(area).toContainText("Session Complete"); await expect(area.getByRole("button", { name: /End Session/ })).toBeVisible(); return; }
    const ids = cur.assignments[c] || [];
    if (ids.length < 2) { await expect(area).toContainText(`Court ${c} has ${ids.length === 0 ? "no" : "only 1"} player assigned — minimum 2 needed.`); return; }
    const name = (id: number) => L.players.find((p) => p.id === id)!.name, cy = cur.cycle, T = target(ids.length);
    await expect(area.locator(".alert").first()).toHaveText(`Court ${c} · Round ${cy} · ${modeLabel(ids.length)}`);
    const grid = (await area.locator(".card").first().locator("div[style*='grid'] > div").allInnerTexts()).map(norm);
    expect(grid, "players listed A, B, C… in court order").toEqual(ids.map((id, k) => `${"ABCDE"[k]}: ${name(id)}`));
    const games = combos(ids), blocks = area.locator(".game-block");
    await expect(blocks).toHaveCount(games.length);
    for (let g = 0; g < games.length; g++) {
      const gm = games[g], b = blocks.nth(g), saved = cur.scores[`c${c}_y${cy}_g${g + 1}`];
      const names = (await b.locator(".tnames").allInnerTexts()).map(norm);
      expect(names, `game ${g + 1}: sides`).toEqual([[gm.a1, gm.a2], [gm.b1, gm.b2]].map((s) => s.filter((x): x is number => x != null).map(name).join(" & ")));
      expect(await b.locator(".saved-pill").count(), `game ${g + 1}: saved mark`).toBe(saved ? 1 : 0);
      await expect(b.locator("input").nth(0)).toHaveValue(saved ? String(saved.sA) : "");
      await expect(b.locator("input").nth(1)).toHaveValue(saved ? String(saved.sB) : "");
    }
    // Which game to type into: an open one when saving it cannot finish the round (the round advance has its own suite).
    const missingAll: string[] = [];
    for (let cc = 1; cc <= NC; cc++) { const n = (cur.assignments[cc] || []).length; if (n < 2) continue; for (let g = 1; g <= (n === 5 ? 5 : 3); g++) if (!cur.scores[`c${cc}_y${cy}_g${g}`]) missingAll.push(`${cc}_${g}`); }
    const openHere = games.map((_, g) => g + 1).filter((g) => !cur.scores[`c${c}_y${cy}_g${g}`]);
    const g = openHere.length && missingAll.length >= 2 ? openHere[Math.floor(r() * openHere.length)] : 1 + Math.floor(r() * games.length);
    const lo = String(Math.floor(r() * (T - 1)));
    const kinds: [string, string][] = [[String(T), lo], [lo, String(T)], [String(T), String(T)], [String(T + 1 + Math.floor(r() * 5)), lo], [String(T - 1), lo], ["", lo], [String(T), ""], ["7", "7"]];
    const [a, b] = kinds[Math.floor(r() * kinds.length)];
    const v = verdict(a, b, T);
    const ia = page.locator(`#si_${c}_${g}_a`), ib = page.locator(`#si_${c}_${g}_b`);
    await ia.fill(a); await ib.fill(b);
    const live = norm(await page.locator(`#wr_${c}_${g}`).innerText());
    if (isNaN(v.sa) || isNaN(v.sb)) expect(live, "no verdict until both scores are typed").toBe("");
    else expect(live, "live check under the inputs").toBe(v.err ? `❌ ${v.err}` : v.sa > v.sb ? `Team A wins ${v.sa}–${v.sb}` : `Team B wins ${v.sb}–${v.sa}`);
    const before = JSON.parse(ctx.state.state["current_session"].value);
    await blocks.nth(g - 1).getByRole("button", { name: `💾 Save Game ${g}` }).click();
    if (v.err) {
      await expect(page.locator("#_t")).toHaveText(v.err);
      expect(JSON.parse(ctx.state.state["current_session"].value).scores, "nothing saved").toEqual(before.scores);
      return;
    }
    await expect(page.locator("#_t")).toHaveText(`Game ${g} saved!`);
    const gm = games[g - 1];
    const stored = JSON.parse(ctx.state.state["current_session"].value).scores[`c${c}_y${cy}_g${g}`];
    expect(stored, "saved to the database as typed").toEqual({ a1: gm.a1, a2: gm.a2, b1: gm.b1, b2: gm.b2, sA: v.sa, sB: v.sb, w: v.sa > v.sb ? "A" : "B" });
    await expect(blocks.nth(g - 1).locator(".saved-pill")).toHaveCount(1);
    await expect(ia).toHaveClass(v.sa > v.sb ? /win/ : /lose/);
  });
}
