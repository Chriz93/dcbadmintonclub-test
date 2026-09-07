import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("home, schedule and permit validation are usable", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "See you on court." }),
  ).toBeVisible();
  await expect(page.locator("body")).toContainText("No database connected");
  await page.screenshot({
    path: `test-results/home-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Season schedule", exact: true })
    .click();
  await expect(page.locator(".schedule-row.active")).toHaveCount(28);
  await expect(page.locator(".schedule-row.cancelled")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await page.getByRole("button", { name: "Validate preview" }).click();
  await expect(page.locator("#main")).toContainText(
    "28 active sessions · 56 hours",
  );
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("Court 6 rotation and score validation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Courtside", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Court 6 · Game 1 of 5" }),
  ).toBeVisible();
  await page.getByLabel("Team A score").fill("14");
  await page.getByLabel("Team B score").fill("12");
  await page.getByRole("button", { name: "Save practice score" }).click();
  await expect(page.getByRole("status")).toContainText(
    "not a valid completed game",
  );
  await page.getByLabel("Team A score").fill("15");
  await page.getByRole("button", { name: "Save practice score" }).click();
  await expect(page.getByRole("status")).toContainText("Practice score saved");
  await page.getByRole("button", { name: "Next game" }).click();
  await expect(
    page.getByRole("heading", { name: "Court 6 · Game 2 of 5" }),
  ).toBeVisible();
});
test("public pages have no serious accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  for (const route of [
    "Club home",
    "Season schedule",
    "Courtside",
    "Member hub",
    "Standings",
    "Administration",
  ]) {
    await page.getByRole("button", { name: route, exact: true }).click();
    const a = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      a.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
});

test("PDF preview reads locally and cannot import without a backend", async ({
  page,
}) => {
  const content =
    "BT /F1 12 Tf 40 760 Td (Permit 2026-07-21-0001) Tj 0 -20 Td (2026-09-15 20:15 22:15 Approved) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf +=
    `xref\n0 6\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  await page.goto("/");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await page.getByLabel("Read a permit PDF locally").setInputFiles({
    name: "synthetic-permit.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(pdf),
  });
  await expect(page.locator(".permit-upload")).toContainText(
    "1 unambiguous booking rows proposed",
    { timeout: 20000 },
  );
  await page.getByRole("button", { name: "Validate preview" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm reviewed import" }),
  ).toBeDisabled();
});
test("dark theme, keyboard navigation and no horizontal overflow", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Dark appearance" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const a = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(a.violations.map((v) => v.id)).toEqual([]);
});

test("compiled PWA is offline read-only and preserves other app caches", async ({
  page,
  context,
}) => {
  await page.goto("http://127.0.0.1:4173/");
  await expect(
    page.getByRole("heading", { name: "See you on court." }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await caches.open("unrelated-app-cache");
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "See you on court." }),
  ).toBeVisible();
  expect(await page.evaluate(() => caches.keys())).toContain(
    "unrelated-app-cache",
  );
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "See you on court." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Courtside", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save practice score" }),
  ).toBeDisabled();
  await context.setOffline(false);
});
