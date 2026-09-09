import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { leagueFixture, openLeague } from "./league-fixture";
import { mockUser } from "./auth-fixture";
const nav = (page: import("@playwright/test").Page, name: string) =>
  page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();

test("gym keeps physical court order, actual teams, all 25 players and a resting slot on phones", async ({
  page,
}) => {
  const state = await openLeague(page);
  await nav(page, "Courts");
  const cards = page.locator(".md-court");
  expect(
    await cards.evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-court")),
    ),
  ).toEqual(["1", "2", "3", "6", "5", "4"]);
  const boxes = await cards.evaluateAll((els) =>
    els.map((e) => ({
      x: e.getBoundingClientRect().x,
      y: e.getBoundingClientRect().y,
    })),
  );
  expect(boxes[0].y).toBe(boxes[2].y);
  expect(boxes[3].y).toBeGreaterThan(boxes[0].y);
  expect(boxes[0].x).toBe(boxes[3].x);
  const names = await page.locator(".md-player button").allTextContents();
  expect(new Set(names).size).toBe(25);
  const c6 = page.locator('.md-court[data-court="6"]');
  await expect(c6.locator(".md-team .md-player")).toHaveCount(4);
  await expect(c6.locator(".md-rest .md-player")).toHaveCount(1);
  const first = state.data.matches.find(
    (m) => m.round === 2 && m.court_id === "court-6",
  )!;
  const expected = first.a.map(
    (id) => state.data.players.find((p) => p.id === id)!.name,
  );
  expect(
    await c6.locator(".md-team").first().locator("button").allTextContents(),
  ).toEqual(expected);
  await c6.getByRole("button", { name: "Open Court 6" }).click();
  await expect(page.locator(".lp-court-game")).toHaveCount(5);
  await expect(page.locator(".lp-court-game small")).toHaveCount(5);
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  const a11y = await new AxeBuilder({ page })
    .include(".lp-match-day")
    .analyze();
  expect(a11y.violations).toEqual([]);
  const share = await page
    .getByRole("link", { name: "Share Court Assignments on WhatsApp" })
    .getAttribute("href");
  expect(new URL(share!).hostname).toBe("wa.me");
  for (const p of state.data.players)
    expect(new URL(share!).searchParams.get("text")).toContain(p.name);
});

test("court roster selects scores without allowing a member to score someone else's match", async ({
  page,
}) => {
  await openLeague(page);
  await nav(page, "Scores");
  await expect(
    page.getByRole("heading", { name: "Enter Scores", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".md-roster")).toHaveCount(6);
  await expect(page.locator(".md-progress-cell")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Scores for Court 6", exact: true })
    .click();
  await expect(page.getByLabel("Select Your Court")).toHaveValue("court-6");
  await expect(page.locator(".lp-match")).toHaveCount(5);
  await expect(
    page.getByRole("button", { name: "Save result", exact: true }),
  ).toHaveCount(0);
  const a11y = await new AxeBuilder({ page })
    .include(".lp-match-day")
    .analyze();
  expect(a11y.violations).toEqual([]);
});

test("partial court completion shows standings but no proposed movement until all courts finish", async ({
  page,
}) => {
  const data = leagueFixture();
  for (const m of data.matches.filter(
    (m) => m.round === 2 && m.court_id === "court-1",
  )) {
    m.scoreA = m.target;
    m.scoreB = 10;
  }
  await openLeague(page, false, data);
  await nav(page, "Scores");
  await expect(page.locator(".md-done")).toHaveCount(1);
  await expect(page.locator(".md-standing-row")).toHaveCount(4);
  await expect(page.locator(".md-progress-note")).not.toContainText(
    "Proposed movements",
  );
  await expect(page.locator(".md-standing-row small")).toHaveCount(0);
  await expect(page.locator(".md-progress")).toContainText(
    "3 / 20 games complete",
  );
});

test("a finished round shows proposed arrows, and saved history shows published arrows", async ({
  page,
}) => {
  const data = leagueFixture();
  for (const m of data.matches.filter((m) => m.round === 2)) {
    m.scoreA = m.target;
    m.scoreB = 10;
  }
  await openLeague(page, false, data);
  await nav(page, "Scores");
  await expect(page.locator(".md-done")).toHaveCount(6);
  await expect(page.locator(".md-standing-row")).toHaveCount(25);
  await expect(page.locator(".md-progress-note")).toContainText(
    "Proposed movements",
  );
  await expect(page.locator(".md-row-up")).toHaveCount(5);
  await expect(page.locator(".md-row-down")).toHaveCount(5);
  await page.locator(".lp-session-picker summary").click();
  await page
    .getByRole("combobox", { name: "Round", exact: true })
    .selectOption("1");
  await expect(page.locator(".md-progress-note")).toContainText(
    "Published movements",
  );
  await expect(
    page.locator(".md-standing-row small .md-sr").first(),
  ).toHaveText(" Published");
});

test("missing scheduled game cannot turn a full-looking court into finished standings", async ({
  page,
}) => {
  const data = leagueFixture();
  for (const m of data.matches.filter((m) => m.round === 2)) {
    m.scoreA = m.target;
    m.scoreB = 10;
  }
  data.matches.splice(
    data.matches.findIndex((m) => m.round === 2 && m.court_id === "court-6"),
    1,
  );
  await openLeague(page, false, data);
  await nav(page, "Scores");
  await expect(page.locator(".md-progress-note")).toContainText(
    "Administrator review needed",
  );
  await expect(page.locator(".md-done")).toHaveCount(0);
  await expect(page.locator(".md-standing-row")).toHaveCount(0);
});

test("changing court protects an unsaved score and an admin retains all correction access", async ({
  page,
}) => {
  const { data } = await openLeague(page, true);
  await nav(page, "Scores");
  const m = data.matches.find(
    (m) => m.round === 2 && [...m.a, ...m.b].includes(mockUser.id),
  )!;
  await page.getByLabel(`${m.id} Team A score`).fill("9");
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Scores for Court 6", exact: true })
    .click();
  await expect(page.getByLabel(`${m.id} Team A score`)).toHaveValue("9");
  await expect(page.getByLabel("Select Your Court")).toHaveValue(m.court_id);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Scores for Court 6", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save result", exact: true }),
  ).toHaveCount(5);
  await page.locator(".lp-session-picker summary").click();
  await page
    .getByRole("combobox", { name: "Round", exact: true })
    .selectOption("1");
  await expect(
    page.getByRole("button", { name: "Correct saved result", exact: true }),
  ).toHaveCount(5);
});
