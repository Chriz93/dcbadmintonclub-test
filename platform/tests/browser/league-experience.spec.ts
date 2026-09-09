import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openLeague } from "./league-fixture";
import { mockUser } from "./auth-fixture";
const nav = (page: import("@playwright/test").Page, name: string) =>
  page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
test("25 connected players, six gym courts, all published movements, profiles and history", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openLeague(page);
  await expect(
    page.getByRole("heading", { name: "Your league night.", exact: true }),
  ).toBeVisible();
  const homeA11y = await new AxeBuilder({ page }).include("#main").analyze();
  expect(homeA11y.violations).toEqual([]);
  await nav(page, "Courts");
  await expect(page.locator(".md-court")).toHaveCount(6);
  await expect(page.locator(".md-player")).toHaveCount(25);
  await expect(
    page.getByRole("region", { name: "Round progress" }),
  ).toContainText("Round 2");
  await page.getByRole("button", { name: "Movements", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Movements after round 1" }),
  ).toBeVisible();
  await expect(page.locator(".lp-person-row")).toHaveCount(25);
  await expect(page.getByRole("heading", { name: /Moved up/ })).toBeVisible();
  await page
    .getByRole("button", { name: "TEST Player 01", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ELO progress" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Match history", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".lp-match")).toHaveCount(3);
  await page.getByText("Partner statistics", { exact: true }).click();
  const a11y = await new AxeBuilder({ page }).include(".lp").analyze();
  expect(
    a11y.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        reason: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  expect(errors).toEqual([]);
});
test("member submits only own matches; saved results require a private correction request", async ({
  page,
}) => {
  const state = await openLeague(page);
  await nav(page, "Scores");
  const mine = state.data.matches.filter(
    (m) => m.round === 2 && [...m.a, ...m.b].includes(mockUser.id),
  );
  await expect(
    page.getByRole("button", { name: "Save result", exact: true }),
  ).toHaveCount(mine.length);
  const m = mine[0];
  await page.getByLabel(`${m.id} Team A score`).fill(String(m.target));
  await page.getByLabel(`${m.id} Team B score`).fill("10");
  await page
    .locator(".lp-match")
    .filter({ has: page.getByLabel(`${m.id} Team A score`) })
    .getByRole("button", { name: "Save result", exact: true })
    .click();
  await expect.poll(() => state.saves).toBe(1);
  await expect(
    page.getByRole("button", { name: "Request a correction", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Request a correction", exact: true })
    .click();
  await page.getByLabel(`${m.id} Team A score`).fill("10");
  await page.getByLabel(`${m.id} Team B score`).fill(String(m.target));
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Teams were entered backwards");
  await page.getByRole("button", { name: "Send correction request" }).click();
  await expect.poll(() => state.data.reviews.length).toBe(1);
  await page
    .getByRole("combobox", { name: "Select Your Court", exact: true })
    .selectOption("all");
  await expect(
    page.locator(".lp-match").filter({
      has: page.getByRole("button", { name: "Save result", exact: true }),
    }),
  ).toHaveCount(mine.length - 1);
});
test("refresh preserves an unsaved score and explicitly discards it when requested", async ({
  page,
}) => {
  const state = await openLeague(page);
  await nav(page, "Scores");
  const m = state.data.matches.find(
    (m) => m.round === 2 && m.a.includes(mockUser.id),
  )!;
  await page.getByLabel(`${m.id} Team A score`).fill("7");
  state.data.version = "external-change";
  await page
    .getByRole("button", { name: "Refresh league", exact: true })
    .click();
  await expect(
    page.getByText("New results are available.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel(`${m.id} Team A score`)).toHaveValue("7");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Discard edits and update" }).click();
  await expect(page.getByLabel(`${m.id} Team A score`)).toHaveValue("");
});
test("navigation confirms before discarding a score and a stale save cannot overwrite", async ({
  page,
}) => {
  const state = await openLeague(page);
  await nav(page, "Scores");
  const m = state.data.matches.find(
    (m) => m.round === 2 && m.a.includes(mockUser.id),
  )!;
  await page.getByLabel(`${m.id} Team A score`).fill(String(m.target));
  await page.getByLabel(`${m.id} Team B score`).fill("10");
  page.once("dialog", (d) => d.dismiss());
  await nav(page, "Courts");
  await expect(
    page.getByRole("heading", { name: "Enter Scores", exact: true }),
  ).toBeVisible();
  m.revision++;
  await page
    .locator(".lp-match")
    .filter({ has: page.getByLabel(`${m.id} Team A score`) })
    .getByRole("button", { name: "Save result", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("This record changed");
  expect(state.saves).toBe(0);
});
test("network failure retains readable courts but blocks saving until refreshed", async ({
  page,
}) => {
  const state = await openLeague(page);
  await nav(page, "Courts");
  await expect(page.locator(".md-court")).toHaveCount(6);
  state.fail = true;
  await page
    .getByRole("button", { name: "Refresh league", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("could not be refreshed");
  await expect(page.locator(".md-court")).toHaveCount(6);
  await nav(page, "Scores");
  await expect(
    page.getByRole("button", { name: "Save result", exact: true }).first(),
  ).toBeDisabled();
  state.fail = false;
  await page
    .getByRole("button", { name: "Refresh league", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save result", exact: true }).first(),
  ).toBeEnabled();
});
test("standings has simple legacy tabs, profile links and a phone-safe layout", async ({
  page,
}) => {
  await openLeague(page);
  await nav(page, "Standings");
  await expect(page.getByRole("table")).toContainText("TEST Player 25");
  await page.getByRole("button", { name: "Stats", exact: true }).click();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(25);
  await expect(rows.first().locator("td").first()).toHaveText("1");
  await expect(rows.last().locator("td").first()).toHaveText("1");
  await page.getByLabel("Find a player").fill("TEST Player 13");
  await expect(rows).toHaveCount(1);
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  const a11y = await new AxeBuilder({ page }).include(".lp").analyze();
  expect(
    a11y.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        reason: n.failureSummary,
      })),
    })),
  ).toEqual([]);
});
test("gym display retains an exit and hides navigation", async ({ page }) => {
  await openLeague(page);
  await nav(page, "Courts");
  await page.getByRole("button", { name: "Gym display", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Exit gym display" }).click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
});

test("a failed first league load keeps the page title and recovers through Retry", async ({
  page,
}) => {
  const state = await openLeague(page, false, undefined, true);
  await expect(
    page.getByRole("heading", { name: "Your league night.", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Live results could not be refreshed" }),
  ).toBeVisible();
  state.fail = false;
  await page
    .getByRole("button", { name: "Refresh league", exact: true })
    .click();
  await expect(page.locator(".lp-home")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
});

test("court-filter cancellation preserves edits; confirmed discard resets surviving editors; Home My scores resets court", async ({
  page,
}) => {
  const state = await openLeague(page);
  await nav(page, "Scores");
  const m = state.data.matches.find(
    (m) => m.round === 2 && m.a.includes(mockUser.id),
  )!;
  const score = page.getByLabel(`${m.id} Team A score`),
    filter = page.getByRole("combobox", {
      name: "Select Your Court",
      exact: true,
    });
  await score.fill("7");
  page.once("dialog", (d) => d.dismiss());
  await filter.selectOption("all");
  await expect(filter).toHaveValue(m.court_id);
  await expect(score).toHaveValue("7");
  page.once("dialog", (d) => d.accept());
  await filter.selectOption("all");
  await expect(score).toHaveValue("");
  await filter.selectOption("court-1");
  await nav(page, "Home");
  await page.getByRole("button", { name: "My scores", exact: true }).click();
  await expect(filter).toHaveValue(m.court_id);
  await expect(score).toBeVisible();
});

test("a spectator sees why scoring is unavailable and an informative empty correction queue", async ({
  page,
}) => {
  const state = await openLeague(page);
  state.data.matches.forEach((m) => {
    m.a = m.a.map((id) => (id === mockUser.id ? "spectator-replacement" : id));
    m.b = m.b.map((id) => (id === mockUser.id ? "spectator-replacement" : id));
  });
  state.data.version = "spectator";
  await page
    .getByRole("button", { name: "Refresh league", exact: true })
    .click();
  await nav(page, "Scores");
  await expect(
    page.getByText("You are viewing this round as a spectator.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Correction requests", exact: true }),
  ).toContainText("No correction requests yet.");
  await expect(
    page.getByRole("button", { name: "Request a correction", exact: true }),
  ).toHaveCount(0);
});

test("Schedule follows the selected season, recovers metadata failures and explains facility cancellations", async ({
  page,
}) => {
  const state = await openLeague(page);
  let fail = true;
  await page.route("**/rest/v1/venues?**", (route) =>
    route.fulfill({
      status: fail ? 400 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        fail
          ? {}
          : [
              {
                id: "venue",
                name: "Selected season gym",
                address: "Test address",
                rooms: "Six courts",
              },
            ],
      ),
    }),
  );
  await page.route("**/rest/v1/sessions?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        { id: "session", calendar_uid: "stable-calendar-id" },
      ]),
    }),
  );
  await page.route("**/rest/v1/clubs?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ slug: "test-season" }),
    }),
  );
  state.data.sessions[0].status = "cancelled";
  state.data.version = "cancelled";
  await page
    .getByRole("button", { name: "Refresh league", exact: true })
    .click();
  await nav(page, "Schedule");
  await expect(
    page.getByRole("button", { name: "Retry calendar details" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download season calendar" }),
  ).toBeDisabled();
  await expect(page.locator(".lp-schedule")).toContainText(
    "Venue details unavailable",
  );
  fail = false;
  await page.getByRole("button", { name: "Retry calendar details" }).click();
  await expect(
    page.getByRole("button", { name: "Download season calendar" }),
  ).toBeEnabled();
  await expect(page.locator(".lp-schedule")).toContainText(
    "Selected season gym",
  );
  await expect(page.locator(".lp-schedule")).toContainText(
    "confirmed paid spares receive a $20 refund",
  );
  await expect(
    page.getByRole("button", { name: /View courts for/ }),
  ).toHaveCount(0);
});
