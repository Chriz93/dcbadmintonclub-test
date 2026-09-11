// Admin shell and navigation: the bottom bar (every page), the eight admin tabs in any order (exactly one section at a
// time), the court detail popup from the gym view, and locking the organizer panel on this device — it stays locked
// until the authenticator code is entered again. 100 leagues.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng } from "./gen";
import { upcoming } from "./oracle";
import { unlockOrganizer } from "../helpers";

const PAGES = ["home", "register", "courts", "scores", "standings", "schedule", "admin"];
const TABS: [RegExp, string][] = [[/^👥 Players$/, "a-pl"], [/^📋 Registered/, "a-reg"], [/^📅 Session$/, "a-sess"], [/^📋 Attendance$/, "a-att"], [/^🏟️ Assign$/, "a-assign"], [/^💰 Pay$/, "a-pay"], [/^📣 Announce$/, "a-ann"], [/^🛠 Tools$/, "a-tools"]];
let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
for (let i = 0; i < 100; i++) {
  const opts = { ...variety(i + 14), ...(i % 5 === 1 ? { regulars: 26, declineRate: 0, absentRate: 0 } : {}) };
  test(`Admin ${String(i + 1).padStart(3, "0")} · ${genLeague(24000 + i, opts).title}`, async () => {
    const L = genLeague(24000 + i, { ...opts, dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page, r = rng(190 + i), shuffle = <T,>(a: T[]) => [...a].sort(() => r() - 0.5);
    for (const p of PAGES) await expect(page.locator(`#bnav-${p}`), `bottom bar: ${p}`).toBeVisible();
    for (const p of shuffle(PAGES).slice(0, 4)) {
      await page.locator(`#bnav-${p}`).click();
      await expect(page.locator(".page.active")).toHaveCount(1);
      await expect(page.locator(`#page-${p}`)).toHaveClass(/active/);
      await expect(page.locator(".bnav-btn.active")).toHaveCount(1);
      await expect(page.locator(`#bnav-${p}`)).toHaveClass(/active/);
    }
    await page.locator("#bnav-admin").click();
    for (const [label, id] of shuffle(TABS)) {
      await page.locator("#admin-panel .ptab").filter({ hasText: label }).click();
      await expect(page.locator("#admin-panel .section.active"), `${id}: one section`).toHaveCount(1);
      await expect(page.locator(`#sec-${id}`)).toBeVisible();
      await expect(page.locator("#admin-panel .ptab.active")).toHaveText(label);
    }
    // Court detail from the gym view: same players as the card, every one of them.
    const c = 1 + (i % 6), a = L.current ? L.current.assignments : upcoming(L).assign, ids = a[c] || [];
    await page.locator("#bnav-courts").click();
    if (L.players.length) {
      await page.locator(`#court-gym-view .gym-court[onclick="showCourtDetail(${c})"]`).click();
      const medals = !L.current || !!L.current.completed;
      await expect(page.locator("#modal-title")).toHaveText(`Court ${c} — ${medals ? (c === 1 ? "🥇 Top Court" : c === 2 ? "🥈 2nd Court" : c === 3 ? "🥉 3rd Court" : `Court ${c}`) : `Court ${c}`}`);
      const tiles = (await page.locator("#modal-body div[style*='grid-template-columns:1fr 1fr'] > div").allInnerTexts()).map(norm);
      expect(tiles, `Court ${c} detail`).toEqual([...Array(Math.max(4, ids.length)).keys()].map((k) => { const p = L.players.find((x) => x.id === ids[k]); return p ? `Player ${k + 1} ${p.name} ${p.season_wins}W · ${p.season_losses}L` : `Player ${k + 1} Empty`; }));
      await expect(page.locator("#modal-body .alert")).toHaveCount(L.current ? 1 : 0);
      await expect(page.locator("#modal-body").getByRole("button", { name: "+ Add Player to Court" })).toBeVisible();
      await page.evaluate(() => closeModal());
    }
    if (i % 10 === 9) {
      await page.locator("#bnav-admin").click();
      await page.getByRole("button", { name: "🔒 Lock" }).click();
      await expect(page.locator("#admin-panel")).toBeHidden();
      await expect(page.locator("#admin-lock")).toBeVisible();
      await page.locator("#bnav-home").click();
      await page.locator("#bnav-admin").click();
      await expect(page.locator("#admin-lock-msg"), "still locked: the code is asked for again").toContainText(/authenticator|Enter the 6-digit/i);
      await expect(page.locator("#admin-panel")).toBeHidden();
      expect(await page.evaluate(() => adminUnlocked), "organizer tools stay off after a re-render").toBe(false);
      await page.locator("#bnav-home").click();
      await unlockOrganizer(page);
      expect(await page.evaluate(() => adminUnlocked)).toBe(true);
    }
  });
}
