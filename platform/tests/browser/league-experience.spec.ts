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
  await expect(page.locator(".lp-court")).toHaveCount(6);
  await expect(page.locator(".lp-court-person")).toHaveCount(25);
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
    .getByRole("combobox", { name: "Show games", exact: true })
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
    page.getByRole("heading", { name: "Scores", exact: true }),
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
  await expect(page.locator(".lp-court")).toHaveCount(6);
  state.fail = true;
  await page
    .getByRole("button", { name: "Refresh league", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("could not be refreshed");
  await expect(page.locator(".lp-court")).toHaveCount(6);
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
