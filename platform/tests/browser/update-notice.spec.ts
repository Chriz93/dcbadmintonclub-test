import { test, expect } from "@playwright/test";
test("release update notice never reloads or discards work without confirmation", async ({
  page,
}) => {
  await page.route("**/app-version.json?check=1", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ entry: "index-nextrelease.js" }),
    }),
  );
  await page.goto("http://127.0.0.1:4173/?demo=game-day");
  await expect(
    page.getByText("A newer version of Maplewood is ready."),
  ).toBeVisible();
  await page.getByLabel("Jump to a step").selectOption("6");
  const input = page
    .locator('.gd-match input[aria-label$="Team A score"]')
    .first();
  await input.fill("7");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Reload updated app" }).click();
  await expect(input).toHaveValue("7");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reload updated app" }).click();
  await expect(
    page.getByRole("button", { name: "Continue as Maya Chen", exact: true }),
  ).toBeVisible();
});
test("current version metadata matches the built entry and does not show a false update", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4173/?demo=game-day");
  const entry = await page
    .locator('script[type="module"][src]')
    .getAttribute("src");
  const response = await page.request.get(
    "http://127.0.0.1:4173/app-version.json?check=1",
  );
  expect(response.ok()).toBe(true);
  expect((await response.json()).entry).toBe(entry!.split("/").at(-1));
  await expect(
    page.getByRole("button", { name: "Reload updated app" }),
  ).toHaveCount(0);
});
