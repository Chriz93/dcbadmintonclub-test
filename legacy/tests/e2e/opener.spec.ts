// Season opener on a clean database: invitations, self-registration, approval, seeding, a voting week, match night
// with an Undo, and the final standings. Every number is checked against the independent rules model, every screen is
// captured, and the full run is written to screens/opener/run.json for the visual report and for loading into TEST.
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { installMock, freshState, ORGANIZER } from "./mock-supabase";
import { signIn, unlockOrganizer, courtGames, scoreCourt, eloReference, firstCourts, registerSelf, wl, type Sess } from "./helpers";
import { Model, fresh, target, members, modelMembers, type Round } from "./rules-model";

const OUT = `${__dirname}/screens/opener`;
const REGULARS = ["Aarav Sharma", "Priya Nair", "Daniel Okafor", "Mei Lin Chen", "Lucas Martin", "Sofia Rossi", "Omar Haddad", "Hannah Kim",
  "Mateo Garcia", "Aisha Khan", "Ethan Tremblay", "Fatima Rahman", "Noah Leblanc", "Ananya Iyer", "Liam O'Connor", "Chloe Dubois",
  "Arjun Patel", "Grace Wong", "Samuel Mensah", "Isabelle Roy", "Kenji Tanaka", "Zara Ahmed", "Ryan Gill", "Nadia Petrova", "Vikram Singh"];
const SPARES = ["Emma Clarke", "Diego Alvarez", "Leah Cohen", "Tomás Silva"];
const DECLINE = ["Hannah Kim", "Ryan Gill"];               // regulars who cannot make Session 1, both before the refund cutoff
const SPARE_ANSWER: Record<string, boolean> = { "Emma Clarke": true, "Diego Alvarez": true, "Leah Cohen": true, "Tomás Silva": false };
const ONE_TAP = "Aarav Sharma";                           // votes from the reminder email's one-tap link
const emailOf = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.+|\.+$/g, "") + "@example.invalid";
const num = (x: number | null): x is number => x != null;
type GameRow = { round: number; court: number; game: number; A: number[]; B: number[]; sA: number; sB: number };

