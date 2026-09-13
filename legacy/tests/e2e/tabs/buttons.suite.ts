// Every usable control, clicked where it appears, in every recorded league state (census.ts). A control must do
// something — save, open a dialog, change the view, download or share, show a message, or visibly change the page —
// and must not throw a script error or answer only that it is "not available" while it is offered. The first test of
// each state fails when the page shows a control the census does not list (rerun census-discover.spec.ts).
import { test, expect, type Browser, type Page, type Download } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety } from "./gen";
import { STATES, VIEWS, PLAYER_EMAIL, pageControls, pageSnapshot, installStubs, UNAVAILABLE, type Entry } from "./census";

const writes = (ctx: Ctx) => ctx.state.requests.filter((r) => !r.startsWith("GET ")).length;

/** Records the census for this project when CENSUS_WRITE=1 (otherwise skipped):
 *  CENSUS_WRITE=1 pnpm exec playwright test -c ../legacy/tests/e2e/playwright.config.ts census-discover --project=tabs --project=tabs-phone */
export function defineDiscover() {
  test("census · record every usable control on every page and tab, in every state", async ({ browser }) => {
    test.skip(process.env.CENSUS_WRITE !== "1", "set CENSUS_WRITE=1 to rewrite the census");
    test.setTimeout(900000);
    const project = test.info().project.name, out: Entry[] = [];
    for (const st of STATES) {
      const ctx = await openAs(browser, st.role === "organizer" ? "admin" : PLAYER_EMAIL);
      try {
        await load(ctx, genLeague(st.seed, { ...variety(st.seed), ...st.opts, dates: ctx.dates }));
        for (const v of VIEWS.filter((x) => x.roles.includes(st.role))) {
          await ctx.page.evaluate(() => { try { closeModal(); } catch { /* none open */ } });
          await v.open(ctx.page);
          await ctx.page.waitForTimeout(150);
          for (const c of await ctx.page.evaluate(pageControls, { scope: v.scope, exclude: v.exclude })) out.push({ state: st.id, view: v.id, ...c });
        }
      } finally { await closeCtx(ctx); }
    }
    out.sort((a, b) => a.state.localeCompare(b.state) || a.view.localeCompare(b.view) || a.key.localeCompare(b.key));
    fs.writeFileSync(path.join(__dirname, `button-census-${project}.json`), JSON.stringify(out, null, 1) + "\n");
    console.log(`census (${project}): ${out.length} controls`);
  });
}

