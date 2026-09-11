import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
const shell = resolve(homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1181/chrome-mac/headless_shell");
const root = resolve(__dirname, "../../..");
export default defineConfig({
  testDir: __dirname,
  timeout: 90000,
  retries: 0,
  use: {
    actionTimeout: 15000, baseURL: "http://127.0.0.1:8790/", headless: true, screenshot: "only-on-failure", launchOptions: existsSync(shell) ? { executablePath: shell } : {} },
  projects: [
    { name: "desktop", testIgnore: /tabs\//, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testIgnore: /tabs\//, use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
    // Generated per-tab suites: one signed-in page per file, a different seeded league per case.
    { name: "tabs", testMatch: /tabs\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `python3 -m http.server 8790 --bind 127.0.0.1 --directory "${root}"`,
    url: "http://127.0.0.1:8790/index.html",
    reuseExistingServer: true,
  },
  reporter: [["list"]],
});
