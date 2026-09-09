import { test, expect, type Page } from "@playwright/test";
import { openLeague } from "./league-fixture";
import { mockSignIn, signIn } from "./auth-fixture";
import { allocate, rotation } from "../../src/domain/courts";
import { nextRoundPlacement } from "../../src/domain/placement";
const people = Array.from({ length: 25 }, (_, i) => ({
  user_id: `player-${i + 1}`,
  display_name: `TEST Player ${i + 1}`,
  kind: "regular",
}));
const courts = Array.from({ length: 6 }, (_, i) => ({
  id: `court-${i + 1}`,
  number: i + 1,
}));
type Match = {
  id: string;
  court_id: string;
  round: number;
  game: number;
  target: number;
  side_a: string[];
  side_b: string[];
  score_a: number | null;
  score_b: number | null;
  revision: number;
};
async function fixture(page: Page, admin = true) {
  const session = {
    id: "session",
    club_id: "club",
    venue_id: "venue",
    season_id: "season",
    starts_at: "2026-09-16T00:15:00Z",
    rsvp_deadline: "2026-09-15T23:15:00Z",
    capacity: 25,
    status: "scheduled",
    revision: 0,
  };
  const state = {
    matches: [] as Match[],
    assignments: [] as {
      user_id: string;
      court_id: string;
      round: number;
      ordinal: number;
    }[],
    plans: [] as string[][][],
    privilegedReads: 0,
    submissions: 0,
  };
  await page.route(
    "https://wgolevihkvmosajumzvl.supabase.co/**",
    async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname.split("/rest/v1/")[1];
      let data: unknown = [];
      switch (path) {
        case "clubs":
          data = [{ id: "club", name: "Synthetic rehearsal" }];
          break;
        case "sessions":
          data = request.headers().accept?.includes("object")
            ? session
            : [session];
          break;
        case "seasons":
          data = { rules: { normalTarget: 21, fiveTarget: 15 } };
          break;
        case "rpc/club_roster":
          data = people;
          break;
        case "rpc/is_admin":
        case "rpc/is_scorekeeper":
          data = admin;
          break;
        case "rpc/placement_penalties":
          state.privilegedReads++;
          if (!admin) {
            await route.fulfill({
              status: 403,
              contentType: "application/json",
              body: '{"code":"42501"}',
            });
            return;
          }
          break;
        case "courts":
          data = courts;
          break;
        case "attendance":
          data = people.map((p) => ({ user_id: p.user_id, status: "present" }));
          break;
        case "matches":
          data = state.matches;
          break;
        case "assignments":
          data = state.assignments;
          break;
        case "initial_seeds":
          data = people.map((p, i) => ({ user_id: p.user_id, seed: i + 1 }));
          break;
        case "elo_ratings":
          data = people.map((p, i) => ({
            user_id: p.user_id,
            rating: 1360 - i * 15,
            played: 0,
          }));
          break;
        case "rpc/assign_reviewed_courts": {
          const body = request.postDataJSON();
          expect(body.expected_revision).toBe(session.revision);
          const plan = body.plan as { court_id: string; players: string[] }[];
          state.plans.push(plan.map((c) => c.players));
          for (const c of plan) {
            state.assignments.push(
              ...c.players.map((user_id, i) => ({
                user_id,
                court_id: c.court_id,
                round: body.round_number,
                ordinal: i + 1,
              })),
            );
            state.matches.push(
              ...rotation(c.players).map((g, i) => ({
                id: `${body.round_number}-${c.court_id}-${i}`,
                court_id: c.court_id,
                round: body.round_number,
                game: i + 1,
                target: g.target,
                side_a: g.a,
                side_b: g.b,
                score_a: null,
                score_b: null,
                revision: 0,
              })),
            );
          }
          session.revision++;
          data = null;
          break;
        }
        case "rpc/submit_score": {
          const body = request.postDataJSON();
          const game = state.matches.find((m) => m.id === body.m)!;
          expect(body.expected_revision).toBe(game.revision);
          expect(Math.max(body.a, body.b)).toBe(game.target);
          game.score_a = body.a;
          game.score_b = body.b;
          game.revision++;
          session.status = "active";
          state.submissions++;
          data = game.revision;
          break;
        }
        case "rpc/finalize_session":
          expect(state.matches).toHaveLength(80);
          expect(state.matches.every((g) => g.score_a !== null)).toBe(true);
          expect(request.postDataJSON().expected_revision).toBe(4);
          session.status = "completed";
          session.revision++;
          data = null;
          break;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    },
  );
  await mockSignIn(page, admin ? "club_owner" : "member");
  await signIn(page);
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open match-day controls", exact: true })
    .click();
  await page.getByRole("button", { name: "Load my clubs" }).click();
  await expect(
    page.getByRole("button", { name: "Refresh session" }),
  ).toBeEnabled();
  return { state, session };
}
async function refresh(page: Page) {
  await page.getByRole("button", { name: "Refresh session" }).click();
  await expect(page.getByText(/Session status:/)).toBeVisible();
}

