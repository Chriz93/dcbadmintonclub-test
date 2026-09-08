import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("player sees previous matches without login clutter, and can retry a failed refresh (mock API)", async ({
  page,
}) => {
  const user = {
    id: "22000000-0000-0000-0000-000000000004",
    aud: "authenticated",
    role: "authenticated",
    email: "synthetic@example.invalid",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-09-01T00:00:00Z",
  };
  const token = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        aud: "authenticated",
        role: "authenticated",
        aal: "aal1",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "synthetic",
  ].join(".");
  let fail = false;
  await page.route(
    "https://wgolevihkvmosajumzvl.supabase.co/**",
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (path === "/auth/v1/otp") data = {};
      else if (path === "/auth/v1/verify")
        data = {
          access_token: token,
          refresh_token: "synthetic-refresh",
          token_type: "bearer",
          expires_in: 3600,
          user,
        };
      else if (path === "/auth/v1/user") data = user;
      else if (path.endsWith("/memberships"))
        data = [
          {
            club_id: "club",
            role: "member",
            status: "active",
            kind: "regular",
            club: { name: "Synthetic club" },
          },
        ];
      else if (path.endsWith("/rpc/my_legacy_matches"))
        data = [
          {
            id: "legacy-1",
            archive_label: "Previous league season",
            session_label: "April 2026",
            court: 1,
            round: 2,
            game: 3,
            score_a: 15,
            score_b: 15,
            on_a: true,
            partner: "Original partner",
            opponents: "Original opponent",
            needs_review: true,
          },
        ];
      else if (path.endsWith("/rpc/my_match_history")) {
        if (fail) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ message: "Synthetic failure" }),
          });
          return;
        }
        data = [
          {
            id: "match-1",
            club_id: "club",
            season_name: "Synthetic season",
            starts_at: "2026-09-01T00:15:00Z",
            court_number: 6,
            round: 4,
            game: 5,
            partner: "Alex <script>test</script>",
            opponents: "Jamie, Pat",
            my_score: 15,
            opponent_score: 13,
            result: "Won",
          },
        ];
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    },
  );
  await page.goto("http://127.0.0.1:5174/");
  await page.getByRole("button", { name: "Member hub", exact: true }).click();
  await page.getByLabel("Email address", { exact: true }).fill(user.email);
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await page.getByLabel("One-time code").fill("123456");
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  const history = page.getByRole("region", { name: "My previous matches" });
  await expect(history).toContainText("Won 15–13");
  await expect(history).toContainText("Court 6 · Round 4 · Game 5");
  await expect(history).toContainText("Alex <script>test</script>");
  await expect(
    page.getByRole("button", { name: "Send sign-in code" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Reminder preferences", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Email reminders")).not.toBeVisible();
  fail = true;
  await history.getByRole("button", { name: "Refresh my matches" }).click();
  await expect(history).toContainText("Could not load your matches");
  await expect(history).toContainText("Won 15–13");
  fail = false;
  await history.getByRole("button", { name: "Refresh my matches" }).click();
  await expect(history).toContainText("Results refreshed");
  expect(
    (
      await new AxeBuilder({ page })
        .include('[aria-label="My previous matches"]')
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByText("Previous seasons", { exact: true }).click();
  await page.getByRole("button", { name: "Load previous seasons" }).click();
  const archived = page.getByRole("region", { name: "Archived match history" });
  await expect(archived).toContainText("April 2026 · 15–15");
  await expect(archived).toContainText("Original score needs review");
  expect(
    (
      await new AxeBuilder({ page })
        .include('[aria-label="Archived match history"]')
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
