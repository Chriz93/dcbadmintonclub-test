import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockSignIn, signIn } from "./auth-fixture";

test("sign-in is the front door; codes are bound to their email and errors can be retried", async ({
  page,
}) => {
  const requests: { email: string }[] = [];
  await page.route(
    "https://wgolevihkvmosajumzvl.supabase.co/**",
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      expect(path.startsWith("/auth/")).toBe(true); // No private content loads before authentication.
      requests.push(route.request().postDataJSON());
      await route.fulfill({
        status: path.endsWith("/verify") ? 403 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          path.endsWith("/verify") ? { message: "Invalid test code" } : {},
        ),
      });
    },
  );
  await page.goto("http://127.0.0.1:5174/#admin");
  await expect(
    page.getByRole("heading", { name: "Welcome to Maplewood." }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Administration", exact: true }),
  ).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: `test-results/workflow-${test.info().line}-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByLabel("Email address", { exact: true })
    .fill("first@example.invalid");
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel("One-time code").fill("111111");
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Code expired or invalid",
  );
  await page
    .getByRole("button", { name: "Change email or request a new code" })
    .click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("second@example.invalid");
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await expect(page.getByLabel("One-time code")).toHaveValue("");
  expect(requests.map((r) => r.email)).toEqual([
    "first@example.invalid",
    "first@example.invalid",
    "second@example.invalid",
  ]);
});

test("new player progresses from details to the agreement, then waits for server approval", async ({
  page,
}) => {
  let intake: Record<string, unknown> | undefined;
  await page.route(
    "https://wgolevihkvmosajumzvl.supabase.co/**",
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (path.endsWith("/intake_options"))
        data = [
          { club_id: "club", season_id: "season", season_name: "2026–27" },
        ];
      if (path.endsWith("/my_invitation")) data = "regular";
      if (path.endsWith("/submit_intake")) {
        intake = route.request().postDataJSON();
        data = 1;
      }
      if (path.endsWith("/registrations"))
        data = [{ status: "pending", season: { name: "2026–27" } }];
      if (path.endsWith("/participant_eligibility")) data = null;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    },
  );
  await mockSignIn(page, "member", "none");
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Your registration", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Courts", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Administration", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "1 Player details" }),
  ).toHaveAttribute("aria-current", "step");
  await page
    .getByLabel("Full legal name", { exact: true })
    .fill("Synthetic Player");
  await page.getByLabel("Name shown in standings").fill("Synthetic");
  await page.getByRole("button", { name: "2 Season agreement" }).click();
  await page.getByRole("button", { name: "1 Player details" }).click();
  await expect(page.getByLabel("Full legal name", { exact: true })).toHaveValue(
    "Synthetic Player",
  );
  await page.getByLabel("Phone", { exact: true }).fill("6135550100");
  await page
    .getByLabel("Emergency contact name and phone")
    .fill("Synthetic Contact 6135550101");
  await page.getByLabel("Amount already sent (CAD)").fill("400");
  await page
    .getByLabel("E-transfer reference (optional)")
    .fill("SYNTHETIC-ONLY");
  await expect(page.getByLabel("Player type")).toBeDisabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: `test-results/workflow-${test.info().line}-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save my details for review" })
    .click();
  await expect(
    page.getByRole("button", { name: "2 Season agreement" }),
  ).toHaveAttribute("aria-current", "step");
  expect(intake).toMatchObject({
    legal_name: "Synthetic Player",
    claimed_amount_cents: 40000,
    expected_revision: 0,
    kind: "regular",
  });
  await expect(
    page.getByText("No agreement is available for you to sign yet.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View approval status" }).click();
  await expect(
    page.getByText("Awaiting Christy’s review", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh my membership" }).click();
  await expect(
    page.getByRole("button", { name: "Courts", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("a closed registration still allows guardian signing without creating a player", async ({
  page,
}) => {
  await page.route(
    "https://wgolevihkvmosajumzvl.supabase.co/**",
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      const data = path.endsWith("/intake_options")
        ? [{ club_id: "club", season_id: "season", season_name: "2026–27" }]
        : path.endsWith("/my_invitation")
          ? "none"
          : path.endsWith("/participant_eligibility")
            ? null
            : [];
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    },
  );
  await mockSignIn(page, "member", "none");
  await signIn(page);
  await expect(page.getByRole("alert")).toContainText("Registration is closed");
  await expect(page.getByLabel("Full legal name", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Go to guardian signing" }).click();
  await expect(page.locator("#participant-signing")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save my details for review" }),
  ).toHaveCount(0);
});

test("membership failures fail closed and retry; regular members can sign out and lose private navigation", async ({
  page,
}) => {
  await page.route("https://wgolevihkvmosajumzvl.supabase.co/**", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  await mockSignIn(page);
  let fail = true;
  await page.route("**/rest/v1/memberships?**", async (route) => {
    if (!fail) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "Synthetic unavailable" }),
    });
  });
  await signIn(page);
  await expect(page.getByRole("alert")).toContainText(
    "membership could not be loaded",
  );
  await expect(
    page.getByRole("button", { name: "Courts", exact: true }),
  ).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Retry membership" }).click();
  await expect(
    page.getByRole("heading", { name: "Your league night." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Administration", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Complete your league details" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "My account", exact: true }).click();
  await page.getByRole("button", { name: "Open registration" }).click();
  await expect(
    page.getByRole("heading", { name: "Your registration", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to Maplewood." }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome to Maplewood." }),
  ).toBeVisible();
});

test("an owner can open administration without registering as a player", async ({
  page,
}) => {
  await page.route("https://wgolevihkvmosajumzvl.supabase.co/**", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  await mockSignIn(page, "club_owner");
  await signIn(page);
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Set up or verify authenticator" }),
  ).toBeVisible();
  await expect(page.getByLabel("Full legal name", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Validate preview" }),
  ).not.toBeVisible();
  await page
    .getByText("Permit dates and schedule import", { exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Validate preview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open match-day controls" }).click();
  await expect(
    page.getByRole("button", { name: "Load my clubs" }),
  ).toBeVisible();
});