test("ordinary players can view a season's courts without privileged penalty access", async ({
  page,
}) => {
  let privilegedReads = 0;
  page.on("request", (request) => {
    if (request.url().includes("placement_penalties")) privilegedReads++;
  });
  await openLeague(page);
  await page.getByRole("button", { name: "Courts", exact: true }).click();
  await expect(page.locator(".lp-court")).toHaveCount(6);
  expect(privilegedReads).toBe(0);
  await expect(
    page.getByRole("button", { name: "Administration", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Preview court assignments" }),
  ).toHaveCount(0);
});

test("25 players play all 80 games, rotate across four rounds and complete the session", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { state, session } = await fixture(page);
  let expectedPlan = allocate(
    people.map((p) => p.user_id),
    6,
  );
  page.on("dialog", (d) => d.accept());
  for (let round = 1; round <= 4; round++) {
    await refresh(page);
    await page.getByLabel("Round", { exact: true }).fill(String(round));
    await page
      .getByRole("button", { name: "Preview court assignments" })
      .click();
    await expect(
      page.getByRole("group", { name: "Court 6 · 5 players" }),
    ).toBeVisible();
    await page
      .getByLabel("Reason for this assignment")
      .fill(`Synthetic round ${round} reviewed`);
    await page.getByRole("button", { name: "Confirm assignments" }).click();
    await expect(page.getByRole("status")).toContainText("Assignments saved");
    expect(state.plans[round - 1]).toEqual(expectedPlan);
    await refresh(page);
    const roundResults = [];
    for (let c = 0; c < 6; c++) {
      const section = page
        .getByRole("heading", { name: `Court ${c + 1}`, exact: true })
        .locator("..");
      const games = state.matches.filter(
        (g) => g.round === round && g.court_id === courts[c].id,
      );
      for (const [index, game] of games.entries()) {
        const a =
          (c + round + index) % 2
            ? game.target
            : (c + index + round) % game.target;
        const b =
          a === game.target ? (c + index + round) % game.target : game.target;
        await section
          .getByLabel(`Round ${round} game ${game.game} team A score`)
          .fill(String(a));
        await section
          .getByLabel(`Round ${round} game ${game.game} team B score`)
          .fill(String(b));
        await section
          .getByRole("button", { name: "Save official score", exact: true })
          .nth(index)
          .click();
        await expect.poll(() => game.revision).toBe(1);
        roundResults.push({
          game: {
            a: game.side_a,
            b: game.side_b,
            rest: expectedPlan[c].filter(
              (id) => !game.side_a.includes(id) && !game.side_b.includes(id),
            ),
            target: game.target,
          },
          a,
          b,
        });
      }
    }
    expect(state.submissions).toBe(round * 20);
    expectedPlan = nextRoundPlacement(expectedPlan, roundResults);
  }
  await page
    .getByRole("button", { name: "Review final placements", exact: true })
    .click();
  await page
    .getByLabel("Final review reason", { exact: true })
    .fill("Reviewed all courts and final movement");
  await page
    .getByRole("button", { name: "Complete session", exact: true })
    .click();
  await expect(page.getByRole("status").last()).toContainText(
    "Session completed",
  );
  await refresh(page);
  await expect(
    page.getByText(/Session status: completed. 80 of 80/),
  ).toBeVisible();
  expect(session.revision).toBe(5);
  expect(errors).toEqual([]);
});

test("an incomplete previous court cannot disappear from the movement preview", async ({
  page,
}) => {
  const { state, session } = await fixture(page);
  session.status = "active";
  const plan = allocate(
    people.map((p) => p.user_id),
    6,
  );
  state.assignments = plan.flatMap((ids, c) =>
    ids.map((user_id, i) => ({
      user_id,
      court_id: courts[c].id,
      round: 1,
      ordinal: i + 1,
    })),
  );
  state.matches = plan.flatMap((ids, c) =>
    c === 0
      ? []
      : rotation(ids).map((g, i) => ({
          id: `${c}-${i}`,
          court_id: courts[c].id,
          round: 1,
          game: i + 1,
          target: g.target,
          side_a: g.a,
          side_b: g.b,
          score_a: g.target,
          score_b: 0,
          revision: 1,
        })),
  );
  await refresh(page);
  await page.getByLabel("Round", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Preview court assignments" }).click();
  await expect(page.getByRole("status").last()).toContainText(
    "previous round is incomplete",
  );
  await expect(
    page.getByRole("button", { name: "Confirm assignments" }),
  ).toHaveCount(0);
});

test("malformed next-session data gives a retry and recovers without an uncaught error", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let attempts = 0;
  let malformed = true;
  await page.route("https://wgolevihkvmosajumzvl.supabase.co/**", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  await page.route("**/rest/v1/rpc/my_upcoming", (route) => {
    attempts++;
    return route.fulfill({
      contentType: "application/json",
      body: malformed ? '[{"session_id":"broken"}]' : "[]",
    });
  });
  await mockSignIn(page);
  await signIn(page);
  await expect(
    page.getByRole("region", { name: "Your next session" }),
  ).toContainText("could not be loaded");
  malformed = false;
  const beforeRetry = attempts;
  await page.getByRole("button", { name: "Retry next session" }).click();
  await expect(
    page.getByRole("region", { name: "Your next session" }),
  ).toContainText("No upcoming session yet");
  expect(attempts).toBe(beforeRetry + 1);
  expect(errors).toEqual([]);
});
