import { leagueFixture } from "./league-fixture";
import { mockSignIn, signIn } from "./auth-fixture";
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
  const league = leagueFixture();
  const scheduleSessions = () => [
    {
      ...session,
      ends_at: "2026-09-16T02:15:00Z",
      calendar_uid: "30000000-0000-4000-8000-000000000001",
    },
    {
      ...session,
      id: "session-2",
      starts_at: "2026-09-23T00:15:00Z",
      ends_at: "2026-09-23T02:15:00Z",
      status: "cancelled",
      revision: 1,
      calendar_uid: "30000000-0000-4000-8000-000000000002",
    },
  ];
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
          data = route.request().headers().accept?.includes("object")
            ? { slug: "synthetic-club" }
            : [{ id: club, name: "Synthetic Club" }];
          break;
        case "seasons":
          data = [{ id: "season", club_id: club, name: league.season.name }];
          break;
        case "venues":
          data = [
            {
              id: "venue-1",
              name: "Synthetic Gym",
              address: "TEST",
              rooms: "Six courts",
            },
          ];
          break;
        case "rpc/league_snapshot":
          data = { ...league, sessions: scheduleSessions() };
          break;
        case "sessions":
          data = route.request().headers().accept?.includes("object")
            ? session
            : url.searchParams.has("season_id")
              ? scheduleSessions()
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
        case "assignments":
          data = assigned.flatMap((p) =>
            p.players.map((user_id, i) => ({
              user_id,
              court_id: p.court_id,
              round: 1,
              ordinal: i + 1,
            })),
          );
          break;
        case "rpc/assign_reviewed_courts": {
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
        case "audit_events":
          data = [];
          break;
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
  await mockSignIn(
    page,
    "club_owner",
    "active",
    "10000000-0000-0000-0000-000000000001",
  );
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
    .getByLabel("Court for Player 25", { exact: true })
    .selectOption("");
  await expect(
    page.getByRole("group", { name: "Court 6 · 4 players" }),
  ).toBeVisible();
  await page
    .getByLabel("Add Player 25 to court", { exact: true })
    .selectOption("court-6");
  await expect(
    page.getByRole("group", { name: "Court 6 · 5 players" }),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(page.locator(".lp-schedule .lp-card")).toHaveCount(2);
  await expect(page.locator(".lp-schedule .lp-card").first()).toContainText(
    "In progress",
  );
  await expect(page.locator(".lp-schedule .lp-card").last()).toContainText(
    "Cancelled · No play",
  );
  await expect(
    page.getByRole("button", { name: "Download season calendar" }),
  ).toBeEnabled();
});