export function defineButtons(project: "tabs" | "tabs-phone") {
  const file = path.join(__dirname, `button-census-${project}.json`);
  if (!fs.existsSync(file)) {
    test(`Buttons · the census for ${project} is recorded`, () => { throw new Error(`${path.basename(file)} is missing: run census-discover.spec.ts with CENSUS_WRITE=1`); });
    return;
  }
  const census = JSON.parse(fs.readFileSync(file, "utf8")) as Entry[];
  for (const st of STATES) {
    const entries = census.filter((e) => e.state === st.id);
    test.describe(`Buttons · ${st.id}`, () => {
      let ctx: Ctx | undefined;
      const fresh = async (browser: Browser) => { if (ctx) await closeCtx(ctx).catch(() => {}); ctx = await openAs(browser, st.role === "organizer" ? "admin" : PLAYER_EMAIL); };
      const league = () => genLeague(st.seed, { ...variety(st.seed), ...st.opts, dates: ctx!.dates });
      /** Signed in (and, for the organizer, unlocked) with this state's league loaded. */
      const ready = async (browser: Browser) => {
        const ok = ctx ? await ctx.page.evaluate((org) => !!_session && (!org || adminUnlocked), st.role === "organizer").catch(() => false) : false;
        if (!ok) await fresh(browser);
        await load(ctx!, league());
        // View choices an earlier case made on this page start from the default again: the Courts map, through the
        // page's own "Gym View" toggle (it sets the choice, the highlight and which view is shown).
        await ctx!.page.evaluate(() => { const b = document.querySelector<HTMLElement>(".vt-btn[onclick^=\"setView('gym'\"]"); if (b) setView("gym", b); });
        await ctx!.page.evaluate(installStubs);
        return ctx!.page;
      };
      test.beforeAll(async ({ browser }) => { await fresh(browser); });
      test.afterAll(async () => { if (ctx) await closeCtx(ctx); });

      test(`Buttons · ${st.id} · the census lists every control the page shows`, async ({ browser }) => {
        const page = await ready(browser), missing: string[] = [];
        for (const v of VIEWS.filter((x) => x.roles.includes(st.role))) {
          await page.evaluate(() => { try { closeModal(); } catch { /* none open */ } });
          await v.open(page);
          await page.waitForTimeout(150);
          const known = new Set(entries.filter((e) => e.view === v.id).map((e) => e.key));
          for (const c of await page.evaluate(pageControls, { scope: v.scope, exclude: v.exclude })) if (!known.has(c.key)) missing.push(`${v.id}: ${c.label || c.key}`);
        }
        expect(missing, "controls without a test (rerun census-discover.spec.ts with CENSUS_WRITE=1)").toEqual([]);
      });

      entries.forEach((e, k) => {
        test(`Button · ${st.id} · ${e.view} · ${(e.label || e.key).slice(0, 60)} #${k + 1}`, async ({ browser }) => {
          const page: Page = await ready(browser), v = VIEWS.find((x) => x.id === e.view)!;
          const errors: string[] = [], popups: string[] = [], downloads: string[] = [];
          const onErr = (err: Error) => errors.push(err.message), onDl = (d: Download) => downloads.push(d.suggestedFilename());
          const onPopup = (p: Page) => { popups.push(p.url()); p.close().catch(() => {}); };
          page.on("pageerror", onErr); page.on("download", onDl); page.context().on("page", onPopup);
          try {
            await v.open(page);
            // Some controls are drawn a moment after the view opens: wait for this one (up to two seconds).
            let shown: { key: string }[] = [];
            for (let t = 0; t < 20; t++) {
              shown = await page.evaluate(pageControls, { scope: v.scope, exclude: v.exclude, markKey: e.key });
              if (shown.some((c) => c.key === e.key)) break;
              await page.waitForTimeout(100);
            }
            expect(shown.map((c) => c.key), `shown in ${e.view}`).toContain(e.key);
            const target = page.locator("[data-census-target]");
            const before = await page.evaluate(pageSnapshot, v.scope), w0 = writes(ctx!);
            if (e.tag === "select") {
              const values = await target.evaluate((s) => [...(s as HTMLSelectElement).options].map((o) => o.value)), cur = await target.inputValue();
              const next = values.find((x) => x !== cur);
              expect(next, "the list offers another choice").not.toBeUndefined();
              await target.selectOption(next!);
            } else {
              ctx!.prompts.length = 0; ctx!.prompts.push("Answer from the button check");   // a control that asks for text gets some
              await target.click({ timeout: 5000 });
            }
            let after = before, effect = "";
            for (let t = 0; t < 40 && !effect; t++) {
              await page.waitForTimeout(100);
              after = await page.evaluate(pageSnapshot, v.scope);
              effect = writes(ctx!) > w0 ? "save"
                : after.modal !== before.modal || after.modalTitle !== before.modalTitle ? "dialog"
                : after.page !== before.page || after.secs !== before.secs || after.hash !== before.hash ? "view"
                : after.calls > before.calls || popups.length || downloads.length ? "download or share"
                : after.toastRaw && after.toastRaw !== before.toastRaw ? "message"
                : after.dom !== before.dom ? "change"
                : after.scroll !== before.scroll || after.focus !== before.focus ? "scroll or focus" : "";
            }
            await page.waitForTimeout(150);
            after = await page.evaluate(pageSnapshot, v.scope);
            expect(errors, "no script error").toEqual([]);
            expect(effect, `"${e.label || e.key}" does something`).not.toBe("");
            if (after.toastRaw && after.toastRaw !== before.toastRaw) expect(after.toastRaw, "an offered control is not answered only with 'not available'").not.toMatch(UNAVAILABLE);
          } finally {
            page.off("pageerror", onErr); page.off("download", onDl); page.context().off("page", onPopup);
            if (ctx) ctx.prompts.length = 0;
            await page.evaluate(() => { try { closeModal(); } catch { /* none open */ } }).catch(() => {});
          }
        });
      });
    });
  }
}
