import { expect, test, type Page } from "@playwright/test";
import type { MockState } from "./mock-supabase";

export async function signIn(page: Page, email: string) {
  await page.fill("#signin-email-input", email);
  await page.click("#signin-btn");
  await expect(page.locator("#signin-code-input")).toBeVisible();
  await page.fill("#signin-code-input", "123456");
  await page.click("#signin-btn");
  await expect(page.locator("#invite-gate")).toBeHidden();
}
export async function unlockOrganizer(page: Page) {
  await page.click("#bnav-admin");
  await expect(page.locator("#admin-lock-msg")).toContainText(/authenticator|Enter the 6-digit/i);
  await page.fill("#pin-inp", "654321");
  await page.click("#admin-lock button.btn-primary");
  await expect(page.locator("#admin-panel")).toBeVisible();
}
export type Game = { g: number; a1: number; a2: number | null; b1: number; b2: number | null };
export async function courtGames(page: Page, court: number): Promise<Game[]> {
  return page.evaluate((c) => {
    const players = (S.current.assignments[c] || []).map((id: number) => S.players.find((p: { id: number }) => p.id === id));
    return buildCombos(players).map((x: Game) => ({ g: x.g, a1: x.a1, a2: x.a2, b1: x.b1, b2: x.b2 }));
  }, court);
}
export async function scoreCourt(page: Page, court: number, scores: [number, number][]) {
  await page.selectOption("#sc-sel", String(court));
  for (const [i, [a, b]] of scores.entries()) {
    await page.fill(`#si_${court}_${i + 1}_a`, String(a));
    await page.fill(`#si_${court}_${i + 1}_b`, String(b));
  }
  const saved = await page.evaluate(() => S.current ? Object.keys(S.current.scores).length : 0);
  await page.click(`#sbtn_${court}`);
  // The save is done when the session holds more scores; the score area may re-render (auto-advance) right after.
  await expect.poll(() => page.evaluate(() => S.current ? Object.keys(S.current.scores).length : Infinity), { timeout: 15000 }).toBeGreaterThan(saved);
}
export type Score = { a1: number | null; a2: number | null; b1: number | null; b2: number | null; w: string; sA: number; sB: number };
export type Sess = { scores: Record<string, Score> };
// Independent Elo reference (team-average expectation, K = 32, mean change per round, ratings frozen within a round).
export function eloReference(players: MockState["players"], sessions: Sess[]): Record<number, number> {
  const elo: Record<number, number> = {};
  for (const p of players) if (p.current_court > 0 || p.games_played > 0 || p.season_wins > 0) {
    const seed = p.highest_court > 0 && p.highest_court <= 6 ? p.highest_court : p.current_court > 0 ? p.current_court : 6;
    elo[p.id] = 1500 - (seed - 1) * 100;
  }
  const r = (id: number) => elo[id] ?? 1000;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  for (const sess of sessions) {
    const cycles = [...new Set(Object.keys(sess.scores).map((k) => parseInt(k.match(/_y(\d+)_/)![1])))].sort((a, b) => a - b);
    for (const cy of cycles) {
      const sum: Record<number, number> = {}, cnt: Record<number, number> = {};
      for (const [k, sc] of Object.entries(sess.scores)) {
        if (!k.includes(`_y${cy}_`) || (sc.w !== "A" && sc.w !== "B")) continue;
        const A = [sc.a1, sc.a2].filter((x): x is number => x != null), B = [sc.b1, sc.b2].filter((x): x is number => x != null);
        const ea = 1 / (1 + Math.pow(10, (avg(B.map(r)) - avg(A.map(r))) / 400));
        for (const id of A) { sum[id] = (sum[id] || 0) + ((sc.w === "A" ? 1 : 0) - ea); cnt[id] = (cnt[id] || 0) + 1; }
        for (const id of B) { sum[id] = (sum[id] || 0) + ((sc.w === "B" ? 1 : 0) - (1 - ea)); cnt[id] = (cnt[id] || 0) + 1; }
      }
      for (const id of Object.keys(sum).map(Number)) elo[id] = r(id) + 32 * (sum[id] / cnt[id]);
    }
  }
  return Object.fromEntries(Object.entries(elo).map(([k, v]) => [k, Math.round(v)]));
}
export const wl = (text: string) => [...text.matchAll(/(\d+)W (\d+)L/g)].map((m) => ({ w: +m[1], l: +m[2] }));
const SHOTS = process.env.SCREENS ? `${__dirname}/screens/${process.env.SCREENS}` : "";
export async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: true });
}
