import { test, expect, type Page } from "@playwright/test";
import { installMock, freshState, ORGANIZER, type MockState } from "./mock-supabase";

async function signIn(page: Page, email: string) {
  await page.fill("#signin-email-input", email);
  await page.click("#signin-btn");
  await expect(page.locator("#signin-code-input")).toBeVisible();
  await page.fill("#signin-code-input", "123456");
  await page.click("#signin-btn");
  await expect(page.locator("#invite-gate")).toBeHidden();
}
async function unlockOrganizer(page: Page) {
  await page.click("#bnav-admin");
  await expect(page.locator("#admin-lock-msg")).toContainText(/authenticator|Enter the 6-digit/i);
  await page.fill("#pin-inp", "654321");
  await page.click("#admin-lock button.btn-primary");
  await expect(page.locator("#admin-panel")).toBeVisible();
}
type Game = { g: number; a1: number; a2: number | null; b1: number; b2: number | null };
async function courtGames(page: Page, court: number): Promise<Game[]> {
  return page.evaluate((c) => {
    const players = (S.current.assignments[c] || []).map((id: number) => S.players.find((p: { id: number }) => p.id === id));
    return buildCombos(players).map((x: Game) => ({ g: x.g, a1: x.a1, a2: x.a2, b1: x.b1, b2: x.b2 }));
  }, court);
}
async function scoreCourt(page: Page, court: number, scores: [number, number][]) {
  await page.selectOption("#sc-sel", String(court));
  for (const [i, [a, b]] of scores.entries()) {
    await page.fill(`#si_${court}_${i + 1}_a`, String(a));
    await page.fill(`#si_${court}_${i + 1}_b`, String(b));
  }
  await page.click(`#sbtn_${court}`);
  await expect(page.locator(`#sbtn_${court}`)).toBeEnabled({ timeout: 10000 });
}
const FOUR: [number, number][] = [[21, 15], [21, 10], [18, 21]]; // A top on points, D bottom
const TIE_COURT: [number, number][] = [[21, 19], [19, 21], [21, 19]]; // A/B fully tied, C/D fully tied
const FIVE: [number, number][] = [[15, 10], [15, 9], [15, 12], [15, 8], [15, 11]];

