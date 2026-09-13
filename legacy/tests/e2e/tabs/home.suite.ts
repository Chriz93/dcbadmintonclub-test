// Home (organizer): next session line, countdown, vote card, announcements, Player of the Session, admin checklist and
// the quick-access buttons — on 100 leagues across the whole week before a Tuesday and the end of the season.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety } from "./gen";
import { pos } from "./oracle";

/** The suite's cases; the desktop and phone spec files both call this. */
export function define() {
  const HOURS = [200, 150, 100, 72.5, 49, 46.2, 30, 12, 3, 0.5, 0.02];
  const QUICK: [string, string][] = [["🏟️ Courts", "courts"], ["✏️ Scores", "scores"], ["🏆 Standings", "standings"], ["📅 Schedule", "schedule"]];
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
  test.afterAll(async () => { await closeCtx(ctx); });
  for (let i = 0; i < 100; i++) {
    const opts = { ...variety(i + 3), ...(i % 13 === 12 ? {} : { hoursBefore: HOURS[i % HOURS.length] }), ...(i % 17 === 16 ? { sessions: 28, live: "none" as const } : {}) };
    test(`Home ${String(i + 1).padStart(3, "0")} · ${genLeague(13000 + i, opts).title}`, async () => {
      const L = genLeague(13000 + i, { ...opts, dates: ctx.dates });
      await load(ctx, L);
      const page = ctx.page;
      await page.evaluate(() => nav("home"));
      const done = !L.current && L.sessions.length >= 28, U = L.current ? L.current.number : Math.min(L.sessions.length + 1, 28);
      await expect(page.locator("#next-date")).toHaveText(done ? "Season Complete! 🎉" : `Session ${U} — ${ctx.dates[U - 1]}${L.current ? (L.nowMs>=ctx.fd[U-1]||Object.keys(L.current.scores).length?" · in progress":" · courts prepared") : ""}`);
      // Countdown to 8 PM on the Tuesday, cleared once play has started.
      const diff = ctx.fd[U - 1] - L.nowMs;
      const boxes = await page.$$eval("#countdown .cd-box", (bs) => bs.map((b) => `${b.querySelector(".cd-num")!.textContent} ${b.querySelector(".cd-lbl")!.textContent}`));
      expect(boxes, `countdown ${(diff / 36e5).toFixed(2)} h before play`).toEqual(diff > 0 ? [`${Math.floor(diff / 864e5)} Days`, `${Math.floor((diff % 864e5) / 36e5)} Hours`, `${Math.floor((diff % 36e5) / 6e4)} Mins`] : []);
      // Vote card: the organizer is not a player here, so Home asks them to register before voting.
      const vote = page.locator("#home-vote");
      if (done) expect(norm(await vote.innerText())).toBe("");
      else if (!(await page.evaluate(() => userRegistered))) {
        await expect(vote.locator(".card-title")).toHaveText(`🗳️ Vote: Session ${U} (${ctx.dates[U - 1]})`);
        await expect(vote).toContainText("Register first, then you can vote here every week.");
        await expect(vote.getByRole("button", { name: "Register now" })).toBeVisible();
      }
      // Latest three announcements, newest first.
      const anns = [...L.announcements].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);
      const when = await page.evaluate((ts) => ts.map((t) => new Date(t).toLocaleDateString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })), anns.map((a) => a.created_at));
      const cards = await page.$$eval("#ann-home .ann-card", (cs) => cs.map((c) => ({ type: c.className.replace("ann-card ann-", ""), title: c.querySelector(".ann-title")!.textContent, body: c.querySelector(".ann-body")!.textContent, time: c.querySelector(".ann-time")!.textContent })));
      expect(cards, "announcements on Home").toEqual(anns.map((a, k) => ({ type: a.type, title: a.title, body: a.body, time: when[k] })));
      const p = pos(L), banner = page.locator("#pos-home");
      if (p) { await expect(banner.locator(".pos-name")).toHaveText(p.name); expect(norm(await banner.locator(".pos-stat").innerText())).toBe(p.stat); }
      else expect(norm(await banner.innerText())).toBe("");
      // Admin checklist.
      const paidFor=(id:number)=>{const p=L.players.find(x=>x.id===id)!;return L.payments.filter(x=>x.player_id===id&&(p.membership_type==='spare'?x.kind==='spare'&&x.session_number===U:x.kind==='season'||x.kind==='adjustment')).reduce((n,x)=>n+Number(x.amount),0)>=(p.membership_type==='spare'?20:400);};
      const ap = L.players.filter((x) => x.current_court > 0), total = ap.length, paid = ap.filter((x) => paidFor(x.id)).length;
      const regPaid = L.payments.filter(x=>x.kind==="season"||x.kind==="adjustment").reduce((n,x)=>n+Number(x.amount),0), sparePaid = ap.filter((x) => paidFor(x.id) && x.membership_type === "spare").length;
      const waiver = ap.filter((x) => x.waiver_signed).length, selfReg = L.players.filter((x) => x.sig && x.sig !== "admin"), pending = selfReg.filter((x) => !x.approved).length;
      const regWaiver = selfReg.filter((x) => x.waiver_signed).length, assigned = L.current ? Object.values(L.current.assignments).flat().length : total;
      const want = [
        `${paid === total && total > 0 ? "✓" : "!"} Payments: ${paid}/${total} paid $${regPaid}${sparePaid ? ` +${sparePaid}×spare` : ""}`,
        `${waiver === total && total > 0 ? "✓" : "!"} Waivers: ${waiver}/${total} on-court signed${regWaiver ? ` · ${regWaiver} registered` : ""}`,
        `${L.current ? "✓" : "✗"} Session: ${L.current ? "Active — " + L.current.date : "Not started"}`,
        `${assigned > 0 ? "✓" : "✗"} Court assignments: ${assigned} players`,
        ...(selfReg.length ? [`${pending ? "!" : "✓"} Registrations: ${selfReg.length} registered${pending ? ` · ${pending} pending approval` : ""}`] : []),
      ];
      expect((await page.locator("#admin-checklist-home .card").first().locator(".checklist-item").allInnerTexts()).map(norm), "admin checklist").toEqual(want);
      // One quick-access button per case opens its page.
      const [label, target] = QUICK[i % QUICK.length];
      await page.locator("#quick-access-btns").getByRole("button", { name: label }).click();
      await expect(page.locator(`#page-${target}`)).toHaveClass(/active/);
    });
  }
}
