import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { databaseLeague } from "./database-league-fixture";
import { admins, seasonId, fixtureId } from "../../scripts/matchday-fixture";
const applicant = fixtureId(90);
test("a first-time player requests registration; admin sees details under Players and alone approves after checks", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const league = await databaseLeague(
      `insert into auth.users values('${applicant}','new-player@example.invalid',now());`,
    ),
    context = await browser.newContext();
  try {
    await league.open(page, applicant);
    await expect(
      page.getByRole("heading", { name: "Your registration", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Full legal name", { exact: true })
      .fill("New Player");
    await page.getByLabel("Name shown in standings").fill("New Player");
    await page.getByLabel("Phone", { exact: true }).fill("6135550199");
    await page
      .getByLabel("Emergency contact name and phone")
      .fill("Emergency 6135550100");
    await page.getByLabel("Player type").selectOption("spare");
    await page
      .getByRole("button", { name: "Submit registration request", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "2 Season agreement" }),
    ).toHaveAttribute("aria-current", "step");
    await page.getByRole("button", { name: "View approval status" }).click();
    await expect(
      page.getByText("Awaiting Christy’s review", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Courts", exact: true }),
    ).toHaveCount(0);
    // Reload the saved request and edit it without duplicating the applicant.
    await page.getByRole("button", { name: "Review my details" }).click();
    await page.getByRole("button", { name: "Reload saved details" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Your registration request is saved.",
    );
    await expect(
      page.getByLabel("Full legal name", { exact: true }),
    ).toHaveValue("New Player");
    await expect(page.getByLabel("Player type")).toHaveValue("spare");
    await page.getByLabel("Phone", { exact: true }).fill("6135550198");
    await page
      .getByRole("button", { name: "Save registration changes", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "2 Season agreement" }),
    ).toHaveAttribute("aria-current", "step");
    const admin = await context.newPage();
    await league.open(admin, admins[0], true);
    await admin
      .getByRole("button", { name: "Administration", exact: true })
      .click();
    const list = admin.getByRole("region", {
      name: "Player registrations",
      exact: true,
    });
    await expect(list).toContainText("All (26)");
    await expect(list).toContainText("Approved (25)");
    await list
      .getByRole("button", { name: "Pending (1)", exact: true })
      .click();
    const card = list.getByRole("article").filter({ hasText: "New Player" });
    await card
      .getByRole("button", { name: "Review player", exact: true })
      .click();
    await expect(card).toContainText("Emergency 6135550100");
    await expect(card).toContainText("6135550198");
    await admin.screenshot({
      path: `test-results/registration-admin-${test.info().project.name}.png`,
      fullPage: true,
    });
    await expect(
      card.getByRole("button", { name: "Approve player", exact: true }),
    ).toBeDisabled();
    expect(
      (
        await new AxeBuilder({ page: admin })
          .include(".player-registrations")
          .analyze()
      ).violations,
    ).toEqual([]);
    // Return to the player, save age and sign the real SQL-backed synthetic agreement.
    await page.getByRole("button", { name: "2 Season agreement" }).click();
    await page.getByLabel("Participant date of birth").fill("1990-01-01");
    await page.getByRole("checkbox").first().check();
    await page
      .getByRole("button", {
        name: "Save eligibility and rule acknowledgment",
        exact: true,
      })
      .click();
    // Selectors below assert the actual rendered signing controls.
    await page
      .getByLabel("Signer’s full legal name", { exact: true })
      .fill("New Player");
    await page.getByRole("checkbox", { name: /I am 18/ }).check();
    await page
      .getByRole("button", { name: "Sign this agreement", exact: true })
      .click();
    await card
      .getByRole("button", {
        name: "Review participant / guardian",
        exact: true,
      })
      .click();
    const eligibility = admin.locator("#eligibility-review");
    await eligibility
      .getByRole("button", { name: "Load eligibility details" })
      .click();
    await eligibility
      .getByRole("combobox", { name: "Participant", exact: true })
      .selectOption(`${seasonId}/${applicant}`);
    await eligibility
      .getByLabel("How you verified these details")
      .fill("Synthetic independent age and identity check");
    await eligibility.getByRole("checkbox").check();
    await eligibility
      .getByRole("button", { name: "Record identity review" })
      .click();
    await expect(eligibility.getByRole("status")).toContainText(
      "Identity review recorded",
    );
    await list
      .getByRole("button", { name: "Refresh players", exact: true })
      .click();
    await expect(
      card.getByRole("button", { name: "Approve player", exact: true }),
    ).toBeEnabled();
    await card
      .getByRole("button", { name: "Approve player", exact: true })
      .click();
    await expect(list).toContainText("New Player: approved.");
    await expect(list).toContainText("Approved (26)");
    await expect(list.getByRole("article")).toHaveCount(0);
    await list
      .getByRole("button", { name: "Approved (26)", exact: true })
      .click();
    await expect(
      list.getByRole("article").filter({ hasText: "New Player" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "View approval status" }).click();
    await page.getByRole("button", { name: "Refresh my membership" }).click();
    await expect(
      page.getByRole("button", { name: "Courts", exact: true }),
    ).toBeVisible();
    expect(league.errors).toEqual([]);
  } finally {
    await context.close();
    await page.unrouteAll({ behavior: "wait" }).catch(() => {});
    await league.close();
  }
});
