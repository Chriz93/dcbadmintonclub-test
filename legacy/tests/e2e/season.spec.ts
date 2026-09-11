// Ten-session season simulation against an independent model of the league rules.
// The model never calls the app's ranking, rotation, statistics or Elo code: it re-implements the published rules and
// the app must agree with it after every round, every session and on every tab.
import { test, expect, type Page } from "@playwright/test";
import { installMock, freshState, ORGANIZER, type MockState } from "./mock-supabase";
import { signIn, unlockOrganizer, courtGames, scoreCourt, eloReference, type Game, type Sess } from "./helpers";

const NC = 6, SESSIONS = parseInt(process.env.SIM_SESSIONS || "10"), ABSENT_SESSION = Math.min(5, SESSIONS);
const NAMES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet", "Kilo", "Lima", "Mike", "November", "Oscar", "Papa", "Quebec", "Romeo", "Sierra", "Tango", "Uniform", "Victor", "Whiskey", "Xray", "Yankee"];
import { cap, target, strength, fresh, Model, members, modelMembers, type Round } from "./rules-model";
void cap; void strength;

test.describe("ten-session season simulation", () => {
  test("scores, movements, statistics, Elo, history and every tab agree with the independent rules model", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "data is identical on every viewport; run once");
    test.setTimeout(900000);
    const state = freshState();
    state.players.forEach((p, i) => { p.name = `${NAMES[i]} Sim`; });
    await installMock(page, state);
    page.on("dialog", (d) => d.accept());
    await page.goto("/");
    await signIn(page, ORGANIZER);
    await unlockOrganizer(page);
    const model = new Model(state.players);
    const nameOf = (id: number) => state.players.find((p) => p.id === id)!.name;
    const first = (id: number) => nameOf(id).split(" ")[0];

    for (let k = 1; k <= SESSIONS; k++) {
      // ── Start: everyone starts on the court they earned ───────────────────────────────────────
      model.seat();
      await page.evaluate(() => startSession());
      await expect.poll(() => page.evaluate(() => S.current?.number)).toBe(k);
      expect(members(await page.evaluate(() => S.current.assignments))).toEqual(modelMembers(model));
      let absentId = 0;
      if (k === ABSENT_SESSION) { // one no-show on Court 3, marked before play
        absentId = model.lineup[3][0];
        await page.click("#bnav-admin"); await page.evaluate(() => showSec("admin", "a-att"));
        await page.evaluate(([id, c]) => markAttForTab(id, "absent", c), [absentId, 3] as [number, number]);
        await expect.poll(() => page.evaluate(() => S.current.assignments[3].length)).toBe(3);
        model.absent(absentId);
        expect(members(await page.evaluate(() => S.current.assignments))).toEqual(modelMembers(model));
      }
      const rounds: Round[] = [];
      for (let cy = 1; cy <= 2; cy++) {
        const r = fresh();
        await page.click("#bnav-scores");
        for (let c = 1; c <= NC; c++) {
          const games: Game[] = await courtGames(page, c);
          const n = model.lineup[c].length;
          expect(games).toHaveLength(n === 5 ? 5 : 3);
          const scores = games.map((g) => model.play(r, [g.a1, g.a2].filter((x): x is number => x != null), [g.b1, g.b2].filter((x): x is number => x != null), k, target(n)));
          await scoreCourt(page, c, scores);
        }
        rounds.push(r);
        if (cy === 1) { for (let c = 1; c <= NC; c++) for (const id of model.lineup[c]) void c; }
        const mv = model.rotate(r);
        if (cy === 2) { for (let c = 1; c <= NC; c++) for (const id of model.lineup[c]) model.round2Court.set(id, model.lineup.findIndex((l) => l.includes(id))); }
        if (cy === 1) await expect.poll(() => page.evaluate(() => S.current.cycle), { timeout: 20000 }).toBe(2);
        else await expect.poll(() => page.evaluate(() => S.current.completed === true), { timeout: 20000 }).toBe(true);
        // The app's movement record and its new lineup equal the model's, player by player.
        const appMv = await page.evaluate((i) => S.current.movements[i].mv, cy - 1);
        expect(appMv).toEqual(mv);
        expect(members(await page.evaluate(() => S.current.assignments))).toEqual(modelMembers(model));
      }
      // round2Court must be the court each player PLAYED round 2 on (before the final rotation)
      // ── End session ───────────────────────────────────────────────────────────────────────────
      const playedR2 = new Map<number, number>();
      for (const g of rounds[1].games) for (const id of [...g.A, ...g.B]) { /* court recovered below from the app's score keys */ void id; }
      await page.evaluate(() => endSession());
      await expect.poll(() => JSON.parse(state.state["completed_sessions"]?.value || "[]").length, { timeout: 20000 }).toBe(k);
      await page.evaluate(() => closeModal());
      const finals = model.endSession();
      const done = JSON.parse(state.state["completed_sessions"].value) as (Sess & { number: number; finalAssignments: Record<string, number[]>; movements: { mv: Record<number, string> }[]; playerNames: Record<string, string> })[];
      const sess = done[k - 1];
      for (const [key] of Object.entries(sess.scores)) { const m = key.match(/^c(\d+)_y2_g/); if (m) for (const id of [sess.scores[key].a1, sess.scores[key].a2, sess.scores[key].b1, sess.scores[key].b2]) if (id != null) playedR2.set(id, parseInt(m[1])); }
      // Database: courts earned, statistics, no-shows, frozen session record.
      for (const p of state.players) {
        expect(p.current_court, `court of ${p.name} after session ${k}`).toBe(model.earned.get(p.id));
        const s = model.stats.get(p.id)!;
        expect([p.season_wins, p.season_losses, p.games_played, p.no_show_count], `stats of ${p.name} after session ${k}`).toEqual([s.w, s.l, s.g, s.noShow]);
      }
      expect(members(sess.finalAssignments)).toEqual(Object.fromEntries(Array.from({ length: NC }, (_, i) => [String(i + 1), [...finals.entries()].filter(([, c]) => c === i + 1).map(([id]) => id).sort((a, b) => a - b)])));
      expect(Object.keys(sess.scores)).toHaveLength(40); // 5×3 + 5 per round; a three-player court still plays 3 games
      expect(Object.keys(sess.playerNames)).toHaveLength(25); // the absent player keeps their name in history
      const totalW = [...model.stats.values()].reduce((n, s) => n + s.w, 0), totalL = [...model.stats.values()].reduce((n, s) => n + s.l, 0);
      expect(state.players.reduce((n, p) => n + p.season_wins, 0)).toBe(totalW);
      expect(state.players.reduce((n, p) => n + p.season_losses, 0)).toBe(totalL);

      // ── Tabs ──────────────────────────────────────────────────────────────────────────────────
      await page.click("#bnav-standings");
      await page.click("#page-standings .ptab:has-text('Leaders')");
      const lbRows = await page.$$eval("#sec-lb .lbrow", (rows) => rows.map((r) => ({ name: (r.querySelector(".lbname")?.textContent || "").trim(), sub: r.querySelector(".lbsub")?.textContent || "" })));
      expect(lbRows).toHaveLength(25);
      for (const row of lbRows) {
        const p = state.players.find((x) => row.name.startsWith(x.name))!; const s = model.stats.get(p.id)!;
        expect(row.sub, `Leaders row of ${p.name}`).toContain(`${s.w}W ${s.l}L`);
        expect(row.sub).toContain(`Court ${model.earned.get(p.id)}`);
      }
      await page.click("#page-standings .ptab:has-text('Rankings')");
      const ref = eloReference(state.players, done);
      expect(await page.evaluate(() => computeEloRatings())).toEqual(ref);
      const rankRows = await page.$$eval("#sec-rank .lbrow", (rows) => rows.map((r) => ({ name: (r.querySelector(".lbname")?.textContent || "").trim(), text: r.textContent || "" })));
      const shown = rankRows.map((r) => parseInt(r.text.match(/(\d{3,4})\s*ELO/)![1]));
      expect([...shown].sort((a, b) => b - a)).toEqual(shown);
      for (const r of rankRows) { const p = state.players.find((x) => r.name.startsWith(x.name))!; expect(parseInt(r.text.match(/(\d{3,4})\s*ELO/)![1]), `Elo shown for ${p.name}`).toBe(ref[p.id]); }
      // A player's full game history equals the games the model dealt them.
      for (const pid of [1, 13, 25]) {
        await page.evaluate((id) => renderGameHistory(id), pid);
        expect(await page.locator("#modal-body .gh-row").count(), `history rows of ${nameOf(pid)}`).toBe(model.stats.get(pid)!.g);
        expect(await page.locator("#modal-body .gh-row.gh-win").count()).toBe(model.stats.get(pid)!.w);
        await page.evaluate(() => closeModal());
      }
      await page.click("#page-standings .ptab:has-text('Stats')");
      const statCards = await page.$$eval("#sec-pstats .card", (cards) => cards.map((c) => ({ text: c.textContent || "", wins: (c.querySelector(".sbox .sv")?.textContent || "").trim() })));
      for (const p of state.players) {
        const card = statCards.find((c) => c.text.includes(p.name) && !c.text.includes("Season Awards"))!;
        expect(card, `stats card of ${p.name}`).toBeTruthy();
        expect(card.wins).toBe(String(model.stats.get(p.id)!.w));
      }
      await page.click("#page-standings .ptab:has-text('Sessions')");
      const latest = page.locator("#sec-sessstand .card").first();
      await expect(latest).toContainText(`Session ${k} — ${sess.number === k ? "" : ""}`);
      await expect(latest).toContainText("2 Rounds");
      const latestText = await latest.innerText();
      for (const [id, court] of finals) {
        const from = playedR2.get(id); if (!from) continue; // absent players played nothing
        const w = model.sessionWins.get(id) || 0, g = model.sessionGames.get(id) || 0;
        const arrow = from < court ? `${first(id)} (↓ C${from}→C${court})` : from > court ? `${first(id)} (↑ C${from}→C${court})` : `${first(id)} (stayed C${court})`;
        expect(latestText, `Sessions tab line of ${nameOf(id)} in session ${k}`).toContain(arrow);
        expect(latestText).toMatch(new RegExp(`${first(id)} \\([^)]*\\)\\s+${w}W ${g - w}L`));
      }
      await page.click("#page-standings .ptab:has-text('History')");
      expect(await page.locator("#sec-hist .card").count()).toBe(k);
      await expect(page.locator("#sec-hist .card").first()).toContainText("40 games");
      await page.click("#page-standings .ptab:has-text('Court history')");
      const heat = await page.$$eval("#sec-heat .heatmap-row", (rows) => rows.map((r) => ({ name: r.querySelector(".heatmap-name")?.textContent || "", cells: [...r.querySelectorAll(".hm-cell")].map((c) => c.textContent || "") })));
      expect(heat).toHaveLength(25);
      for (const row of heat) {
        const p = state.players.find((x) => x.name.startsWith(row.name))!;
        expect(row.cells, `court history of ${p.name}`).toEqual(model.courtsBySession.map((m) => String(m.get(p.id) ?? "—")));
      }
      await page.click("#bnav-home");
      await expect(page.locator("#pos-home")).toContainText(`Player of Session ${k}`);
      await expect(page.locator("#pos-home .pos-name")).toHaveText(nameOf(model.playerOfSession()));
      if (k < SESSIONS) await expect(page.locator("#next-date")).toContainText(`Session ${k + 1}`);
      await page.click("#bnav-schedule");
      expect(await page.locator("#sched-list .sched-row:has-text('Done')").count()).toBe(k);
    }
    // ── Whole season ──────────────────────────────────────────────────────────────────────────────
    expect(state.audit.filter((a) => a.action === "scores.saved")).toHaveLength(SESSIONS * 12);
    const moved = state.players.filter((p) => p.current_court !== Math.min(6, Math.ceil(p.id / 4)));
    expect(moved.length, "players who changed court over the season").toBeGreaterThanOrEqual(8);
    expect(state.players.filter((p) => p.no_show_count === 1)).toHaveLength(1);
    expect(state.requests.some((r) => r.includes("/realtime/"))).toBe(false);
  });
});
