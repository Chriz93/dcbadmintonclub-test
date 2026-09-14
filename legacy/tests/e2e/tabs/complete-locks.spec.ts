// Once both rounds are finished (before End Session), controls that would change tonight's courts are shown disabled,
// with the reason (p62): the Assign tab's Move selectors and the Court selectors on Players and Registered. Call In is
// not shown at all during a session (p68: players are set before the session starts).
// Found by the button census: they were offered and only answered "Start an unfinished session first". During play the
// same controls stay usable.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety } from "./gen";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

const REASON = "Both rounds are finished. End the session to save the final courts, then change courts.";
const CONTROLS = [["a-assign", "select[aria-label^='Move ']"], ["a-pl", "select[aria-label^='Court for ']"], ["a-reg", "select[aria-label^='Court for ']"]] as const;

for (let i = 0; i < 6; i++) {
  for (const live of ["complete", "r1-partial"] as const) {
    test(`Court controls ${String(i + 1).padStart(2, "0")} · ${live === "complete" ? "both rounds finished: shown disabled with the reason" : "during play: usable"}`, async () => {
      const L = genLeague(54000 + i, { ...variety(54000 + i), regulars: 12 + i * 2, spares: 2, pending: 1, live, sessions: 1 + (i % 3), dates: ctx.dates });
      await load(ctx, L);
      const page = ctx.page;
      let seen = 0;
      for (const [sec, sel] of CONTROLS) {
        await page.evaluate((s) => { nav("admin"); showSec("admin", s); }, sec);
        const els = page.locator(`#sec-${sec} ${sel}`), n = await els.count();
        seen += n;
        for (let k = 0; k < Math.min(n, 4); k++) {
          if (live === "complete") { await expect(els.nth(k), `${sec}: ${sel}`).toBeDisabled(); await expect(els.nth(k)).toHaveAttribute("title", REASON); }
          else await expect(els.nth(k), `${sec}: ${sel}`).toBeEnabled();
        }
      }
      expect(seen, "the league shows some of these controls").toBeGreaterThan(0);
      // p68: during a session (both rounds finished or not) nobody is called in: Call In is not shown at all.
      await expect(page.locator("#sec-a-pl button[onclick^='callInSpare']"), "no Call In during a session").toHaveCount(0);
    });
  }
}
