// A court of two plays best of three: after a 2–0 there is no Game 3 (not shown, not saved, not required to finish the
// round); a split court plays Game 3. The database refuses a Game 3 after a 2–0 whichever order the games arrive in.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety, type League } from "./gen";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
type Kind = "two-nil-game-by-game" | "split-needs-game-3" | "save-all-with-game-3" | "save-all-two-nil" | "game-3-first" | "missing-list";
const KINDS: Kind[] = ["two-nil-game-by-game", "split-needs-game-3", "save-all-with-game-3", "save-all-two-nil", "game-3-first", "missing-list"];
for (let i = 0; i < 60; i++) {
  const kind = KINDS[i % KINDS.length], regulars = [6, 10, 14, 18, 22][i % 5];   // 4k+2 players seat a court of two last
  const opts = { ...variety(i + 170), regulars, spares: 0, pending: 0, declineRate: 0, absentRate: 0, benchRate: 0, live: "r1-partial" as const };
  test(`Best of three ${String(i + 1).padStart(3, "0")} · ${kind} · ${genLeague(48000 + i, opts).title}`, async () => {
    const L: League = genLeague(48000 + i, { ...opts, dates: ctx.dates });
    const cur = L.current!, cy = cur.cycle, a = cur.assignments;
    const two = [1, 2, 3, 4, 5, 6].find((c) => (a[c] || []).length === 2)!;
    expect(two, "the league seats a court of two").toBeTruthy();
    for (const k of Object.keys(cur.scores)) if (k.startsWith(`c${two}_y${cy}_`)) delete cur.scores[k];
    // Keep another court unfinished, so finishing this one does not end the round.
    const other = [1, 2, 3, 4, 5, 6].find((c) => c !== two && (a[c] || []).length >= 2)!;
    delete cur.scores[`c${other}_y${cy}_g1`];
    await load(ctx, L);
    const page = ctx.page, toast = page.locator("#_t"), [A, B] = a[two];
    const kv = () => JSON.parse(ctx.state.state["current_session"].value);
    const name = (id: number) => L.players.find((p) => p.id === id)!.name;
    const keys = () => Object.keys(kv().scores).filter((k) => k.startsWith(`c${two}_y${cy}_`)).sort();
    if (kind === "missing-list") {
      cur.scores[`c${two}_y${cy}_g1`] = { a1: A, a2: null, b1: B, b2: null, sA: 21, sB: 9, w: "A" }; cur.scores[`c${two}_y${cy}_g2`] = { a1: A, a2: null, b1: B, b2: null, sA: 21, sB: 11, w: "A" };
      await load(ctx, L);
      await page.evaluate(() => nav("admin")); await page.getByRole("button", { name: "📅 Session" }).click();
      await page.locator("#sess-ui").getByRole("button", { name: "⏭ Next Round (Rotate)" }).click();
      await expect(toast).toHaveText(/^Cannot advance — \d+ scores missing: /);
      const t = norm(await toast.innerText());
      expect(t).toMatch(/^Cannot advance — \d+ scores missing: /);
      expect(t, "a court of two that won 2–0 is not missing a Game 3").not.toContain(`C${two}G3`);
      expect(t).toContain(`C${other}G1`);
      return;
    }
    await page.evaluate(() => nav("scores"));
    await page.locator("#sc-sel").selectOption(String(two));
    const area = page.locator("#score-area");
    await expect(area.locator(".alert").first()).toHaveText(`Court ${two} · Round ${cy} · 2 Players — Singles Best of 3`);
    const fill = async (g: number, x: string, y: string) => { await page.locator(`#si_${two}_${g}_a`).fill(x); await page.locator(`#si_${two}_${g}_b`).fill(y); };
    const saveGame = async (g: number) => page.locator(".game-block").nth(g - 1).getByRole("button", { name: `💾 Save Game ${g}` }).click();
    if (kind === "two-nil-game-by-game") {
      await fill(1, "21", String(5 + (i % 10))); await saveGame(1); await expect(toast).toHaveText("Game 1 saved!");
      await fill(2, "21", String(8 + (i % 10))); await saveGame(2); await expect(toast).toHaveText("Game 2 saved!");
      await expect(page.locator(`#skip_${two}_3 .glabel`)).toHaveText("Game 3 not needed");
      await expect(page.locator(`#skip_${two}_3 > div`).last()).toHaveText(`${name(A)} won the first two games — best of three, so there is no Game 3.`);
      await expect(page.locator(`#si_${two}_3_a`)).toHaveCount(0);
      await expect(area).toContainText(`✅ Court ${two} done — waiting for other courts to finish Round ${cy}`);
      await expect(page.locator(`#res-${two}`)).toContainText("2W · 0L"); await expect(page.locator(`#res-${two}`)).toContainText("0W · 2L");
      const r = await page.evaluate(async (c) => { try { await saveGameScore(c, 3); return "saved"; } catch (e) { return String(e); } }, two);
      expect(r).toBe("saved"); await expect(toast).toHaveText("Best of three: there is no Game 3 once one player has won the first two games.");
      expect(keys()).toEqual([`c${two}_y${cy}_g1`, `c${two}_y${cy}_g2`]);
      return;
    }
    if (kind === "split-needs-game-3") {
      await fill(1, "21", "12"); await fill(2, "14", "21");
      await area.getByRole("button", { name: `💾 Save All Court ${two} Scores` }).click();
      await expect(toast).toHaveText("Enter all 3 scores");
      expect(keys(), "nothing saved without Game 3").toEqual([]);
      await fill(3, "21", "19"); await area.getByRole("button", { name: `💾 Save All Court ${two} Scores` }).click();
      await expect(toast).toHaveText(`Court ${two} saved!`);
      expect(keys()).toEqual([1, 2, 3].map((g) => `c${two}_y${cy}_g${g}`));
      await expect(page.locator(`#res-${two}`)).toContainText("2W · 1L"); await expect(page.locator(`#res-${two}`)).toContainText("1W · 2L");
      return;
    }
    if (kind === "save-all-with-game-3") {
      await fill(1, "21", "3"); await fill(2, "21", "4"); await fill(3, "21", "5");
      await area.getByRole("button", { name: `💾 Save All Court ${two} Scores` }).click();
      await expect(toast).toHaveText("Best of three: there is no Game 3 once one player has won the first two games. Clear Game 3 and save again.");
      expect(keys(), "nothing saved").toEqual([]);
      return;
    }
    if (kind === "save-all-two-nil") {
      await fill(1, "4", "21"); await fill(2, "6", "21");
      await area.getByRole("button", { name: `💾 Save All Court ${two} Scores` }).click();
      await expect(toast).toHaveText(`Court ${two} saved!`);
      expect(keys()).toEqual([`c${two}_y${cy}_g1`, `c${two}_y${cy}_g2`]);
      expect(kv().scores[`c${two}_y${cy}_g2`]).toEqual({ a1: A, a2: null, b1: B, b2: null, sA: 6, sB: 21, w: "B" });
      await expect(page.locator(`#skip_${two}_3`)).toContainText(`${name(B)} won the first two games`);
      return;
    }
    if (kind === "game-3-first") {
      await fill(3, "21", "17"); await saveGame(3); await expect(toast).toHaveText("Game 3 saved!");
      await fill(1, "21", "10"); await saveGame(1); await expect(toast).toHaveText("Game 1 saved!");
      await fill(2, "21", "11"); await saveGame(2);
      await expect(toast).toHaveText("Game 2 saved!");
      expect(keys(), "the corrected 2–0 removes the old deciding game").toEqual([`c${two}_y${cy}_g1`, `c${two}_y${cy}_g2`]);
      await fill(2, "15", "21"); await saveGame(2); await expect(toast).toHaveText("Game 2 saved!");
      expect(keys(), "a new split needs a fresh deciding score").toEqual([`c${two}_y${cy}_g1`, `c${two}_y${cy}_g2`]);
      await fill(3,"21","17");await saveGame(3);await expect(toast).toHaveText("Game 3 saved!");
      expect(keys()).toEqual([1,2,3].map(g=>`c${two}_y${cy}_g${g}`));
    }
  });
}
