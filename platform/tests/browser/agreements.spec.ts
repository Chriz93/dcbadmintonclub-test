import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const capacity of ["adult", "guardian"]) {
  test(`${capacity} signs exact reviewed agreement and receives a receipt (mock API)`, async ({
    page,
  }) => {
    const user = {
      id: "22000000-0000-0000-0000-000000000004",
      aud: "authenticated",
      role: "authenticated",
      email: "synthetic@example.invalid",
      email_confirmed_at: "2026-09-01T00:00:00Z",
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
    const agreement = {
      club_id: "club",
      season_id: "season",
      participant_id: capacity === "adult" ? user.id : "minor",
      participant_name: "Synthetic Player",
      waiver_id: "waiver",
      version: 1,
      body: "Synthetic reviewed agreement. Refund $14 with 72 hours notice. <script>not executable</script>",
      sha256: "a".repeat(64),
      capacity,
    };
    let signed: Record<string, unknown> | undefined;
    let otpRequests = 0;
    await page.route(
      "https://wgolevihkvmosajumzvl.supabase.co/**",
      async (route) => {
        const path = new URL(route.request().url()).pathname;
        let data: unknown = [];
        if (path === "/auth/v1/otp") {
          otpRequests++;
          data = {};
        } else if (path === "/auth/v1/verify")
          data = {
            access_token: token,
            refresh_token: "synthetic-refresh",
            token_type: "bearer",
            expires_in: 3600,
            user,
          };
        else if (path === "/auth/v1/user") data = user;
        else if (path.endsWith("/rpc/signing_options"))
          data = signed ? [] : [agreement];
        else if (path.endsWith("/signature_receipts"))
          data = signed
            ? [
                {
                  id: "receipt",
                  ...agreement,
                  signer_name: "Synthetic Signer",
                  signer_capacity: capacity,
                  signed_at: "2026-09-07T12:00:00Z",
                },
              ]
            : [];
        else if (path.endsWith("/rpc/sign_agreement")) {
          signed = route.request().postDataJSON();
          data = "receipt";
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
    await page
      .getByRole("button", { name: "Verify code", exact: true })
      .click();
    const signing = page.locator("#participant-signing");
    await expect(signing).toContainText(agreement.body);
    await expect(
      signing.getByRole("button", { name: "Sign this agreement" }),
    ).toBeDisabled();
    await signing
      .getByLabel("Signer’s full legal name")
      .fill("Synthetic Signer");
    if (capacity === "guardian")
      await signing.getByLabel("Relationship to participant").fill("Parent");
    await signing.getByRole("checkbox", { name: /I am 18 or older/ }).check();
    const scan = await new AxeBuilder({ page })
      .include("#participant-signing")
      .analyze();
    expect(scan.violations.map((v) => v.id)).toEqual([]);
    await signing.getByRole("button", { name: "Sign this agreement" }).click();
    await expect(signing).toContainText("Signature recorded.");
    expect(signed).toMatchObject({
      participant: agreement.participant_id,
      expected_hash: agreement.sha256,
      signer_name: "Synthetic Signer",
      accepted: true,
      adult_signer: true,
      relationship: capacity === "guardian" ? "Parent" : null,
    });
    await expect(
      signing.getByRole("button", { name: /Download signed agreement/ }),
    ).toBeVisible();
    expect(otpRequests).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
