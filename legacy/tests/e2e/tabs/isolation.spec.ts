// Production isolation in the browser: the site refuses a database that contradicts where it is served from, the test
// harness stops every request to production, another project or the live sites, and a whole organizer evening talks to
// nothing but the in-memory TEST stand-in.
import { test, expect, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import { resolve } from "node:path";
import { installMock, freshState, SB, type MockState } from "../mock-supabase";
import { refuseProduction, isForbidden, PROD_REF, TEST_REF } from "../isolation";
import { signIn, unlockOrganizer } from "../helpers";
const INVITED = "christygeorge993+regular@gmail.com";   // invited in freshState

const PROD = `https://${PROD_REF}.supabase.co`;
const INDEX = fs.readFileSync(resolve(__dirname, "../../../../index.html"), "utf8");
const STOP = "#env-stop";
async function fresh(browser: Browser, tweak: (s: MockState) => void = () => {}) {
  const page = await browser.newPage(), s = freshState(); tweak(s);
  const seen: string[] = []; page.on("request", (r) => seen.push(r.url()));
  await installMock(page, s);
  return { page, s, seen };
}
const serve = (page: Page, url: string, body: string) => page.route(url, (r) => r.fulfill({ status: 200, contentType: "text/html", body }));

test.describe("isolation · the site checks its database", () => {
  test("Isolation · a database marked test: the test site loads", async ({ browser }) => {
    const { page, s } = await fresh(browser);
    await page.goto("/"); await expect(page.locator("#invite-gate")).toBeVisible(); await expect(page.locator(STOP)).toHaveCount(0);
    expect(s.blocked).toEqual([]); await page.close();
  });
  test("Isolation · a database marked production: the test site stops before loading anything", async ({ browser }) => {
    const { page, s } = await fresh(browser, (x) => (x.environment = { name: "production", schema_version: "L20" }));
    await page.goto("/"); await expect(page.locator("#invite-gate"), "nothing is read before sign-in").toBeVisible();
    await signIn(page, INVITED);
    await expect(page.locator(STOP)).toContainText("This build cannot connect safely");
    await expect(page.locator(STOP)).toContainText("The test site is connected to a database marked “production”.");
    await expect(page.locator(STOP)).toContainText("Nothing was loaded or saved.");
    expect(s.requests.filter((r) => r.includes("/rest/v1/")), "no league data was read").toEqual([]); await page.close();
  });
  test("Isolation · an unmarked database: the test site stops", async ({ browser }) => {
    const { page, s } = await fresh(browser, (x) => (x.environment = null));
    await page.goto("/"); await signIn(page, INVITED); await expect(page.locator(STOP)).toContainText("The test database is not marked as TEST.");
    expect(s.requests.filter((r) => r.includes("/rest/v1/"))).toEqual([]); await page.close();
  });
  test("Isolation · a database without the marker table: the test site stops", async ({ browser }) => {
    const { page, s } = await fresh(browser);
    await page.route(`${SB}/rest/v1/environment**`, (r) => r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "PGRST205", message: "Could not find the table" }) }));
    await page.goto("/"); await signIn(page, INVITED); await expect(page.locator(STOP)).toContainText("The test database is not marked as TEST.");
    expect(s.requests.filter((r) => r.includes("/rest/v1/"))).toEqual([]); await page.close();
  });
  for (const [label, status, type, body] of [["a server error (500)", 500, "application/json", JSON.stringify({ message: "internal error" })], ["access refused (403)", 403, "application/json", JSON.stringify({ message: "permission denied", code: "42501" })],
    ["an empty marker table", 200, "application/json", "[]"], ["a reply that is not JSON", 200, "text/html", "<html>gateway</html>"]] as const)
    test(`Isolation · the marker check gets ${label}: the test site stops`, async ({ browser }) => {
      const { page, s } = await fresh(browser);
      await page.route(`${SB}/rest/v1/environment**`, (r) => r.fulfill({ status, contentType: type, body }));
      await page.goto("/"); await signIn(page, INVITED); await expect(page.locator(STOP)).toContainText("The test database is not marked as TEST.");
      expect(s.requests.filter((r) => r.includes("/rest/v1/")), "no league data was read").toEqual([]); await page.close();
    });
  test("Isolation · a database marked test at a current schema version (L24): the test site loads", async ({ browser }) => {
    const { page, s } = await fresh(browser, (x) => (x.environment = { name: "test", schema_version: "L24" }));
    await page.goto("/"); await signIn(page, INVITED); await expect(page.locator("#page-home")).toBeVisible(); await expect(page.locator(STOP)).toHaveCount(0);
    expect(s.blocked).toEqual([]); await page.close();
  });
  test("Isolation · the marker is not readable before sign-in (anonymous visitors read nothing)", async ({ browser }) => {
    const { page } = await fresh(browser);
    await page.goto("/");
    const r = await page.evaluate(async (u) => (await fetch(`${u}/rest/v1/environment?select=name`, { headers: { apikey: "publishable" } })).status, SB);
    expect(r).toBe(401); await page.close();
  });
  test("Isolation · the marker check can't reach the database: the site carries on and the usual error handling applies", async ({ browser }) => {
    const { page } = await fresh(browser);
    await page.route(`${SB}/rest/v1/environment**`, (r) => r.abort("failed"));
    await page.goto("/"); await signIn(page, INVITED); await expect(page.locator(STOP)).toHaveCount(0); await expect(page.locator("#page-home")).toBeVisible(); await page.close();
  });
  test("Isolation · a test site built against the production database stops without contacting it", async ({ browser }) => {
    const { page, s, seen } = await fresh(browser);
    await serve(page, "http://127.0.0.1:8790/", INDEX.replace(`const SB='https://${TEST_REF}.supabase.co'; // TEST project only`, `const SB='${PROD}';`));
    await page.goto("/"); await expect(page.locator(STOP)).toContainText("The test site points at the production database.");
    expect(seen.filter((u) => u.includes("supabase.co")), "no database request at all").toEqual([]); expect(s.blocked).toEqual([]); await page.close();
  });
  test("Isolation · the league-site address with the TEST database stops", async ({ browser }) => {
    const { page, seen } = await fresh(browser);
    await serve(page, "http://127.0.0.1:8790/dcbadmintonclub/", INDEX);
    await page.goto("/dcbadmintonclub/"); await expect(page.locator(STOP)).toContainText("The league site points at a database that is not the league database.");
    expect(seen.filter((u) => u.includes("supabase.co"))).toEqual([]); await page.close();
  });
  test("Isolation · the league-site address, run in a test, never reaches production: every request is stopped", async ({ browser }) => {
    const { page, s } = await fresh(browser);
    const answered: string[] = []; page.on("response", (r) => { if (r.url().includes(PROD_REF)) answered.push(r.url()); });
    await serve(page, "http://127.0.0.1:8790/dcbadmintonclub/", INDEX.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "").replace(`const SB='https://${TEST_REF}.supabase.co'; // TEST project only`, `const SB='${PROD}';`));
    await page.goto("/dcbadmintonclub/");
    // Signed out, the site reads nothing; asking for a sign-in code is the first request to the database it points at.
    await page.locator("#signin-email-input").fill(INVITED); await page.locator("#signin-btn").click();
    await expect(page.locator("#invite-err")).not.toBeEmpty();
    expect(s.blocked!.length, "the attempt was recorded").toBeGreaterThan(0);
    expect(s.blocked!.some((u) => u.includes("/auth/v1/"))).toBe(true);
    expect(s.blocked!.every((u) => u.includes(PROD_REF))).toBe(true);
    expect(answered, "production answered nothing").toEqual([]); await page.close();
  });
});

