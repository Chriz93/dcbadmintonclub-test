import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { rotation } from "../../src/domain/courts";
test("connected courtside UI submits a reviewed 25-player plan and reconciles score conflicts (mock API)", async ({
  page,
}) => {
  const club = "10000000-0000-0000-0000-000000000001";
  const people = Array.from({ length: 25 }, (_, i) => ({
    user_id: `player-${i + 1}`,
    display_name: `Player ${i + 1}`,
    kind: "regular",
  }));
  const courts = Array.from({ length: 6 }, (_, i) => ({
    id: `court-${i + 1}`,
    number: i + 1,
  }));
  const session = {
    id: "session-1",
    venue_id: "venue-1",
    starts_at: "2026-09-16T00:15:00Z",
    status: "scheduled",
    revision: 0,
  };
  let assigned: { court_id: string; players: string[] }[] = [];
  let matches: Record<string, unknown>[] = [];
  const scores: unknown[] = [];
  await page.route(
    "https://wgolevihkvmosajumzvl.supabase.co/**",
    async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace("/rest/v1/", "");
      let data: unknown;
      switch (path) {
        case "clubs":
          data = [{ id: club, name: "Synthetic Club" }];
          break;
        case "sessions":
          data = route.request().headers().accept?.includes("object")
            ? session
            : [session];
          break;
        case "rpc/public_schedule":
          data = [
            {
              calendar_uid: "30000000-0000-4000-8000-000000000001",
              starts_at: "2026-09-16T00:15:00Z",
              ends_at: "2026-09-16T02:15:00Z",
              venue_name: "Synthetic Gym",
              status: "scheduled",
              revision: 0,
            },
            {
              calendar_uid: "30000000-0000-4000-8000-000000000002",
              starts_at: "2026-09-23T00:15:00Z",
              ends_at: "2026-09-23T02:15:00Z",
              venue_name: "Synthetic Gym",
              status: "cancelled",
              revision: 1,
            },
          ];
          break;
        case "rpc/club_roster":
          data = people;
          break;
        case "rpc/is_admin":
        case "rpc/is_scorekeeper":
          data = true;
          break;
        case "courts":
          data = courts;
          break;
        case "attendance":
          data = people.map((p) => ({ user_id: p.user_id, status: "present" }));
          break;
        case "matches":
          data = matches;
          break;
        case "rpc/assign_courts": {
          const body = route.request().postDataJSON();
          expect(body.expected_revision).toBe(0);
          expect(body.reason).toBe("Initial checked-in player allocation");
          assigned = body.plan;
          matches = assigned.flatMap((p, i) =>
            rotation(p.players).map((g, j) => ({
              id: `match-${i}-${j}`,
              court_id: p.court_id,
              round: 1,
              game: j + 1,
              target: g.target,
              side_a: g.a,
              side_b: g.b,
              score_a: null,
              score_b: null,
              revision: 0,
            })),
          );
          session.status = "active";
          session.revision = 1;
          data = null;
          break;
        }
        case "rpc/submit_score": {
          scores.push(route.request().postDataJSON());
          await route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({
              code: "40001",
              message: "Revision conflict",
            }),
          });
          return;
        }
        default:
          await route.abort();
          return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    },
  );
  await page.goto("http://127.0.0.1:5174/");
  await page.getByRole("button", { name: "Courtside", exact: true }).click();
  await page.getByRole("button", { name: "Load my clubs" }).click();
  await expect(
    page.getByRole("button", { name: "Refresh session" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Refresh session" }).click();
  await page.getByRole("button", { name: "Preview court assignments" }).click();
  await expect(
    page.getByRole("group", { name: "Court 6 · 5 players" }),
  ).toBeVisible();
  await page
    .getByLabel("Court for Player 25", { exact: true })
    .selectOption("court-5");
  await expect(
    page.getByRole("group", { name: "Court 5 · 5 players" }),
  ).toBeVisible();
  await page
    .getByLabel("Court for Player 25", { exact: true })
    .selectOption("court-6");
  await page
    .getByLabel("Reason for this assignment")
    .fill("Initial checked-in player allocation");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Confirm assignments" }).click();
  await expect.poll(() => assigned.length).toBe(6);
  expect(assigned.map((p) => p.players.length)).toEqual([4, 4, 4, 4, 4, 5]);
  expect(new Set(assigned.flatMap((p) => p.players)).size).toBe(25);
  await page.getByRole("button", { name: "Refresh session" }).click();
  const court = page
    .getByRole("heading", { name: "Court 6", exact: true })
    .locator("..");
  await expect(
    court.getByRole("button", { name: "Save official score" }),
  ).toHaveCount(5);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations.map((v) => v.id)).toEqual([]);
  await expect(court).toContainText("Resting: Player 21");
  await court.getByLabel("Round 1 game 1 team A score").fill("15");
  await court.getByLabel("Round 1 game 1 team B score").fill("12");
  await court
    .getByRole("button", { name: "Save official score" })
    .first()
    .click();
  await expect(page.locator("#main")).toContainText(
    "Score not confirmed. Refresh to reconcile before retrying.",
  );
  expect(scores).toEqual([
    { c: club, m: "match-5-0", a: 15, b: 12, expected_revision: 0 },
  ]);
  await page
    .getByRole("button", { name: "Season schedule", exact: true })
    .click();
  await expect(page.locator(".schedule-row.active")).toHaveCount(1);
  await expect(page.locator(".schedule-row.cancelled")).toHaveCount(1);
  await expect(page.getByRole("status")).toContainText(
    "Current test schedule loaded.",
  );
});

test("member standings display normalized results and shared ranks (mock API)", async ({
  page,
}) => {
  await page.route(
    "https://wgolevihkvmosajumzvl.supabase.co/**",
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      const data = path.endsWith("/seasons")
        ? [{ id: "season", club_id: "club", name: "Synthetic league" }]
        : path.endsWith("/league_standings")
          ? [
              {
                user_id: "one",
                display_name: "Alex",
                played: 4,
                wins: 3,
                points: 65,
                possible_points: 84,
                position: 1,
              },
              {
                user_id: "two",
                display_name: "Sam",
                played: 8,
                wins: 6,
                points: 130,
                possible_points: 168,
                position: 1,
              },
            ]
          : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    },
  );
  await page.goto("http://127.0.0.1:5174/");
  await page.getByRole("button", { name: "Standings", exact: true }).click();
  await page.getByRole("button", { name: "Refresh standings" }).click();
  await expect(page.getByRole("table")).toContainText("Alex");
  await expect(page.getByRole("table")).toContainText("75.0%");
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.map((v) => v.id)).toEqual([]);
});
