import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/?demo=game-day");
});

test("starts without authentication, keeps all data local, and walks registration to approval", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (/^https?:/.test(r.url()) && new URL(r.url()).hostname !== "127.0.0.1")
      external.push(r.url());
  });
  await page
    .getByRole("button", { name: "Continue as Maya Chen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your registration", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Age group", exact: true })
    .selectOption("minor");
  await expect(
    page.getByText(/A separately signed-in guardian must complete consent/),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save demo registration" }).click();
  await expect(page.getByRole("status")).toContainText(
    "verify payment and eligibility",
  );
  await page.getByLabel("Jump to a step").selectOption("2");
  await page
    .getByRole("button", { name: "Approve demo player & seed" })
    .click();
  await expect(page.getByRole("status")).toContainText("1180 ELO");
  expect(external).toEqual([]);
});

test("shows all 25 court players, all five rest slots, and clickable full profiles", async ({
  page,
}) => {
  await page.getByLabel("Jump to a step").selectOption("5");
  await expect(page.locator(".md-player button")).toHaveCount(25);
  await expect(
    page
      .locator(".md-court")
      .filter({
        has: page.getByRole("button", { name: "Open Court 6", exact: true }),
      })
      .locator(".md-player button"),
  ).toHaveCount(5);
  await expect(page.locator(".gd-court-game .gd-rest")).toHaveCount(5);
  await page
    .locator(".md-board")
    .getByRole("button", { name: "Maya Chen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Maya Chen" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "ELO progress" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Match history", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".gd-history .gd-match")).toHaveCount(12);
});

test("rejects tied scores and saves a player's own result only once", async ({
  page,
}) => {
  await page.getByLabel("Jump to a step").selectOption("6");
  const card = page.locator(".gd-match").first(),
    a = card.locator('input[aria-label$="Team A score"]'),
    b = card.locator('input[aria-label$="Team B score"]');
  const target = (await a.getAttribute("max"))!;
  await a.fill(target);
  await b.fill(target);
  await card.getByRole("button", { name: "Save result" }).click();
  await expect(page.getByRole("status")).toContainText(
    "not a valid completed game",
  );
  await b.fill("10");
  await card.getByRole("button", { name: "Save result" }).click();
  await expect(
    card.getByText("✓ Saved in demo", { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Correct result" }),
  ).toBeDisabled();
  await page
    .getByRole("combobox", { name: "Select Your Court", exact: true })
    .selectOption("6");
  for (const input of await page.locator(".gd-score-entry input").all())
    await expect(input).toBeDisabled();
});

test("reviews movement and completes 80 games without losing players or adding a round", async ({
  page,
}) => {
  await page.getByLabel("Jump to a step").selectOption("7");
  await expect(page.getByRole("main")).toContainText("20 / 20 games complete");
  await expect(page.locator(".gd-summary-courts .gd-final-row")).toHaveCount(
    25,
  );
  await page
    .getByRole("button", { name: "Publish round 2", exact: true })
    .click();
  await page.locator(".gd-session-picker summary").click();
  await expect(
    page.getByRole("combobox", { name: "Round", exact: true }),
  ).toHaveValue("2");
  await expect(page.locator(".md-player button")).toHaveCount(25);
  await page.getByLabel("Jump to a step").selectOption("8");
  await expect(page.locator(".gd-summary-courts .gd-final-row")).toHaveCount(
    25,
  );
  await expect(page.locator(".gd-footer")).toContainText(
    "320 official fictional games",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Scores", exact: true })
    .click();
  await page.locator(".gd-session-picker summary").click();
  await expect(
    page
      .getByRole("combobox", { name: "Round", exact: true })
      .locator("option"),
  ).toHaveCount(4);
  await expect(
    page.getByText("20 / 20 games complete", { exact: true }),
  ).toBeVisible();
});

test("all familiar standings sections work with the same complete league", async ({
  page,
}) => {
  await page.getByLabel("Jump to a step").selectOption("9");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Standings", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(25);
  await page.getByRole("button", { name: "Stats", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "Point %", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await expect(page.locator(".gd-summary-courts .gd-final-row")).toHaveCount(
    25,
  );
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByText("80 recorded games", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Show more matches", exact: true })
    .click();
  await expect(page.locator(".gd-history .gd-match")).toHaveCount(36);
});

test("admin correction is audited and reset restores the original three-session fixture", async ({
  page,
}) => {
  await page.getByLabel("Jump to a step").selectOption("10");
  const card = page.locator(".gd-match").first(),
    a = card.locator('input[aria-label$="Team A score"]'),
    b = card.locator('input[aria-label$="Team B score"]');
  const oldA = await a.inputValue(),
    oldB = await b.inputValue();
  await a.fill(oldB);
  await b.fill(oldA);
  await card
    .getByLabel("Correction reason")
    .fill("Demo review: winner entered backwards");
  await card.getByRole("button", { name: "Correct result" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Result saved in the demo",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Admin", exact: true })
    .click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(page.locator(".gd-audit")).toContainText(
    "winner entered backwards",
  );
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await expect(page.locator(".gd-footer")).toContainText(
    "240 official fictional games",
  );
  await expect(
    page.getByRole("button", { name: "Continue as Maya Chen", exact: true }),
  ).toBeVisible();
});

test("narration is real playable audio with pause controls and a transcript", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Play full tour", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause narration", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((e: HTMLAudioElement) => e.duration),
    )
    .toBeGreaterThan(10);
  await expect
    .poll(() =>
      page.locator("audio").evaluate((e: HTMLAudioElement) => e.currentTime),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Pause narration", exact: true })
    .click();
  await expect(
    page.locator("audio").evaluate((e: HTMLAudioElement) => e.paused),
  ).resolves.toBe(true);
  await page.getByText("Read the explanation", { exact: true }).click();
  await expect(
    page.getByText(/Welcome, Christy. This is a fictional/),
  ).toBeVisible();
});

test("phone and desktop layouts retain all courts without page overflow", async ({
  page,
}) => {
  await page.getByLabel("Jump to a step").selectOption("5");
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.viewport + 1);
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "Courts", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "📋 List View", exact: true }).click();
  await expect(page.locator(".md-list .md-court")).toHaveCount(6);
});

test("published movements remain accessible for every round, including final placements", async ({
  page,
}) => {
  await page.getByLabel("Jump to a step").selectOption("7");
  await page
    .getByRole("button", { name: "Publish round 2", exact: true })
    .click();
  await expect(page.locator(".md-movement")).toHaveCount(25);
  await expect(page.locator(".md-movement.md-up")).toHaveCount(5);
  await expect(page.locator(".md-movement.md-down")).toHaveCount(5);
  await page
    .getByRole("button", { name: "Court movements", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Court movements" }),
  ).toBeVisible();
  await expect(page.locator(".gd-movement-history .gd-final-row")).toHaveCount(
    25,
  );
  await expect(page.getByRole("main")).toContainText(
    "Published after round 1 · Assignments for round 2",
  );
  const first = await page.locator(".gd-movement-history").innerText();
  await page.getByLabel("Jump to a step").selectOption("8");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Courts", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Court movements", exact: true })
    .click();
  await expect(page.getByRole("main")).toContainText(
    "Final placement, no additional round",
  );
  await page
    .getByRole("combobox", { name: "Round", exact: true })
    .selectOption("1");
  await expect(page.locator(".gd-movement-history")).toHaveText(first, {
    useInnerText: true,
  });
  await expect(
    page
      .getByRole("combobox", { name: "Round", exact: true })
      .locator('option[value="5"]'),
  ).toHaveCount(0);
});

test("unfinished round shows progress without publishing phantom movements", async ({
  page,
}) => {
  await page.getByLabel("Jump to a step").selectOption("5");
  await expect(
    page.getByRole("region", { name: "Round progress" }),
  ).toContainText("0 / 20 games complete");
  await page
    .getByRole("button", { name: "Court movements", exact: true })
    .click();
  await expect(page.getByRole("main")).toContainText(
    "No movements published for this round",
  );
  await expect(page.locator(".gd-movement-history .gd-final-row")).toHaveCount(
    0,
  );
});

test("a player has their next game, opponents and a direct scores action", async ({
  page,
}) => {
  await page.getByLabel("Jump to a step").selectOption("5");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Home", exact: true })
    .click();
  const next = page.getByLabel("My next game", { exact: true });
  await expect(next).toContainText("Round 1 · Game 1");
  await expect(next).toContainText("Partner:");
  await expect(next).toContainText("Opponents:");
  await next.getByRole("button", { name: "My scores", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Enter Scores" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Select Your Court", exact: true }),
  ).toHaveValue("4");
});

test("movement history fits on screen and names remain clickable", async ({
  page,
}) => {
  await page.getByLabel("Jump to a step").selectOption("7");
  await page
    .getByRole("button", { name: "Publish round 2", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Court movements", exact: true })
    .click();
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.viewport + 1);
  await page
    .locator(".gd-movement-history")
    .getByRole("button", { name: "Maya Chen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Maya Chen" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Match history", exact: true }),
  ).toBeVisible();
});
