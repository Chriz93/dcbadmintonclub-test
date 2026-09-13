// Home → My season (a player's own card): record and win rate, Elo and rank, court now, sessions played, streak, the path
// through the courts, the fee line (which follows the payment the player declared), and the share image. 100 leagues.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety } from "./gen";
import { rankings, streaks, lbPlayers, courtOf, spareBalance } from "./oracle";

const PLAYER = "my.season@example.invalid";
let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser, PLAYER); });
test.afterAll(async () => { await closeCtx(ctx); });
for (let i = 0; i < 100; i++) {
  const spare = i % 4 === 3, base = variety(i + 15);
  const opts = { ...base, regulars: Math.max(6, base.regulars ?? 6), viewerEmail: PLAYER, viewerKind: spare ? ("spare" as const) : ("regular" as const), spares: spare ? Math.max(1, base.spares ?? 1) : base.spares, pending: 0, sessions: i % 9 };
  test(`My season ${String(i + 1).padStart(3, "0")} · ${spare ? "spare" : "regular"} · ${genLeague(25000 + i, opts).title}`, async () => {
    const L = genLeague(25000 + i, { ...opts, dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page, me = L.players[0], card = page.locator("#my-season-card");
    expect(me.email).toBe(PLAYER);
    await page.evaluate(() => nav("home"));
    if (!me.approved || (me.games_played === 0 && !L.sessions.length)) { await expect(card, "no card before a first game").toHaveCount(0); return; }
    const { elo, rows } = rankings(L), rank = rows.findIndex((r) => r.id === me.id) + 1;
    const played = L.sessions.filter((s) => Object.values(s.scores).some((sc) => [sc.a1, sc.a2, sc.b1, sc.b2].includes(me.id))).length;
    const wr = me.games_played > 0 ? Math.round((me.season_wins / me.games_played) * 100) : 0;
    const streak = streaks(L)[me.id].streak, courts = L.sessions.map((s) => courtOf(s.finalAssignments || s.assignments, me.id) || null);
    const mine = L.payments.filter((x) => x.player_id === me.id), sum = (k: string[]) => mine.filter((x) => k.includes(x.kind)).reduce((n, x) => n + Number(x.amount), 0);
    let fee: string;
    if (spare) { const {owed,paid,due}=spareBalance(L,me.id); fee = owed ? `Spare fees: $${paid} paid${due ? `, $${due} owing` : ""}` : "Spare fees: none yet"; }
    else { const due = Math.max(0, 400 - sum(["season", "adjustment"])); fee = due === 0 ? "Season fee paid ✅" : me.declared_payment === "paid_full" ? "Season fee: payment reported — the admin will confirm it" : `Season fee: $${due} owing · e-transfer to christygeorge993@gmail.com`; }
    await expect(card.locator(".sbox .sv")).toHaveText([`${me.season_wins}–${me.season_losses}`, String(elo[me.id] || 0), me.current_court ? `C${me.current_court}` : "—", `${played}/${L.sessions.length}`]);
    expect((await card.locator(".sbox .sl").allTextContents()).map(norm)).toEqual([`Record · ${wr}%`, `Elo · #${rank || "–"} of ${lbPlayers(L).length}`, "Court now", "Sessions played"]);
    expect(norm((await card.locator("div[style*='margin-top:8px']").first().textContent()) || ""), "streak, courts and fee")
      .toBe(norm(`${streak > 0 ? `🔥 ${streak}-session winning streak · ` : ""}${courts.length ? "Courts: " + courts.map((c) => c || "—").join(" → ") + " · " : ""}${fee}`));
    if (i % 4 === 0) {
      const dl = page.waitForEvent("download");
      await card.getByRole("button", { name: "📤 Share as image" }).click();
      const file = await dl, bytes = fs.readFileSync((await file.path())!);
      expect(file.suggestedFilename()).toBe("my-season.png");
      expect([...bytes.subarray(0, 4)], "a PNG image").toEqual([0x89, 0x50, 0x4e, 0x47]);
      expect(bytes.length).toBeGreaterThan(10000);
    }
  });
}
