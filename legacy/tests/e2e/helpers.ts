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
export async function registerSelf(page: Page, name: string, opt: string | { payment?: string; spare?: boolean; phone?: string } = {}) {
  const o = typeof opt === "string" ? { payment: opt } : opt;
  await expect(page.locator("#page-register")).toHaveClass(/active/);
  if (o.spare) await page.click("#mt-spare-box");
  if (o.payment) await page.check(`input[name="pay-decl"][value="${o.payment}"]`);
  await page.fill("#r-name", name);
  await page.fill("#r-phone", o.phone || "613-555-0100");
  await page.fill("#r-emergency", "Emergency Person 613-555-0101");
  await page.click("text=Continue →");
  // The waiver has to have LOADED before the waiver step can be submitted: regStep2() refuses with "The waiver has not
  // loaded yet" and leaves the form where it is, so #lf-all on the step after never appears and the next line times
  // out on an element that is present but hidden. Racing it passed locally and failed about one CI run in two
  // (opener.spec, 9 October); reproduced on demand with SLOW_NET=200-900. Wait for the precondition instead — if the
  // waiver really never loads, this still fails, and says so.
  await expect.poll(() => page.evaluate(() => !!(S.waiver && S.waiver.body)),
    { message: "the waiver has loaded, so Continue will advance", timeout: 20000 }).toBe(true);
  await page.check("#w1");
  if (await page.locator("#w5-row").isVisible()) await page.check("#w5");
  if (await page.locator("#w6-row").isVisible()) await page.check("#w6");
  await page.fill("#r-sig", name);
  await page.click("#reg-btn");
  await page.check("#lf-all");
  await page.fill("#r-sig-lf", name);
  await page.click("#reg-btn-lf");
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
  // Type only into the form of the current match (the page's own identity: session, round and lineup). Right after the
  // last save of a round the round advances by itself; typing into the previous round's form is refused by the page
  // ("This match changed"), as it should be, so wait for the new round's form like a person would, and for its Save
  // button to be on (it is off while the round is still being saved, p63).
  await expect.poll(() => page.evaluate((c) => { const el = document.getElementById("score-area"); return !!S.current && !S.current.completed && el?.dataset.match === scoreMatchId(c) && !!el.querySelector(`#si_${c}_1_a`) && !(document.getElementById(`sbtn_${c}`) as HTMLButtonElement | null)?.disabled; }, court), { message: `the current match's form on Court ${court}, Save on`, timeout: 15000 }).toBe(true);
  for (const [i, [a, b]] of scores.entries()) {
    // Each score must land in its box before Save (p72: a redraw while typing once dropped a keystroke silently).
    await page.fill(`#si_${court}_${i + 1}_a`, String(a));
    await expect(page.locator(`#si_${court}_${i + 1}_a`)).toHaveValue(String(a));
    await page.fill(`#si_${court}_${i + 1}_b`, String(b));
    await expect(page.locator(`#si_${court}_${i + 1}_b`)).toHaveValue(String(b));
  }
  const saved = await page.evaluate(() => S.current ? Object.keys(S.current.scores).length : 0);
  await page.click(`#sbtn_${court}`);
  // The save is done when the session holds more scores; the score area may re-render (auto-advance) right after.
  await expect.poll(() => page.evaluate(() => S.current ? Object.keys(S.current.scores).length : Infinity), { timeout: 15000 }).toBeGreaterThan(saved);
}
export type Score = { a1: number | null; a2: number | null; b1: number | null; b2: number | null; w: string; sA: number; sB: number };
export type Sess = { scores: Record<string, Score>; attendance?: Record<string, string> };
// The rating reference lives with the other independent references (legacy/tests/unit/elo-reference.mjs) so the unit
// tests and the browser tests check the app against exactly the same rules, written once.
import { eloReference as eloRef, eloEarned as eloEarnedRef, seedRatings as seedRef, firstCourts as firstCourtsRef, NO_SHOW_PENALTY } from "../unit/elo-reference.mjs";
export { NO_SHOW_PENALTY };
export const firstCourts = (sessions: Sess[]): Record<number, number> => firstCourtsRef(sessions as never) as Record<number, number>;
/** p84: `applyUpTo` limits how many sessions are PLAYED OUT; the seeding always reads the whole list.
 *  p99: `seeds` are the starting points the organizer set for a drop-in. p105: a no-show costs NO_SHOW_PENALTY. */
export const eloReference = (players: MockState["players"], sessions: Sess[], applyUpTo?: number, seeds?: Record<number, number>): Record<number, number> =>
  eloRef(players as never, sessions as never, applyUpTo as never, seeds as never) as Record<number, number>;
/** p106: the number each player started the season from, and what they have earned since — the court order reads the latter. */
export const seedRatings = (players: MockState["players"], sessions: Sess[], seeds?: Record<number, number>): Record<number, number> =>
  seedRef(players as never, sessions as never, seeds as never) as Record<number, number>;
export const eloEarned = (players: MockState["players"], sessions: Sess[], seeds?: Record<number, number>): Record<number, number> =>
  eloEarnedRef(players as never, sessions as never, seeds as never) as Record<number, number>;
export const wl = (text: string) => [...text.matchAll(/(\d+)W (\d+)L/g)].map((m) => ({ w: +m[1], l: +m[2] }));
const SHOTS = process.env.SCREENS ? `${__dirname}/screens/${process.env.SCREENS}` : "";
export async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: true });
}
