import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { refuseProduction } from "./isolation";
// Production isolation: no run starts while any environment variable points at the production project. Every page
// also aborts requests to anything but the local site and the in-memory TEST stand-in (isolation.ts, mock-supabase.ts).
refuseProduction();
const shell = resolve(homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1181/chrome-mac/headless_shell");
const root = resolve(__dirname, "../../..");
export default defineConfig({
  testDir: __dirname,
  timeout: 90000,
  // A slow-connection run (SLOW_NET) adds up to a second and a half to every request, so the default five-second wait
  // for an assertion is the test's patience running out, not the app failing. Give the assertions room on those runs.
  expect: { timeout: process.env.SLOW_NET ? 30000 : 5000 },
  retries: 0,
  use: {
    actionTimeout: 15000, baseURL: "http://127.0.0.1:8790/", headless: true, screenshot: "only-on-failure", launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : existsSync(shell) ? { executablePath: shell } : {} },
  projects: [
    { name: "desktop", testIgnore: /tabs\//, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testIgnore: /tabs\//, use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
    // Generated per-tab suites: one signed-in page per file, a different seeded league per case.
    { name: "tabs", testMatch: /tabs\/.*\.spec\.ts/, testIgnore: /tabs\/phone\//, use: { ...devices["Desktop Chrome"] } },
    // The player-facing suites again on a phone screen (same leagues, iPhone 13 size, touch).
    { name: "tabs-phone", testMatch: /tabs\/phone\/.*\.spec\.ts/, use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: {
    command: `python3 -m http.server 8790 --bind 127.0.0.1 --directory "${root}"`,
    url: "http://127.0.0.1:8790/index.html",
    reuseExistingServer: true,
  },
  reporter: [["list"]],
});