test.describe.serial("2026–27 match night on the test copy (mocked database rules)", () => {
  let state: MockState;
  test.beforeEach(async ({ page }) => {
    state = freshState();
    await installMock(page, state);
    page.on("dialog", (d) => d.accept());
    await page.goto("/");
  });

  test("organizer runs a 25-player night: five-player Court 6, strict scores, deterministic ties, statistics", async ({ page }) => {
    await signIn(page, ORGANIZER);
    await expect(page.locator("#page-home")).toHaveClass(/active/);
    await expect(page.locator("#season-rules-card")).toContainText("Court 6 runs five players");
    await unlockOrganizer(page);

    // Start session 1: 25 active players → courts of 4 with five on Court 6.
    await page.click("#admin-panel .ptab:has-text('Session')");
    await page.click("text=Start Session 1");
    await expect.poll(() => page.evaluate(() => (S.current ? Object.values(S.current.assignments).map((a: unknown) => (a as number[]).length) : null))).toEqual([4, 4, 4, 4, 4, 5]);
    expect(JSON.parse(state.state["current_session"].value).number).toBe(1);

    await page.click("#bnav-scores");
    // Rejections: over-score, tie, winner short of target; nothing is written.
    await page.selectOption("#sc-sel", "1");
    await page.fill("#si_1_1_a", "22"); await page.fill("#si_1_1_b", "20");
    await expect(page.locator("#wr_1_1")).toContainText("Games end at 21");
    await page.fill("#si_1_1_a", "21"); await page.fill("#si_1_1_b", "21");
    await expect(page.locator("#wr_1_1")).toContainText("not a finished game");
    await page.fill("#si_1_1_a", "20"); await page.fill("#si_1_1_b", "18");
    await expect(page.locator("#wr_1_1")).toContainText("must reach 21");
    await page.click("#sbtn_1");
    expect(state.audit.filter((a) => a.action === "scores.saved")).toHaveLength(0);

    // Five-player court shows five games to 15, everyone rests once.
    const c6 = await courtGames(page, 6);
    expect(c6).toHaveLength(5);
    const rests = c6.map((g) => [21, 22, 23, 24, 25].find((id) => ![g.a1, g.a2, g.b1, g.b2].includes(id)));
    expect(new Set(rests).size).toBe(5);
    await page.selectOption("#sc-sel", "6");
    await expect(page.locator("#score-area")).toContainText("5 games to 15");
    await page.fill("#si_6_1_a", "21"); await page.fill("#si_6_1_b", "3");
    await expect(page.locator("#wr_6_1")).toContainText("Games end at 15");

    // Round 1
    for (const c of [1, 3, 4, 5]) await scoreCourt(page, c, FOUR);
    await scoreCourt(page, 2, TIE_COURT);
    await scoreCourt(page, 6, FIVE);
    expect(state.audit.filter((a) => a.action === "scores.saved")).toHaveLength(6);

    // Auto-advance (organizer) → round 2 with ladder movement and tie rule applied.
    await expect.poll(() => page.evaluate(() => S.current?.cycle), { timeout: 15000 }).toBe(2);
    const r2 = await page.evaluate(() => JSON.parse(JSON.stringify(S.current.assignments)));
    expect(Object.values(r2).map((a) => (a as number[]).length)).toEqual([4, 4, 4, 4, 4, 5]);
    expect(new Set(Object.values(r2).flat()).size).toBe(25);
    // Court 2: A, B and D finish 2–1 with equal points and differential; head-to-head and points conceded
    // are also level, so registration order (lowest id) decides: A (5) moves up, C (7, no wins) moves down.
    expect(r2["1"]).toContain(5); expect(r2["1"]).not.toContain(4); // court-1 loser (4) went down
    expect(r2["2"]).toContain(4); expect(r2["3"]).toContain(7);
    expect(r2["5"]).toContain(23); expect(r2["6"]).not.toContain(23); // five-player court: C tops on points then differential
    const mv = await page.evaluate(() => S.current.movements[0].mv);
    expect(mv[5]).toBe("up"); expect(mv[7]).toBe("down"); expect(mv[23]).toBe("up"); expect(mv[4]).toBe("down");
    expect(Object.values(mv).filter((m) => m === "up")).toHaveLength(5); expect(Object.values(mv).filter((m) => m === "down")).toHaveLength(5);

    // Round 2 with whatever lineups resulted; then the session completes after the second round.
    for (let c = 1; c <= 6; c++) {
      const games = await courtGames(page, c);
      await scoreCourt(page, c, games.map((_, i) => (games.length === 5 ? [15, 7 + i] : [21, 12 + i])) as [number, number][]);
    }
    await expect.poll(() => page.evaluate(() => S.current?.completed === true), { timeout: 15000 }).toBe(true);
    await page.selectOption("#sc-sel", "1");
    await expect(page.locator("#score-area")).toContainText("Session Complete");
    await page.locator("#score-area button:has-text('End Session')").click();
    await expect.poll(() => JSON.parse(state.state["completed_sessions"]?.value || "[]").length, { timeout: 15000 }).toBe(1);
    const played = state.players.reduce((n, p) => n + p.games_played, 0);
    const wins = state.players.reduce((n, p) => n + p.season_wins, 0);
    const losses = state.players.reduce((n, p) => n + p.season_losses, 0);
    expect(played).toBe(160); expect(wins).toBe(80); expect(losses).toBe(80);
    expect(Object.values(JSON.parse(state.state["completed_sessions"].value)[0].finalAssignments).map((a: unknown) => (a as number[]).length)).toEqual([4, 4, 4, 4, 4, 5]);
    expect(state.players.every((p) => p.current_court >= 1 && p.current_court <= 6)).toBe(true);
    expect(state.requests.some((r) => r.includes("/realtime/"))).toBe(false);
  });

  test("a confirmed player registers first, gets approved, votes; strangers and stale screens are refused", async ({ page }) => {
    // Registration is the first thing after a first sign-in.
    await signIn(page, "christygeorge993+regular@gmail.com");
    await expect(page.locator("#page-register")).toHaveClass(/active/);
    await expect(page.locator("#bnav-courts")).toBeHidden();
    await expect(page.locator("#r-email")).toHaveValue("christygeorge993+regular@gmail.com");
    await expect(page.locator("#r-email")).toHaveAttribute("readonly", "");
    await page.fill("#r-name", "Regular Tester");
    await page.fill("#r-phone", "613-555-0100");
    await page.fill("#r-emergency", "Emergency Person 613-555-0101");
    await page.click("text=Continue →");
    await page.check("#w1"); await page.check("#w5");
    await page.fill("#r-sig", "Regular Tester");
    await page.click("#reg-btn");
    await page.check("#lf-all");
    await page.fill("#r-sig-lf", "Regular Tester");
    await page.click("#reg-btn-lf");
    await expect.poll(() => state.players.find((p) => p.email === "christygeorge993+regular@gmail.com")?.approved).toBe(false);
    const newId = state.players.find((p) => p.email === "christygeorge993+regular@gmail.com")!.id;
    expect(state.players.find((p) => p.id === newId)!.membership_type).toBe("regular");
    await expect(page.locator("#reg-already")).toContainText("pending");

    // A player cannot write shared state or someone else's answer; the database refuses.
    const forged = await page.evaluate(async (other) => { try { await rpc("set_rsvp", { p_session: 1, p_player: other, p_response: "coming" }); return "accepted"; } catch (e) { return (e as Error).message; } }, 3);
    expect(forged).toContain("only answer for yourself");
    const stateWrite = await page.evaluate(async () => { try { await rpc("set_state", { k: "current_session", v: "{}", expected: 0 }); return "accepted"; } catch (e) { return (e as Error).message; } });
    expect(stateWrite).toContain("Organizer verification required");

    // Organizer approves; the player then sees the vote on Home and answers.
    await page.evaluate(() => signOut());
    await signIn(page, ORGANIZER);
    await unlockOrganizer(page);
    await page.evaluate((id) => approvePlayer(id), newId);
    await expect.poll(() => state.players.find((p) => p.id === newId)!.approved).toBe(true);
    state.state["current_session"] = { value: JSON.stringify({ number: 2, cycle: 1, assignments: { 1: [1, 2, 3, 4] }, scores: {}, movements: [], preTosses: {} }), version: 3 };
    await page.evaluate(() => signOut());
    await signIn(page, "christygeorge993+regular@gmail.com");
    await expect(page.locator("#page-home")).toHaveClass(/active/);
    await expect(page.locator("#home-vote")).toContainText("Vote: are you playing Session 2");
    await page.locator("#home-vote button", { hasText: "I'm Coming" }).click();
    await expect.poll(() => state.rsvps.find((r) => r.player_id === newId)?.response).toBe("coming");
    await page.locator("#home-vote button", { hasText: "Not Coming" }).click();
    await expect.poll(() => state.rsvps.find((r) => r.player_id === newId)?.response).toBe("notcoming");
    await expect(page.locator("#home-vote")).toContainText("Sit this one out");

    // Uninvited stranger: no registration.
    await page.evaluate(() => signOut());
    await signIn(page, "stranger@example.invalid");
    await page.fill("#r-name", "Stranger"); await page.fill("#r-phone", "1"); await page.fill("#r-emergency", "x");
    await page.click("text=Continue →");
    await page.check("#w1"); await page.check("#w5"); await page.fill("#r-sig", "Stranger"); await page.click("#reg-btn");
    await page.check("#lf-all"); await page.fill("#r-sig-lf", "Stranger"); await page.click("#reg-btn-lf");
    await expect(page.locator("#toast-container, body")).toContainText("Registration is closed");
    expect(state.players.some((p) => p.email === "stranger@example.invalid")).toBe(false);

    // Stale organizer screen: a newer version exists → refused and reloaded, never overwritten.
    await page.evaluate(() => signOut());
    await signIn(page, ORGANIZER);
    await unlockOrganizer(page);
    const before = state.state["current_session"].value;
    state.state["current_session"].version += 1; // another device saved meanwhile
    const outcome = await page.evaluate(async () => { try { await setKV("current_session", { ...S.current, cycle: 9 }); return "saved"; } catch (e) { return (e as Error).message; } });
    expect(outcome).toContain("Stale state");
    expect(state.state["current_session"].value).toBe(before);
    await expect(page.locator("body")).toContainText("Someone else saved newer changes");
  });

  test("season rollover archives results, zeroes statistics and requires fresh registration", async ({ page }) => {
    state.state["completed_sessions"] = { value: JSON.stringify([{ id: 1, number: 1, date: "Sep 15, 2026", scores: {} }]), version: 4 };
    state.players[0].season_wins = 5; state.players[0].games_played = 6;
    await signIn(page, ORGANIZER);
    await unlockOrganizer(page);
    await page.click("#admin-panel .ptab:has-text('Tools')");
    await page.fill("#new-season-label", "2025-26");
    await page.click("text=Archive season and start fresh");
    await expect.poll(() => state.players[0].season_wins).toBe(0);
    expect(state.state["archive_2025-26"]).toBeTruthy();
    expect(state.state["completed_sessions"]).toBeUndefined();
    expect(state.players.every((p) => !p.approved)).toBe(true);
    // A returning player now lands on registration with details prefilled.
    state.users["test-player-01@example.invalid"] = "00000000-0000-4000-8000-000000000099";
    await page.evaluate(() => signOut());
    await signIn(page, "test-player-01@example.invalid");
    await expect(page.locator("#page-register")).toHaveClass(/active/);
    await expect(page.locator("#reg-already")).toContainText("Welcome back");
    await expect(page.locator("#r-name")).toHaveValue("TEST Player 01");
  });
});
declare const S: { current: any; players: any[] };
declare function buildCombos(players: unknown[]): Game[];
declare function rpc(fn: string, args: unknown): Promise<unknown>;
declare function setKV(k: string, v: unknown): Promise<void>;
declare function signOut(): Promise<void>;
declare function approvePlayer(id: number): Promise<void>;