test.describe("isolation · the harness", () => {
  let page: Page, s: MockState;
  test.beforeAll(async ({ browser }) => { ({ page, s } = await fresh(browser)); await serve(page,"http://127.0.0.1:8790/",INDEX.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,"")); await page.goto("/"); });
  test.afterAll(async () => { await page.close(); });
  for (const [label, url] of [["production", `${PROD}/rest/v1/players?select=*`], ["another Supabase project", "https://abcdefghijklmnopqrst.supabase.co/rest/v1/"], ["the live league site", "https://chriz93.github.io/dcbadmintonclub/"], ["the live test site", "https://chriz93.github.io/dcbadmintonclub-test/"], ["the Supabase dashboard", "https://supabase.com/dashboard/project/" + PROD_REF]] as const)
    test(`Isolation · a request from the page to ${label} is stopped and recorded`, async () => {
      const n = s.blocked!.length;
      const r = await page.evaluate(async (u) => { try { await fetch(u); return "reached"; } catch { return "stopped"; } }, url);
      expect(r).toBe("stopped"); expect(s.blocked!.slice(n).some((x) => x.includes(url.slice(0, 30)))).toBe(true);
    });
  test("Isolation · the TEST project's address is answered by the stand-in, never the network", async () => {
    const n = s.requests.length;
    const r = await page.evaluate(async (u) => (await fetch(`${u}/rest/v1/announcements?select=*`)).status, SB);
    expect(r).toBe(401); expect(s.requests.length).toBe(n + 1);
  });
  test("Isolation · a run refuses to start when a setting names production, and lists the settings", async () => {
    expect(() => refuseProduction({ SUPABASE_URL: PROD, OTHER: "x", KEY_FILE: `/tmp/${PROD_REF}.json` })).toThrow("Refusing to run tests: KEY_FILE, SUPABASE_URL point at the production project");
  });
  test("Isolation · a clean environment is accepted", async () => { expect(() => refuseProduction({ SUPABASE_URL: `https://${TEST_REF}.supabase.co`, PATH: "/usr/bin" })).not.toThrow(); });
  test("Isolation · what counts as off limits", async () => {
    expect([`${PROD}/x`, "https://zzz.supabase.co/", "https://supabase.com/", "https://x.github.io/", `http://127.0.0.1:8790/?${PROD_REF}`].map(isForbidden)).toEqual([true, true, true, true, true]);
    expect([`https://${TEST_REF}.supabase.co/rest/v1/`, "http://127.0.0.1:8790/index.html", "https://fonts.googleapis.com/css2", "not a url"].map(isForbidden)).toEqual([false, false, false, false]);
  });
});

test("Isolation · a whole organizer evening talks only to the TEST stand-in", async ({ browser }) => {
  const { page, s, seen } = await fresh(browser);
  page.on("dialog", (d) => d.accept());
  await page.goto("/"); await signIn(page, "christygeorge993@gmail.com"); await unlockOrganizer(page);
  await page.evaluate(async () => { await startSession(); });
  const id = await page.evaluate(() => S.current.assignments[1][0]);
  await page.evaluate((x) => markAttForTab(x, "absent"), id);
  await page.evaluate(async () => { await previewAdjust(); await applyCourtAdjust(); });
  await expect.poll(() => page.evaluate((x) => Object.values(S.current.assignments).flat().includes(x), id)).toBe(false);
  const db = seen.filter((u) => u.includes("supabase"));
  expect(db.length).toBeGreaterThan(5);
  expect(db.every((u) => u.startsWith(SB)), "every database request went to the TEST address").toBe(true);
  expect(seen.some((u) => u.includes(PROD_REF)), "nothing named production").toBe(false);
  expect(s.blocked).toEqual([]); await page.close();
});