test("season opener: 29 people register, vote and play Session 1 with an Undo; every tab agrees with the rules", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "one visual run is enough");
  test.setTimeout(1_500_000);
  mkdirSync(OUT, { recursive: true });
  const state = freshState();
  state.players = []; state.invitations = {};
  const t0 = new Date("2026-09-11T12:00:00-04:00").getTime();   // Friday noon: voting open, refund cutoff not yet passed
  state.nowMs = t0;
  await page.clock.setFixedTime(new Date(t0));
  await installMock(page, state);
  page.on("dialog", (d) => d.accept());
  const shots: { file: string; title: string }[] = [];
  const shot = async (file: string, title: string) => { await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true }); shots.push({ file, title }); };
  const timeline: string[] = [];
  const everyone = [...REGULARS, ...SPARES];
  const byName = (n: string) => state.players.find((p) => p.name === n)!;
  const nameOf = (id: number) => state.players.find((p) => p.id === id)!.name;
  const first = (id: number) => nameOf(id).split(" ")[0];
  const tab = (label: string) => page.locator("#page-standings .ptab").filter({ hasText: new RegExp(label + "$") });

  await page.goto("/");
  await shot("01-signin", "Sign-in: email and a one-time code, no passwords");

  // ── 1. Invitations ────────────────────────────────────────────────────────────────────────────────
  await signIn(page, ORGANIZER); await unlockOrganizer(page);
  await page.evaluate(() => showSec("admin", "a-reg"));
  for (const n of everyone) {
    await page.fill("#inv-email", emailOf(n));
    await page.selectOption("#inv-type", SPARES.includes(n) ? "spare" : "regular");
    await page.click("#invite-card button:has-text('Send invitation')");
    await expect.poll(() => state.invitations[emailOf(n)]).toBe(SPARES.includes(n) ? "spare" : "regular");
    await expect(page.locator("#invite-card")).toContainText(emailOf(n));
  }
  await shot("02-invitations", "Admin → Registered: 25 regulars and 4 spares invited by email");
  timeline.push("The admin invited 29 people from Admin → Registered: 25 regulars and 4 spares.");
  await page.evaluate(() => signOut());

  // ── 2. Self-registration ──────────────────────────────────────────────────────────────────────────
  for (const [i, n] of everyone.entries()) {
    await signIn(page, emailOf(n));
    if (i === 0) await shot("03-register-form", `${n} lands on registration straight after the first sign-in`);
    const spare = SPARES.includes(n);
    await registerSelf(page, n, { spare, payment: spare ? "per_session" : i % 5 === 4 ? "will_pay" : "paid_full", phone: `613-555-${1000 + i}` });
    await expect(page.locator("#rs4")).toHaveClass(/active/);
    if (i === 0) await shot("04-register-done", `${n} submits: waiver, league format and the season-fee declaration`);
    await page.evaluate(() => signOut());
  }
  expect(state.players).toHaveLength(29);
  expect(state.players.filter((p) => p.membership_type === "spare").map((p) => p.name)).toEqual(SPARES);
  timeline.push("All 29 signed in with an emailed code and registered themselves. The invitation set regular or spare.");

  // ── 3. Approval and seeding ───────────────────────────────────────────────────────────────────────
  await signIn(page, ORGANIZER); await unlockOrganizer(page);
  await page.evaluate(() => showSec("admin", "a-reg"));
  await shot("05-pending", "Admin → Registered: 29 registrations waiting for approval");
  for (const p of [...state.players].sort((a, b) => a.id - b.id)) await page.evaluate((id) => approvePlayer(id), p.id);
  await expect.poll(() => state.players.filter((p) => p.approved).length).toBe(29);
  expect(state.players.filter((p) => p.waitlisted)).toHaveLength(0);
  const regIds = state.players.filter((p) => p.membership_type !== "spare").map((p) => p.id).sort((a, b) => a - b);
  for (const [i, id] of regIds.entries()) await page.evaluate(([pid, c]) => setPlayerCourt(pid, c), [id, Math.min(6, Math.floor(i / 4) + 1)] as [number, number]);
  await expect.poll(() => state.players.filter((p) => p.current_court > 0).length).toBe(25);
  const seed: Record<number, number> = Object.fromEntries(state.players.map((p) => [p.id, p.current_court]));
  await page.click("#bnav-courts");
  await shot("06-seeded", "Courts after seeding: four per court, five on Court 6");
  timeline.push("The admin approved all 29 and seeded the 25 regulars: four per court, five on Court 6.");
  await page.evaluate(() => signOut());

  // ── 4. Voting week ────────────────────────────────────────────────────────────────────────────────
  for (const n of everyone) {
    state.nowMs = (state.nowMs || t0) + 7 * 60_000;       // answers arrive through the afternoon
    const p = byName(n);
    const spare = SPARES.includes(n);
    const coming = spare ? SPARE_ANSWER[n] : !DECLINE.includes(n);
    await signIn(page, emailOf(n));
    if (n === ONE_TAP) await page.goto("/?vote=coming&s=1");
    else {
      await expect(page.locator("#page-home")).toHaveClass(/active/);
      await page.locator("#home-vote button", { hasText: spare ? (coming ? "I'm available" : "Not available") : coming ? "I'm Coming" : "Not Coming" }).click();
    }
    await expect.poll(() => state.rsvps.find((r) => r.player_id === p.id && r.session_number === 1)?.response).toBe(coming ? "coming" : "notcoming");
    if (n === REGULARS[1]) await shot("07-home-vote", `${n} votes on Home: one tap, with the Sunday deadline and the refund cutoff shown`);
    if (n === "Hannah Kim") await shot("08-decline", `${n} declines on Friday, before the Saturday 8 PM cutoff, so she is owed $14`);
    if (n === "Emma Clarke") { await expect(page.locator("#home-vote .spare-status")).toContainText("Seat confirmed"); await shot("09-spare-confirmed", `${n} (spare) is confirmed for a seat a regular gave up`); }
    if (n === "Leah Cohen") { await expect(page.locator("#home-vote .spare-status")).toContainText("Standby"); await shot("10-spare-standby", `${n} (spare) is on standby: both open seats are already taken`); }
    await page.evaluate(() => signOut());
  }
  timeline.push(`Voting: 23 regulars said coming (${ONE_TAP} used the one-tap email link). Hannah Kim and Ryan Gill declined before the refund cutoff. Spares Emma and Diego took the two open seats, Leah went on standby, Tomás was not available.`);

  // ── 5. Match night ────────────────────────────────────────────────────────────────────────────────
  await signIn(page, ORGANIZER); await unlockOrganizer(page);
  await page.click("#bnav-home");
  // The card shows the latest 20 changes; the last three voters are the spares after the regulars.
  await expect(page.locator("#vote-changes")).toContainText("Tomás Silva: — → not coming · S1");
  await expect(page.locator("#vote-changes")).toContainText("Ryan Gill: — → not coming · S1");
  await shot("11-admin-home", "Admin Home: every vote as it came in");
  await page.evaluate(() => { nav("admin"); showSec("admin", "a-att"); });
  await expect(page.locator("#confirmed-spares")).toContainText("2 regulars declined · 2 confirmed · 1 standby");
  await shot("12-attendance", "Attendance before the night: two regulars excused, two spares confirmed");
  const model = new Model(state.players);
  const declined = new Set(DECLINE.map((n) => byName(n).id));
  const seated = ["Emma Clarke", "Diego Alvarez"].map((n) => byName(n).id);
  model.seat(declined, seated);
  await page.evaluate(() => startSession());
  await expect.poll(() => page.evaluate(() => S.current?.number)).toBe(1);
  expect(members(await page.evaluate(() => S.current.assignments))).toEqual(modelMembers(model));
  expect(model.lineup.slice(1).map((l) => l.length)).toEqual([4, 4, 4, 4, 4, 5]);
  const att = await page.evaluate(() => S.current.attendance as Record<string, string>);
  for (const id of declined) expect(att[String(id)]).toBe("declined");
  for (const id of seated) expect(att[String(id)]).toBe("present");
  const lineupR1 = model.lineup.map((l) => [...l]);
  await page.click("#bnav-courts");
  await shot("13-courts-r1", "Round 1: 23 regulars and 2 spares; the two gaps are filled from the court below");
  timeline.push("Start Session seated the 23 coming regulars and both confirmed spares, excused Hannah and Ryan without a court penalty, and marked everyone who voted present.");

  const sheet: GameRow[] = [];
  const playRound = async (cy: number) => {
    const r = fresh();
    await page.click("#bnav-scores");
    for (let c = 1; c <= 6; c++) {
      const games = await courtGames(page, c);
      const n = model.lineup[c].length;
      expect(games).toHaveLength(n === 5 ? 5 : 3);
      const scores = games.map((g) => {
        const A = [g.a1, g.a2].filter(num), B = [g.b1, g.b2].filter(num);
        const [sA, sB] = model.play(r, A, B, 1, target(n));
        sheet.push({ round: cy, court: c, game: g.g, A, B, sA, sB });
        return [sA, sB] as [number, number];
      });
      if (cy === 1 && c === 1) {
        await page.selectOption("#sc-sel", "1");
        for (const [i, [a, b]] of scores.entries()) { await page.fill(`#si_1_${i + 1}_a`, String(a)); await page.fill(`#si_1_${i + 1}_b`, String(b)); }
        await shot("14-score-entry", "Entering Court 1, round 1: three games to 21");
      }
      await scoreCourt(page, c, scores);
    }
    return r;
  };
  const r1 = await playRound(1);
  const mv1 = model.rotate(r1);
  await expect.poll(() => page.evaluate(() => S.current.cycle), { timeout: 20000 }).toBe(2);
  expect(await page.evaluate(() => S.current.movements[0].mv)).toEqual(mv1);
  expect(members(await page.evaluate(() => S.current.assignments))).toEqual(modelMembers(model));
  const lineupR2 = model.lineup.map((l) => [...l]);
  await expect(page.locator("#undo-label")).toContainText("Advance to round 2");
  await page.click("#bnav-courts");
  await shot("15-courts-r2", "Round 2 lineup: each court's winner moved up, its last place moved down");
  const r2Lineup = await page.evaluate(() => JSON.stringify(S.current.assignments));
  await shot("16-undo-offer", "The Undo control, bottom centre, offers to reverse “Advance to round 2”");
  await page.locator("#undo-pill button").click();
  await expect.poll(() => page.evaluate(() => S.current.cycle)).toBe(1);
  expect(await page.evaluate(() => Object.keys(S.current.scores).length)).toBe(20);
  expect(await page.evaluate(() => S.current.movements.length)).toBe(0);
  expect(members(await page.evaluate(() => S.current.assignments))).toEqual(Object.fromEntries(lineupR1.slice(1).map((ids, i) => [String(i + 1), [...ids].sort((a, b) => a - b)])));
  await page.click("#bnav-courts");
  await shot("17-after-undo", "After Undo: back in round 1, all 20 scores intact, nobody has moved");
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => S.current.cycle)).toBe(1);
  await page.click("#bnav-scores");
  await expect(page.locator("#advance-banner")).toContainText("Round 1 is complete");
  await shot("17b-advance-banner", "The round now waits: correct any score, then press Next round");
  await page.locator("#advance-banner button").click();
  await expect.poll(() => page.evaluate(() => S.current.cycle)).toBe(2);
  expect(await page.evaluate(() => JSON.stringify(S.current.assignments))).toBe(r2Lineup);
  timeline.push("Round 1 was scored and the round advanced. Undo took the night back to round 1 with every score intact. The admin advanced again and got the identical round-2 lineup.");

  const r2 = await playRound(2);
  const mv2 = model.rotate(r2);
  await expect.poll(() => page.evaluate(() => S.current.completed === true), { timeout: 20000 }).toBe(true);
  expect(await page.evaluate(() => S.current.movements[1].mv)).toEqual(mv2);
  await page.click("#bnav-scores"); await page.selectOption("#sc-sel", "1");
  await expect(page.locator("#score-area")).toContainText("Session Complete");
  await shot("18-session-complete", "Both rounds done: score entry locks and offers End Session");
  await page.locator("#score-area button:has-text('End Session')").click();
  await expect.poll(() => JSON.parse(state.state["completed_sessions"]?.value || "[]").length, { timeout: 20000 }).toBe(1);
  await expect(page.locator("#modal")).toHaveClass(/open/);
  await shot("19-session-summary", "End-of-night summary");
  await page.evaluate(() => closeModal());
  const finals = model.endSession();
  timeline.push("Round 2 was scored, the session locked, and the admin ended it. Final courts, statistics and history were written.");

  // ── 6. Database state equals the rules model ──────────────────────────────────────────────────────
  const done = JSON.parse(state.state["completed_sessions"].value) as (Sess & { number: number; finalAssignments: Record<string, number[]>; playerNames: Record<string, string> })[];
  const sess = done[0];
  for (const p of state.players) {
    expect(p.current_court, `court of ${p.name}`).toBe(model.earned.get(p.id) ?? 0);
    const s = model.stats.get(p.id)!;
    expect([p.season_wins, p.season_losses, p.games_played, p.no_show_count], `stats of ${p.name}`).toEqual([s.w, s.l, s.g, s.noShow]);
  }
  for (const id of declined) { expect(byName(nameOf(id)).current_court).toBe(seed[id]); expect(byName(nameOf(id)).no_show_count).toBe(0); }
  expect(members(sess.finalAssignments)).toEqual(Object.fromEntries(Array.from({ length: 6 }, (_, i) => [String(i + 1), [...finals.entries()].filter(([, c]) => c === i + 1).map(([id]) => id).sort((a, b) => a - b)])));
  expect(Object.keys(sess.scores)).toHaveLength(40);
  expect(Object.keys(sess.playerNames)).toHaveLength(27);

  // ── 7. Every tab ──────────────────────────────────────────────────────────────────────────────────
  const lb = state.players.filter((p) => p.current_court > 0 || p.games_played > 0 || p.season_wins > 0);
  expect(lb).toHaveLength(27);
  await page.click("#bnav-standings"); await tab("Leaders").click();
  const lbRows = await page.$$eval("#sec-lb .lbrow", (rows) => rows.map((r) => ({ name: (r.querySelector(".lbname")?.textContent || "").trim(), sub: r.querySelector(".lbsub")?.textContent || "" })));
  expect(lbRows).toHaveLength(27);
  for (const row of lbRows) {
    const p = state.players.find((x) => row.name.startsWith(x.name))!; const s = model.stats.get(p.id)!;
    expect(row.sub, `Leaders row of ${p.name}`).toContain(`${s.w}W ${s.l}L`);
    expect(row.sub).toContain(`Court ${model.earned.get(p.id)}`);
  }
  await shot("20-leaders", "Leaders: every player's record and court");
  await tab("Rankings").click();
  const ref = eloReference(state.players, done);
  expect(await page.evaluate(() => computeEloRatings())).toEqual(ref);
  const rankRows = await page.$$eval("#sec-rank .lbrow", (rows) => rows.map((r) => ({ name: (r.querySelector(".lbname")?.textContent || "").trim(), text: r.textContent || "" })));
  const shown = rankRows.map((r) => parseInt(r.text.match(/(\d{3,4})\s*ELO/)![1]));
  expect([...shown].sort((a, b) => b - a)).toEqual(shown);
  for (const r of rankRows) { const p = state.players.find((x) => r.name.startsWith(x.name))!; expect(parseInt(r.text.match(/(\d{3,4})\s*ELO/)![1]), `Elo of ${p.name}`).toBe(ref[p.id]); }
  await shot("21-rankings", "Rankings: Elo from the court each player first played on");
  for (const n of ["Aarav Sharma", "Emma Clarke", "Hannah Kim"]) {
    const p = byName(n);
    await page.evaluate((id) => renderGameHistory(id), p.id);
    expect(await page.locator("#modal-body .gh-row").count(), `history rows of ${n}`).toBe(model.stats.get(p.id)!.g);
    expect(await page.locator("#modal-body .gh-row.gh-win").count()).toBe(model.stats.get(p.id)!.w);
    if (n === "Aarav Sharma") await shot("22-game-history", `${n}'s game-by-game history`);
    await page.evaluate(() => closeModal());
  }
  await tab("Stats").click();
  const statCards = await page.$$eval("#sec-pstats .card", (cards) => cards.map((c) => ({ text: c.textContent || "", wins: (c.querySelector(".sbox .sv")?.textContent || "").trim() })));
  for (const p of lb) { const card = statCards.find((c) => c.text.includes(p.name) && !c.text.includes("Season Awards"))!; expect(card, `stats card of ${p.name}`).toBeTruthy(); expect(card.wins).toBe(String(model.stats.get(p.id)!.w)); }
  await shot("23-stats", "Stats: per-player cards");
  await tab("Sessions").click();
  const latestText = await page.locator("#sec-sessstand .card").first().innerText();
  const playedR2 = new Map<number, number>();
  for (const [key, sc] of Object.entries(sess.scores)) { const m = key.match(/^c(\d+)_y2_g/); if (m) for (const id of [sc.a1, sc.a2, sc.b1, sc.b2]) if (id != null) playedR2.set(id, parseInt(m[1])); }
  for (const [id, court] of finals) {
    const from = playedR2.get(id)!; const w = model.sessionWins.get(id) || 0, g = model.sessionGames.get(id) || 0;
    const arrow = from < court ? `${first(id)} (↓ C${from}→C${court})` : from > court ? `${first(id)} (↑ C${from}→C${court})` : `${first(id)} (stayed C${court})`;
    expect(latestText, `Sessions line of ${nameOf(id)}`).toContain(arrow);
    expect(latestText).toMatch(new RegExp(`${first(id)} \\([^)]*\\)\\s+${w}W ${g - w}L`));
  }
  await shot("24-sessions", "Sessions: final placements with the up and down arrows");
  await tab("History").click();
  expect(await page.locator("#sec-hist .card").count()).toBe(1);
  await expect(page.locator("#sec-hist .card").first()).toContainText("40 games");
  await page.locator("#sec-hist .card").first().click();
  await expect(page.locator("#sec-hist")).toContainText("Round 2");
  await shot("25-history", "History: every game of the night, round by round");
  await tab("Court history").click();
  const heat = await page.$$eval("#sec-heat .heatmap-row", (rows) => rows.map((r) => ({ name: r.querySelector(".heatmap-name")?.textContent || "", cells: [...r.querySelectorAll(".hm-cell")].map((c) => c.textContent || "") })));
  expect(heat).toHaveLength(27);
  for (const row of heat) { const p = state.players.find((x) => x.name.startsWith(row.name))!; expect(row.cells, `court history of ${p.name}`).toEqual([String(finals.get(p.id) ?? "—")]); }
  await shot("26-court-history", "Court history: where everyone finished Session 1");
  await page.click("#bnav-home");
  const pos = model.playerOfSession();
  await expect(page.locator("#pos-home .pos-name")).toHaveText(nameOf(pos));
  await expect(page.locator("#next-date")).toContainText("Session 2");
  await shot("27-home-after", "Home after the night: Player of the Session, and Session 2 is next");
  await page.click("#bnav-schedule");
  expect(await page.locator("#sched-list .sched-row:has-text('Done')").count()).toBe(1);
  await shot("28-schedule", "Schedule: Session 1 done, 27 to go");
  await page.evaluate(() => { nav("admin"); showSec("admin", "a-pay"); });
  await expect(page.locator("#refunds-owed")).toContainText("2 refunds to send · $28");
  await expect(page.locator("#refunds-card")).toContainText("Hannah Kim");
  await expect(page.locator("#refunds-card")).toContainText("Ryan Gill");
  await shot("29-refunds", "Admin → Pay: the two regulars who declined in time are listed for their $14");
  await page.locator("#refunds-card .refund-row", { hasText: "Hannah Kim" }).locator("button", { hasText: "Mark refunded" }).click();
  await expect.poll(() => state.payments.filter((x) => x.kind === "refund").length).toBe(1);
  await expect(page.locator("#refunds-owed")).toContainText("1 refund to send · $14");
  timeline.push("After the night: every tab matched the rules model. The admin marked Hannah's $14 refund as sent; Ryan's is still listed.");
  expect(wl(latestText).reduce((n, x) => n + x.w, 0)).toBe(80);

  // ── 8. Write the run ──────────────────────────────────────────────────────────────────────────────
  const fc = firstCourts(done);
  const courtIn = (lineup: number[][], id: number) => { const c = lineup.findIndex((l) => l.includes(id)); return c > 0 ? c : null; };
  const rs = (r: Round, id: number) => ({ w: r.wins[id] || 0, pts: r.pts[id] || 0 });
  const players = [...state.players].sort((a, b) => a.id - b.id).map((p) => ({
    id: p.id, name: p.name, type: p.membership_type, email: p.email, declared: p.declared_payment || "",
    vote: state.rsvps.find((r) => r.player_id === p.id && r.session_number === 1)?.response || null,
    seed: seed[p.id] || 0,
    r1: courtIn(lineupR1, p.id), r1w: rs(r1, p.id).w, r1pts: rs(r1, p.id).pts, mv1: (mv1 as Record<string, string>)[p.id] || null,
    r2: courtIn(lineupR2, p.id), r2w: rs(r2, p.id).w, r2pts: rs(r2, p.id).pts, mv2: (mv2 as Record<string, string>)[p.id] || null,
    final: p.current_court, w: p.season_wins, l: p.season_losses, g: p.games_played,
    eloStart: ref[p.id] !== undefined ? 1500 - ((fc[p.id] ?? p.current_court) - 1) * 100 : null, elo: ref[p.id] ?? null,
  }));
  writeFileSync(`${OUT}/run.json`, JSON.stringify({
    generated: new Date().toISOString(), timeline, shots, players,
    games: sheet.map((g) => ({ ...g, A: g.A.map(nameOf), B: g.B.map(nameOf) })),
    pos: nameOf(pos), refunds: state.payments, undo: state.audit.filter((a) => a.action === "undo").map((a) => a.subject),
    raw: { players: state.players, app_state: Object.fromEntries(Object.entries(state.state).map(([k, v]) => [k, v.value])), rsvps: state.rsvps, payments: state.payments, invitations: state.invitations },
  }, null, 2));
});
