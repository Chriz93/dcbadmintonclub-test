// The night of 16 September 2026, exactly as it was played (courts, scores and movements from the production backup;
// the players' names are replaced). The organizer reported: arrows on players who had stayed, a "Round 2 Courts" card
// that was really the next session's line-up, and a projected Round 3 that cannot exist. This replays that session and
// requires the cards to say what the app actually recorded and applied.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";
import fixture from "../fixtures/session-2026-09-16.json";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

test("the night of 16 September: the cards match the movements the app applied, and there is no Round 3", async () => {
  const opts: GenOpts = { ...variety(3), regulars: 24, spares: 0, pending: 0, live: "none", sessions: 0 };
  const L: League = genLeague(56000, { ...opts, dates: ctx.dates });
  const session = fixture.session as any;
  L.players = fixture.players.map((p) => ({ ...(L.players[0] as any), id: p.id, name: p.name, email: `p${p.id}@example.invalid`, approved: true, waitlisted: false, membership_type: "regular", current_court: 0, highest_court: 0, season_wins: 0, season_losses: 0, games_played: 0, no_show_count: 0 })) as League["players"];
  L.current = session;
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => nav("courts"));

  const lastRound = session.movements.length;                     // 2 — a night is two rounds
  const applied: Record<string, string> = session.movements[lastRound - 1].mv;
  const shown = await page.evaluate(() => { const s = computeRoundStatus(); return { mv: s.projectedMv as Record<string, string>, projection: !!s.projectedAssignments }; });

  const disagreements = Object.entries(shown.mv)
    .filter(([id, dir]) => dir !== "stay" && applied[id] !== dir)
    .map(([id, dir]) => `${fixture.players.find((p) => p.id === +id)?.name}: card says ${dir}, applied ${applied[id] ?? "nothing"}`);
  expect(disagreements, "the finished round's arrows are the ones the app applied").toEqual([]);
  // Every player the app moved is shown as moved, too (the card must not go quiet about a real move).
  const missing = Object.entries(applied).filter(([id, dir]) => dir !== "stay" && shown.mv[id] !== dir)
    .map(([id, dir]) => `${fixture.players.find((p) => p.id === +id)?.name}: applied ${dir}, card says ${shown.mv[id] ?? "nothing"}`);
  expect(missing, "every applied move is shown").toEqual([]);

  expect(shown.projection, "no next-round projection after the last round").toBe(false);
  const tracker = page.locator("#round-tracker");
  await expect(tracker, "the courts card names what it holds").toContainText(`After Round ${lastRound} — next session's courts`);
  await expect(tracker, "no Round 3").not.toContainText("Round 3");
  await expect(page.locator("#court-gym-view"), "no projected Round 3 in the gym view").not.toContainText("Projected Round 3");
  // p75: the crown belongs to Court 1's best and the solid marker to Court 6's last; every other court just moves.
  const marks = await page.evaluate(() => {
    const out: { court: string; crown: boolean; solid: boolean }[] = [];
    document.querySelectorAll("#round-tracker div").forEach((d) => {
      const head = d.firstElementChild?.textContent?.trim() ?? "";
      if (!/^C[1-6]$/.test(head)) return;
      const t = d.textContent || "";
      out.push({ court: head, crown: t.includes("👑"), solid: t.includes("🔻") });
    });
    return out;
  });
  expect(marks.length, "the completed rounds show every court").toBeGreaterThan(0);
  expect(marks.filter((m) => m.crown).map((m) => m.court), "only Court 1 is crowned").toEqual(marks.filter((m) => m.crown).map(() => "C1"));
  expect(marks.filter((m) => m.solid).map((m) => m.court), "only Court 6 carries the solid marker").toEqual(marks.filter((m) => m.solid).map(() => "C6"));
  expect(marks.some((m) => m.court === "C1" && m.crown), "Court 1's best is crowned").toBe(true);
  expect(marks.some((m) => m.court === "C6" && m.solid), "Court 6's last is marked").toBe(true);
  await expect(tracker, "moves read from court to court").toContainText(/C\d → C\d/);
  await expect(tracker, "the points won are shown beside the wins").toContainText(/\dW · \d+ pts/);
});
