// p77, from the organizer: "Sam MacDonald SPARE (absent) why does sam shown as absent, he was playing as spare, when
// Ivanka Xie backed out at the last moment, I called in sam". A spare called in once the night is under way has no
// ladder court until End Session writes one, and both lists judged "absent" from that column alone. Playing tonight
// must count as playing, in Leaders and in Rankings alike.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

for (let i = 0; i < 4; i++) {
  test(`Called-in spare ${String(i + 1).padStart(3, "0")} · a spare on a court tonight is not shown as absent`, async () => {
    const opts: GenOpts = { ...variety(i + 960), regulars: 12 + i * 2, spares: 1, pending: 0, live: i % 2 ? "complete" : "r2-partial", sessions: i % 2 };
    const L: League = genLeague(58000 + i, { ...opts, dates: ctx.dates });
    test.skip(!L.current, "needs a live session");
    // Somebody seated tonight, with no ladder court — exactly a spare called in mid-session.
    const court = [1, 2, 3, 4, 5, 6].find((c) => (L.current!.assignments[c] || []).length > 0)!;
    const id = L.current!.assignments[court][0];
    const player = L.players.find((p) => p.id === id)!;
    player.current_court = 0;
    player.membership_type = "spare";
    await load(ctx, L);
    const page = ctx.page;

    for (const [tab, sec] of [["rank", "#sec-rank"], ["lb", "#sec-lb"]] as const) {
      await page.evaluate((t) => { nav("standings"); showSec("standings", t); }, tab);
      const row = page.locator(`${sec} .lbrow`).filter({ hasText: player.name.split(" ")[0] }).first();
      await expect(row, `${sec}: the called-in spare is listed`).toHaveCount(1);
      const text = (await row.innerText()).replace(/\s+/g, " ");
      expect(text, `${sec}: not marked absent while playing tonight`).not.toContain("(absent)");
      expect(text, `${sec}: shows the court they are playing`).toContain(`Court ${court}`);
    }
  });
}

test("Rankings · the tab explains how a rating moves, and that the court does not change it (p78)", async () => {
  const L = genLeague(58100, { ...variety(11), regulars: 14, spares: 1, pending: 0, live: "complete", sessions: 1, dates: ctx.dates } as GenOpts & { dates: unknown } as GenOpts);
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => { nav("standings"); showSec("standings", "rank"); });
  const sec = page.locator("#sec-rank");
  await expect(sec, "where ratings start").toContainText("Everyone starts from the court they first played on this season");
  await expect(sec, "per round, not per game").toContainText("Your rating moves once a round, not once a game");
  await expect(sec, "the formula").toContainText("new rating = old + 32 ×");
  await expect(sec, "the everyday figures").toContainText("+16");
  await expect(sec, "the court is not the point").toContainText("The court you play on does not change the maths");
  await expect(sec, "the score in points is not part of it").toContainText("the score in points does not");
});
