import { test, expect, type Page } from "@playwright/test";
import { installMock, freshState, ORGANIZER, type MockState } from "./mock-supabase";
import { signIn, unlockOrganizer, courtGames, scoreCourt, eloReference, wl, shot, type Sess } from "./helpers";

async function registerSelf(page: Page, name: string) {
  await expect(page.locator("#page-register")).toHaveClass(/active/);
  await page.fill("#r-name", name);
  await page.fill("#r-phone", "613-555-0100");
  await page.fill("#r-emergency", "Emergency Person 613-555-0101");
  await page.click("text=Continue →");
  await page.check("#w1");
  if (await page.locator("#w5-row").isVisible()) await page.check("#w5");
  if (await page.locator("#w6-row").isVisible()) await page.check("#w6");
  await page.fill("#r-sig", name);
  await page.click("#reg-btn");
  await page.check("#lf-all");
  await page.fill("#r-sig-lf", name);
  await page.click("#reg-btn-lf");
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

    // ── Every tab reads the same season record ──────────────────────────────────────────────
    const done = JSON.parse(state.state["completed_sessions"].value) as (Sess & { number: number; date: string; playerNames: Record<string, string> })[];
    expect(Object.keys(done[0].scores)).toHaveLength(40); // 5 courts × 3 games + 1 court × 5 games, two rounds
    expect(done[0].date).toBe("Sep 15, 2026");
    const byId = Object.fromEntries(state.players.map((p) => [p.id, p]));
    await expect(page.locator("#modal")).toHaveClass(/open/); // session summary shown to the organizer
    await page.evaluate(() => closeModal());
    await page.click("#bnav-standings");
    // Leaders: 25 rows, each row's record equals the database statistics, totals 80/80.
    const lb = wl(await page.locator("#sec-lb").innerText());
    expect(lb).toHaveLength(25);
    expect(lb.reduce((n, x) => n + x.w, 0)).toBe(80); expect(lb.reduce((n, x) => n + x.l, 0)).toBe(80);
    // Rankings: Elo values match the independent reference, sorted high to low, first-round winners above first-round losers.
    await page.click("#page-standings .ptab:has-text('Rankings')");
    await expect(page.locator("#sec-rank")).toContainText("Elo rating");
    const appElo = await page.evaluate(() => computeEloRatings() as Record<number, number>);
    const refElo = eloReference(state.players, done);
    expect(appElo).toEqual(refElo);
    expect(await page.evaluate(() => JSON.stringify(computeEloRatings()))).toBe(JSON.stringify(appElo)); // deterministic
    const shown = (await page.locator("#sec-rank .lbrow").allInnerTexts()).map((t) => parseInt(t.match(/(\d{3,4})\s*ELO/)![1]));
    expect(shown).toHaveLength(25);
    expect([...shown].sort((a, b) => b - a)).toEqual(shown);
    expect(new Set(shown)).toEqual(new Set(Object.values(appElo)));
    for (const p of state.players) { // rating moved in the direction of the player's record, never further than 32 per round
      const seed = 1500 - (p.highest_court - 1) * 100;
      expect(Math.abs(appElo[p.id] - seed)).toBeLessThanOrEqual(64);
      if (p.season_wins === p.games_played) expect(appElo[p.id]).toBeGreaterThan(seed);
      if (p.season_losses === p.games_played) expect(appElo[p.id]).toBeLessThan(seed);
    }
    // A player's game history lists exactly their games, with the frozen names.
    await page.locator("#sec-rank .lbrow").first().click();
    const topName = (await page.locator("#sec-rank .lbrow .lbname").first().innerText()).trim();
    const top = state.players.find((p) => p.name === topName)!;
    await expect(page.locator("#modal-title")).toContainText(top.name);
    expect(await page.locator("#modal-body .gh-row").count()).toBe(top.games_played);
    expect(await page.locator("#modal-body .gh-row:has-text('?')").count()).toBe(0);
    await page.locator("#modal button:has-text('Close')").click();
    // Stats: per-player wins/games equal the database.
    await page.click("#page-standings .ptab:has-text('Stats')");
    for (const p of state.players.slice(0, 5)) {
      const card = page.locator("#sec-pstats .card", { hasText: p.name }).filter({ hasNotText: "Season Awards" }).first();
      await expect(card.locator(".sbox", { hasText: "Wins" }).locator(".sv")).toHaveText(String(p.season_wins));
    }
    // Sessions: final placements per court sum to 25 and carry the single-year date.
    await page.click("#page-standings .ptab:has-text('Sessions')");
    await expect(page.locator("#sec-sessstand")).toContainText("Session 1 — Sep 15, 2026 · 2 Rounds");
    expect(await page.locator("#sec-sessstand").innerText()).not.toContain("2026, 2026");
    expect(wl(await page.locator("#sec-sessstand").innerText()).reduce((n, x) => n + x.w, 0)).toBe(80);
    // History: one card, 2 rounds, 40 games, expandable to the round-by-round scores.
    await page.click("#page-standings .ptab:has-text('History')");
    await expect(page.locator("#sec-hist")).toContainText("Session 1 — Sep 15, 2026");
    await expect(page.locator("#sec-hist")).toContainText("2 rounds");
    await expect(page.locator("#sec-hist")).toContainText("40 games");
    await page.locator("#sec-hist .card").first().click();
    await expect(page.locator("#sec-hist")).toContainText("Round 2");
    // Home and Schedule agree on what comes next.
    await page.click("#bnav-home");
    await expect(page.locator("#next-date")).toContainText("Session 2 — Sep 22, 2026");
    await expect(page.locator("#pos-home")).toContainText("Player of Session 1");
    await page.click("#bnav-schedule");
    const rows = page.locator("#sched-list .sched-row");
    await expect(rows).toHaveCount(28);
    await expect(rows.nth(0)).toContainText("Done");
    await expect(rows.nth(1)).toContainText("Sep 22, 2026");
    await shot(page, "schedule");
    await page.click("#bnav-home"); await shot(page, "home-organizer");
    await page.click("#bnav-standings"); await page.click("#page-standings .ptab:has-text('Leaders')"); await shot(page, "standings-leaders");
    await page.click("#page-standings .ptab:has-text('Rankings')"); await shot(page, "standings-rankings");
    await page.click("#page-standings .ptab:has-text('History')"); await shot(page, "standings-history");
    await page.click("#bnav-courts"); await shot(page, "courts");
    void byId;
    expect(state.requests.some((r) => r.includes("/realtime/"))).toBe(false);
  });

  test("a confirmed player registers first, gets approved, votes; strangers and stale screens are refused", async ({ page }) => {
    await shot(page, "signin");
    // Registration is the first thing after a first sign-in.
    await signIn(page, "christygeorge993+regular@gmail.com");
    await expect(page.locator("#page-register")).toHaveClass(/active/);
    await shot(page, "register");
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
    await page.evaluate(() => signOut());
    await signIn(page, "christygeorge993+regular@gmail.com");
    await expect(page.locator("#page-home")).toHaveClass(/active/);
    // Voting is open for the upcoming session before the organizer starts the night.
    await expect(page.locator("#next-date")).toHaveText("Session 1 — Sep 15, 2026");
    await expect(page.locator("#home-vote")).toContainText("Vote: are you playing Session 1 (Sep 15, 2026)");
    await shot(page, "home-player");
    await page.locator("#home-vote button", { hasText: "I'm Coming" }).click();
    await expect.poll(() => state.rsvps.find((r) => r.player_id === newId)?.session_number).toBe(1);
    // Once the organizer starts Session 2 (Session 1 done elsewhere), the same card asks about Session 2.
    state.state["current_session"] = { value: JSON.stringify({ number: 2, cycle: 1, assignments: { 1: [1, 2, 3, 4] }, scores: {}, movements: [], preTosses: {} }), version: 3 };
    await page.evaluate(async () => { await loadAll(); renderAll(); });
    await expect(page.locator("#next-date")).toContainText("Session 2 — Sep 22, 2026 · in progress");
    await expect(page.locator("#home-vote")).toContainText("Vote: are you playing Session 2");
    await page.locator("#home-vote button", { hasText: "I'm Coming" }).click();
    await expect.poll(() => state.rsvps.find((r) => r.player_id === newId && r.session_number === 2)?.response).toBe("coming");
    await page.locator("#home-vote button", { hasText: "Not Coming" }).click();
    await expect.poll(() => state.rsvps.find((r) => r.player_id === newId && r.session_number === 2)?.response).toBe("notcoming");
    await expect(page.locator("#home-vote")).toContainText("Sit this one out");

    // The organizer invites a new player from the Registered tab, and can register as a player without an invitation.
    await page.evaluate(() => signOut());
    await signIn(page, ORGANIZER);
    await unlockOrganizer(page);
    await page.evaluate(() => showSec("admin", "a-reg"));
    await page.fill("#inv-email", "Newbie@Example.invalid"); await page.selectOption("#inv-type", "spare");
    await page.click("#invite-card button:has-text('Send invitation')");
    await expect.poll(() => state.invitations["newbie@example.invalid"]).toBe("spare");
    await expect(page.locator("#invite-card")).toContainText("newbie@example.invalid");
    await page.evaluate(() => nav("register"));
    await registerSelf(page, "Christy Organizer");
    await expect.poll(() => state.players.find((p) => p.email === ORGANIZER)?.name).toBe("Christy Organizer");
    await expect(page.locator("#rs4")).toHaveClass(/active/);
    await page.evaluate(() => signOut());
    await signIn(page, "newbie@example.invalid");
    await registerSelf(page, "Newbie Spare");
    await expect.poll(() => state.players.find((p) => p.email === "newbie@example.invalid")?.membership_type).toBe("spare");
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
  test("spare seats fill themselves from declined regulars; one-tap vote links; reminder opt-out", async ({ page }) => {
    // A spare registers and is approved.
    await signIn(page, "christygeorge993+spare@gmail.com");
    await registerSelf(page, "Spare Tester");
    await expect.poll(() => state.players.find((p) => p.email === "christygeorge993+spare@gmail.com")?.membership_type).toBe("spare");
    const spareId = state.players.find((p) => p.email === "christygeorge993+spare@gmail.com")!.id;
    await page.evaluate(() => signOut());
    await signIn(page, ORGANIZER);
    await unlockOrganizer(page);
    await page.evaluate((id) => approvePlayer(id), spareId);
    await expect.poll(() => state.players.find((p) => p.id === spareId)!.approved).toBe(true);
    await page.evaluate(() => signOut());

    // No regular has declined: the spare sees no open seat and goes on standby after saying "available".
    await signIn(page, "christygeorge993+spare@gmail.com");
    await expect(page.locator("#page-home")).toHaveClass(/active/);
    await expect(page.locator("#home-vote")).toContainText("Spare: are you available for Session 1");
    await expect(page.locator("#home-vote .spare-seats-line")).toContainText("0 open");
    await page.locator("#home-vote button", { hasText: "I'm available" }).click();
    await expect(page.locator("#home-vote .spare-status")).toContainText("Standby — you are #1 in line");
    // A regular declines (their own answer, recorded earlier): a seat opens and the spare is confirmed automatically.
    state.rsvps.push({ session_number: 1, player_id: 1, response: "notcoming", note: "", updated_at: new Date().toISOString() });
    await page.evaluate(async () => { await loadAll(); renderAll(); });
    await expect(page.locator("#home-vote .spare-status")).toContainText("Seat confirmed (seat 1)");
    await expect(page.locator("#home-vote .spare-seats-line")).toContainText("0 open · 1 confirmed · 0 standby");
    // Reminder opt-out is the player's own switch.
    await page.uncheck("#home-vote .email-reminders-toggle");
    await expect.poll(() => state.players.find((p) => p.id === spareId)!.email_reminders).toBe(false);
    // One-tap link from a reminder email: the vote is applied after sign-in without any other tap.
    await page.goto("/?vote=notcoming&s=1");
    await expect.poll(() => state.rsvps.find((r) => r.player_id === spareId && r.session_number === 1)?.response, { timeout: 15000 }).toBe("notcoming");
    expect(new URL(page.url()).search).toBe("");
    await expect(page.locator("#home-vote")).toContainText("Sit this one out");
    // A link for a session that is not open is refused, not applied.
    await page.goto("/?vote=coming&s=5");
    await expect(page.locator("body")).toContainText("That link was for Session 5");
    expect(state.rsvps.find((r) => r.player_id === spareId && r.session_number === 5)).toBeUndefined();

    // Organizer sees the spare list in Attendance with the seat control.
    state.rsvps.find((r) => r.player_id === spareId && r.session_number === 1)!.response = "coming";
    await page.evaluate(() => signOut());
    await signIn(page, ORGANIZER);
    await unlockOrganizer(page);
    await page.evaluate(() => showSec("admin", "a-att"));
    await expect(page.locator("#confirmed-spares")).toContainText("1 regular declined · 1 confirmed · 0 standby");
    await expect(page.locator("#confirmed-spares")).toContainText("Spare Tester");
    await expect(page.locator("#confirmed-spares button", { hasText: "Seat" })).toBeVisible();
    // Starting the night: the declined regular is excused (no court penalty), the confirmed spare is seated, votes pre-fill attendance.
    await page.evaluate(() => startSession());
    await expect.poll(() => page.evaluate(() => S.current?.number)).toBe(1);
    const lineup = await page.evaluate(() => S.current.assignments as Record<string, number[]>);
    const seated = Object.values(lineup).flat();
    expect(seated).not.toContain(1); expect(seated).toContain(spareId); expect(seated).toHaveLength(25);
    expect(lineup["6"]).toContain(spareId);
    const att = await page.evaluate(() => S.current.attendance as Record<string, string>);
    expect(att["1"]).toBe("declined"); expect(att[String(spareId)]).toBe("present");
    await page.evaluate(() => showSec("admin", "a-att"));
    await expect(page.locator("#excused-tonight")).toContainText("TEST Player 01");
    await expect(page.locator("#excused-tonight")).toContainText("excused");
    await expect(page.locator("#confirmed-spares")).toContainText("seated");
    // Ending the night without scores: the excused regular keeps Court 1 and no no-show is recorded.
    await page.evaluate(() => endSession());
    await expect.poll(() => JSON.parse(state.state["completed_sessions"]?.value || "[]").length, { timeout: 15000 }).toBe(1);
    expect(state.players.find((p) => p.id === 1)!.current_court).toBe(1);
    expect(state.players.find((p) => p.id === 1)!.no_show_count).toBe(0);
  });
  test("payment ledger drives the paid flag; waitlist promotion; my-season card; push opt-in", async ({ page }) => {
    // 25 self-registered regulars fill the league; one more is approved onto the waitlist.
    state.players.forEach((p) => { p.sig = "data:sig"; });
    state.players.push({ ...state.players[0], id: 26, name: "Waiting Wanda", email: "wanda@example.invalid", current_court: 0, highest_court: 0, approved: true, waitlisted: true, registered_at: "2026-09-03T00:00:00Z", user_id: null });
    await signIn(page, ORGANIZER);
    await unlockOrganizer(page);
    // Ledger: two half payments make the season fee paid; a refund never unpays it; deleting an entry re-derives.
    await page.evaluate(() => showSec("admin", "a-pay"));
    await expect(page.locator("#pay-collected")).toHaveText("$0");
    await page.locator("#pay-list .pay-row", { hasText: "TEST Player 01" }).locator("button", { hasText: "Record" }).click();
    await page.selectOption("#pay-kind", "adjustment"); await page.fill("#pay-amount", "200"); await page.fill("#pay-note", "first half");
    await page.click("#modal button:has-text('Save payment')");
    await expect.poll(() => state.players[0].paid).toBe(false);
    await expect(page.locator("#pay-list .pay-row", { hasText: "TEST Player 01" }).locator(".pay-status")).toContainText("$200 still owing");
    await page.locator("#pay-list .pay-row", { hasText: "TEST Player 01" }).locator("button", { hasText: "Record" }).click();
    await page.selectOption("#pay-kind", "season"); await page.fill("#pay-amount", "200");
    await page.click("#modal button:has-text('Save payment')");
    await expect.poll(() => state.players[0].paid).toBe(true);
    await expect(page.locator("#pay-list .pay-row", { hasText: "TEST Player 01" }).locator(".pay-status")).toContainText("Season fee paid ($400)");
    await expect(page.locator("#pay-collected")).toHaveText("$400");
    await page.locator("#pay-list .pay-row", { hasText: "TEST Player 01" }).locator("button", { hasText: "Record" }).click();
    await page.selectOption("#pay-kind", "refund"); await page.fill("#pay-amount", "14"); await page.fill("#pay-session", "3");
    await page.click("#modal button:has-text('Save payment')");
    await expect(page.locator("#pay-collected")).toHaveText("$386");
    expect(state.players[0].paid).toBe(true);
    expect(state.payments.find((x) => x.kind === "refund")!.session_number).toBe(3);
    // Waitlist: a place frees up when a regular is removed; one tap promotes the first in line.
    await page.evaluate(() => showSec("admin", "a-reg"));
    await expect(page.locator("#waitlist-offer")).toHaveCount(0);
    state.players = state.players.filter((p) => p.id !== 25);
    await page.evaluate(async () => { await loadAll(); renderAll(); });
    await expect(page.locator("#waitlist-offer")).toContainText("1 regular place free");
    await page.locator("#waitlist-offer button").click();
    await expect.poll(() => state.players.find((p) => p.id === 26)!.waitlisted).toBe(false);
    await expect(page.locator("#waitlist-offer")).toHaveCount(0);
    // A player sees their own season card and can register a push subscription (own row only).
    state.state["completed_sessions"] = { value: JSON.stringify([{ number: 1, date: "Sep 15, 2026", scores: { c1_y1_g1: { a1: 1, a2: 2, b1: 3, b2: 4, sA: 21, sB: 10, w: "A" } }, movements: [{ cycle: 1, mv: {}, wins: { 1: 1, 2: 1 } }], assignments: { 1: [1, 2, 3, 4] }, initialAssignments: { 1: [1, 2, 3, 4] }, finalAssignments: { 1: [1, 2, 3, 4] }, playerNames: { 1: "TEST Player 01" } }]), version: 1 };
    Object.assign(state.players[0], { season_wins: 1, games_played: 1, email: "christygeorge993+regular@gmail.com", user_id: null });
    await page.evaluate(() => signOut());
    await signIn(page, "christygeorge993+regular@gmail.com");
    await expect(page.locator("#my-season-card")).toContainText("1–0");
    await expect(page.locator("#my-season-card")).toContainText("Season fee paid");
    await expect(page.locator("#my-season-card")).toContainText("1/1");
    await page.evaluate(() => savePushSubscription({ endpoint: "https://push.example/abc", keys: { p256dh: "k", auth: "a" } }));
    await expect.poll(() => state.pushSubs.length).toBe(1);
    expect(state.pushSubs[0].player_id).toBe(1);
    expect(state.payments.filter((x) => x.player_id !== 1)).toHaveLength(0);
  });
});
