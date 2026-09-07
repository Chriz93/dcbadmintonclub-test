import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: process.env.CI
    ? [
        {
          command: "pnpm dev",
          url: "http://127.0.0.1:5173",
          reuseExistingServer: false,
        },
        {
          command: "pnpm dev --mode test --port 5174",
          url: "http://127.0.0.1:5174",
          reuseExistingServer: false,
          env: {
            VITE_APP_ENV: "test",
            VITE_TEST_PROJECT_REF: "wgolevihkvmosajumzvl",
            VITE_SUPABASE_URL: "https://wgolevihkvmosajumzvl.supabase.co",
            VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_mock_browser_test",
          },
        },
        {
          command: "pnpm preview",
          url: "http://127.0.0.1:4173",
          reuseExistingServer: false,
        },
      ]
    : undefined,
});
