import { expect, type Page } from "@playwright/test";
export const mockUser = {
  id: "22000000-0000-0000-0000-000000000004",
  aud: "authenticated",
  role: "authenticated",
  email: "synthetic@example.invalid",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-09-01T00:00:00Z",
};
export async function mockSignIn(
  page: Page,
  role = "member",
  status = "active",
  club = "club",
  user = mockUser,
  aal = "aal1",
) {
  const token = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        aud: "authenticated",
        role: "authenticated",
        aal,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    Buffer.from("synthetic-signature").toString("base64url"),
  ].join(".");
  await page.route(
    "https://wgolevihkvmosajumzvl.supabase.co/auth/v1/**",
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      const data = path.endsWith("/verify")
        ? {
            access_token: token,
            refresh_token: "synthetic-refresh",
            token_type: "bearer",
            expires_in: 3600,
            user,
          }
        : path.endsWith("/user")
          ? user
          : {};
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    },
  );
  await page.route(
    "https://wgolevihkvmosajumzvl.supabase.co/rest/v1/memberships?**",
    (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          status === "none"
            ? []
            : [
                {
                  club_id: club,
                  role,
                  status,
                  kind: "regular",
                  club: { name: "Synthetic club" },
                },
              ],
        ),
      }),
  );
}
export async function signIn(page: Page) {
  await page.goto("http://127.0.0.1:5174/");
  await expect(
    page.getByRole("heading", { name: "Welcome to Maplewood." }),
  ).toBeVisible();
  await page.getByLabel("Email address", { exact: true }).fill(mockUser.email);
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await page.getByLabel("One-time code").fill("123456");
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
}
