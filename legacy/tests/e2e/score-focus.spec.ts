// p72: a redraw of the score form keeps the cursor in the score being typed. Found by the ten-session season test
// failing now and then on GitHub ("Enter all 3 scores", Game 1's first box empty): an ordinary redraw of the same
// court and round replaced the input under the cursor, focus fell back to the page and the next keystrokes were lost.
import { test, expect } from "@playwright/test";
import { installMock, freshState, ORGANIZER } from "./mock-supabase";
import { signIn, unlockOrganizer } from "./helpers";

test.describe("score entry survives a redraw", () => {
  test("typing carries on in the same box after any redraw of the same court and round", async ({ page }) => {
    const state = freshState(); await installMock(page, state); page.on("dialog", (d) => d.accept());
    await page.goto("/"); await signIn(page, ORGANIZER); await unlockOrganizer(page);
    await page.evaluate(() => startSession()); await expect.poll(() => page.evaluate(() => S.current?.number)).toBe(1);
    await page.click("#bnav-scores"); await page.selectOption("#sc-sel", "1"); await expect(page.locator("#si_1_1_a")).toBeVisible();
    const redraws: [string, string][] = [
      ["a page redraw (renderAll)", "renderAll()"],
      ["a score-form redraw (renderScoreEntry)", "renderScoreEntry()"],
      ["the background sync's redraw", "(()=>{_isSyncing=true;try{renderAll();}finally{_isSyncing=false;}})()"],
    ];
    for (const [label, js] of redraws) for (const id of ["si_1_1_a", "si_1_2_b"]) {
      await page.evaluate(() => document.querySelectorAll<HTMLInputElement>("#score-area input.sinp").forEach((e) => { e.value = ""; }));
      await page.focus(`#${id}`); await page.keyboard.type("2");
      await page.evaluate((x) => { (0, eval)(x); }, js);
      await expect(page.locator(`#${id}`), `${label}: the cursor stays in ${id}`).toBeFocused();
      await page.keyboard.type("1");
      await expect(page.locator(`#${id}`), `${label}: typing carries on in ${id}`).toHaveValue("21");
    }
    // Another court or round is a different form: the cursor is not moved into it.
    await page.focus("#si_1_1_a");
    await page.selectOption("#sc-sel", "2");
    await expect(page.locator("#si_2_1_a")).toBeVisible();
    await expect(page.locator("#si_2_1_a"), "a different court's form does not take the cursor").not.toBeFocused();
  });
});
