import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("administrator edits public settings with a reason and safely renders announcement text (mock API)", async ({
  page,
}) => {
  const user = {
    id: "22000000-0000-0000-0000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "admin@example.invalid",
    app_metadata: {},
    user_metadata: {},
    factors: [],
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
        aal: "aal2",
        exp: Math.floor(Date.now() / 1000) + 3600,
        amr: [
          { method: "otp", timestamp: 1 },
          { method: "totp", timestamp: 2 },
        ],
      }),
    ).toString("base64url"),
    Buffer.alloc(32).toString("base64url"),
  ].join(".");
  let saved: unknown;
  let eligibilitySaved: unknown;
  await page.route(
    "https://wgolevihkvmosajumzvl.supabase.co/**",
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (path.endsWith("/rpc/public_club"))
        data = {
          name: "Synthetic Club",
          contactEmail: "public@example.invalid",
          accent: "#146b4c",
          announcements: [
            {
              id: "a",
              title: "Public notice",
              body: "<script>window.unwanted=true</script>",
            },
          ],
        };
      else if (path === "/auth/v1/otp") data = {};
      else if (path === "/auth/v1/verify")
        data = {
          access_token: token,
          refresh_token: "synthetic-refresh",
          token_type: "bearer",
          expires_in: 3600,
          user,
        };
      else if (path === "/auth/v1/user") data = user;
      else if (path.endsWith("/rpc/is_admin")) data = true;
      else if (path.endsWith("/clubs"))
        data = route.request().headers().accept?.includes("object")
          ? {
              name: "Synthetic Club",
              revision: 2,
              settings: {
                contactEmail: "public@example.invalid",
                accent: "#146b4c",
              },
            }
          : [{ id: "club", name: "Synthetic Club" }];
      else if (path.endsWith("/participant_eligibility"))
        data = [
          {
            user_id: "child",
            season_id: "season",
            birth_date: "2010-01-01",
            guardian_email: "guardian@example.invalid",
            revision: 3,
          },
        ];
      else if (path.endsWith("/member_intake"))
        data = [
          {
            user_id: "child",
            season_id: "season",
            legal_name: "Synthetic child",
          },
        ];
      else if (path.endsWith("/rpc/review_eligibility")) {
        eligibilitySaved = route.request().postDataJSON();
        data = null;
      } else if (path.endsWith("/rpc/save_club_settings")) {
        saved = route.request().postDataJSON();
        data = null;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    },
  );
  await page.goto("http://127.0.0.1:5174/");
  await expect(page.getByRole("region", { name: "Club news" })).toContainText(
    "<script>window.unwanted=true</script>",
  );
  expect(await page.evaluate(() => Object.hasOwn(window, "unwanted"))).toBe(
    false,
  );
  await page.getByRole("button", { name: "Member hub", exact: true }).click();
  await page.getByLabel("Email address", { exact: true }).fill(user.email);
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await page.getByLabel("One-time code").fill("123456");
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your upcoming sessions" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await page
    .getByText("Participant and guardian identity review", { exact: true })
    .click();
  await page.getByRole("button", { name: "Load eligibility details" }).click();
  await page
    .getByRole("combobox", { name: "Participant", exact: true })
    .selectOption("season/child");
  await expect(
    page.getByText("Date of birth: 2010-01-01.", { exact: false }),
  ).toBeVisible();
  const record = page.getByRole("button", { name: "Record identity review" });
  await expect(record).toBeDisabled();
  await page
    .getByLabel("Verified guardian legal name")
    .fill("Synthetic Guardian");
  await page
    .getByLabel("How you verified these details")
    .fill("Synthetic in-person identity and relationship check");
  await expect(record).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "I independently checked", exact: false })
    .check();
  await record.click();
  await expect
    .poll(() => eligibilitySaved)
    .toEqual({
      c: "club",
      s: "season",
      u: "child",
      expected_revision: 3,
      guardian_name: "Synthetic Guardian",
      reason: "Synthetic in-person identity and relationship check",
      confirmed: true,
    });
  await expect(
    page.getByRole("status").filter({ hasText: "Identity review recorded" }),
  ).toBeVisible();
  await page
    .getByText("Club settings, season builder and announcements", {
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Load club setup", exact: true })
    .click();
  await page
    .getByLabel("Club display name", { exact: true })
    .fill("Updated synthetic club");
  await page
    .getByLabel("Settings change reason", { exact: true })
    .fill("Reviewed public branding");
  const result = await new AxeBuilder({ page }).include("main").analyze();
  expect(result.violations.map((v) => v.id)).toEqual([]);
  await page
    .getByRole("button", { name: "Save public club details", exact: true })
    .click();
  await expect
    .poll(() => saved)
    .toEqual({
      c: "club",
      expected_revision: 2,
      club_name: "Updated synthetic club",
      contact_email: "public@example.invalid",
      accent: "#146b4c",
      reason: "Reviewed public branding",
    });
});
