// Sign-in codes: Supabase sends 6 or 8 digits depending on the project (the test project sends 8). Both sign in; a wrong
// or too-short code is refused with a message; the box takes at most 8 digits and no longer promises "6-digit".
import { test, expect } from "@playwright/test";
import { installMock, freshState, ORGANIZER } from "../mock-supabase";

const CASES: [string, string, "in" | "wrong" | "short"][] = [["8-digit code", "12345678", "in"], ["6-digit code", "123456", "in"], ["wrong 8-digit code", "87654321", "wrong"], ["too short", "12345", "short"]];
for (const [label, code, outcome] of CASES) {
  test(`Sign-in · ${label}`, async ({ page }) => {
    await installMock(page, freshState());
    await page.goto("/");
    await page.fill("#signin-email-input", ORGANIZER);
    await page.click("#signin-btn");
    const box = page.locator("#signin-code-input");
    await expect(box).toBeVisible();
    await expect(box).toHaveAttribute("placeholder", "CODE FROM YOUR EMAIL");
    await box.pressSequentially(code);
    await page.click("#signin-btn");
    if (outcome === "in") await expect(page.locator("#invite-gate"), "signed in").toBeHidden();
    else if (outcome === "short") await expect(page.locator("#invite-err")).toHaveText("Enter the code from your email");
    else await expect(page.locator("#invite-err")).toContainText("❌");
  });
}
test("Sign-in · the box takes at most 8 digits", async ({ page }) => {
  await installMock(page, freshState());
  await page.goto("/");
  await page.fill("#signin-email-input", ORGANIZER);
  await page.click("#signin-btn");
  await expect(page.locator("#signin-code-input")).toBeVisible();   // the box appears once the code is sent
  await page.locator("#signin-code-input").pressSequentially("1234567890");
  await expect(page.locator("#signin-code-input")).toHaveValue("12345678");
});
