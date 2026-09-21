// Interoperation: an action in one tab — or by one person — and every other tab (and the other person) seeing the same
// league afterwards, each tab re-derived from the database by the independent oracles. Ten journeys, repeated over
// generated leagues; the five interop-*.spec.ts files each run 100 of the 500 cases.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, refresh, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, NC, type GenOpts, type League, type Player } from "./gen";
import { upcoming } from "./oracle";
import { fromDb, kvOf, checkAllTabs, checkCourts } from "./checks";

const PLAYER = "interop.player@example.invalid";
type Journey = "advance" | "end" | "end-undo" | "decline-start" | "absent-start" | "payment" | "refund" | "qa" | "announce" | "vote";
const JOURNEYS: [Journey, Partial<GenOpts>][] = [
  ["advance", { live: "r1-done", tieRate: 0 }], ["end", { live: "complete" }], ["end-undo", { live: "complete" }],
  ["decline-start", { live: "none", hoursBefore: 30 }], ["absent-start", { live: "none", hoursBefore: 2 }], ["payment", {}],
  ["refund", { live: "none", hoursBefore: 100 }], ["qa", {}], ["announce", {}], ["vote", { live: "none", hoursBefore: 60 }],
];
const isReg = (p: Player) => p.approved && !p.waitlisted && p.membership_type !== "spare";
const isSpare = (p: Player) => p.approved && p.membership_type === "spare";
const money = (L: League, id: number) => L.payments.filter((x) => x.player_id === id && (x.kind === "season" || x.kind === "adjustment")).reduce((n, x) => n + Number(x.amount), 0);

export function defineInterop(from: number, to: number) {
  let admin: Ctx, player: Ctx;
  test.beforeAll(async ({ browser }) => { admin = await openAs(browser); player = await openAs(browser, PLAYER, undefined, admin.state); });
  test.afterAll(async () => { await closeCtx(admin); await closeCtx(player); });
  for (let i = from; i < to; i++) {
    const [journey, extra] = JOURNEYS[i % JOURNEYS.length];
    const withPlayer = journey === "qa" || journey === "announce" || journey === "vote";
    const base = variety(i + 20);
    const opts: GenOpts = { ...base, regulars: Math.max(6, base.regulars ?? 6), ...extra, ...(withPlayer ? { viewerEmail: PLAYER, viewerKind: "regular" as const, pending: 0 } : {}) };
    test(`Interop ${String(i + 1).padStart(3, "0")} · ${journey} · ${genLeague(30000 + i, opts).title}`, async () => {
      const L = genLeague(30000 + i, { ...opts, dates: admin.dates });
      await load(admin, L);
      if (withPlayer) await refresh(player);
      const page = admin.page, r = rng(2000 + i), toast = page.locator("#_t");
      const adminTab = async (name: string) => { await page.evaluate(() => nav("admin")); await page.getByRole("button", { name }).click(); };
      const standingsTab = async (p: typeof page, label: RegExp) => { await p.evaluate(() => nav("standings")); await p.locator("#page-standings .ptab").filter({ hasText: label }).click(); };
      const setVote = async (who: Player, resp: "coming" | "notcoming") => {
        await standingsTab(page, /RSVP$/);
        await page.locator(`#vote-table tr.vote-row[data-pid="${who.id}"]`).locator(`button[title="${resp === "coming" ? "Set coming" : "Set not coming"}"]`).click(); // p85
        await expect(toast).toHaveText(`Answer updated for ${who.name}`);
      };

      if (journey === "advance") {
        const cur = L.current!;
        await adminTab("📅 Session");
        await page.locator("#sess-ui").getByRole("button", { name: "⏭ Next Round (Rotate)" }).click();
        await expect(toast).toHaveText(`Round ${cur.cycle + 1}!`);
        const L2 = fromDb(admin, L);
        expect(L2.current!.cycle).toBe(cur.cycle + 1);
        await checkAllTabs(admin, L2);
      } else if (journey === "end" || journey === "end-undo") {
        const n = L.current!.number;
        await adminTab("📅 Session");
        await page.locator("#sess-ui").getByRole("button", { name: "✅ End & Save Session" }).click();
        await expect(page.locator("#modal.open")).toContainText("Final Court Assignments");
        await page.evaluate(() => closeModal());
        let L2 = fromDb(admin, L);
        expect({ finished: L2.sessions.length, current: L2.current }).toEqual({ finished: L.sessions.length + 1, current: null });
        await checkAllTabs(admin, L2);
        await adminTab("👥 Players");
        await expect(page.locator("#a-pl-court-summary .alert"), "courts already match the final standings").toHaveCount(0);
        if (journey === "end-undo") {
          await adminTab("🛠 Tools");
          await expect(page.locator("#undo-tools-btn")).toHaveText(`↶ Undo: End session ${n}`);
          await page.locator("#undo-tools-btn").click();
          await expect(toast).toHaveText(`Undone: End session ${n}`);
          L2 = fromDb(admin, L);
          expect(L2.current, "tonight is back").toEqual(L.current);
          expect(L2.sessions, "finished sessions as before").toEqual(L.sessions);
          const keyOf = (p: Player) => [p.id, p.current_court, p.season_wins, p.season_losses, p.games_played, p.no_show_count];
          expect(L2.players.map(keyOf), "every player as before").toEqual(L.players.map(keyOf));
          await checkAllTabs(admin, L2);
        }
      } else if (journey === "decline-start") {
        const pool = L.players.filter((p) => isReg(p) && p.current_court > 0);
        const who = pool[Math.floor(r() * pool.length)];
        await setVote(who, "notcoming");
        let L2 = fromDb(admin, L);
        const up = upcoming(L2);
        expect(Object.values(up.assign).flat(), `${who.name} not in next week's lineup`).not.toContain(who.id);
        await checkCourts(page, L2);
        await adminTab("📅 Session");
        await page.locator("#sess-ui").getByRole("button", { name: `🏸 Start Session ${L2.upcoming}` }).click();
        await expect(toast).toContainText(`Session ${L2.upcoming} started`);
        L2 = fromDb(admin, L);
        expect(L2.current!.assignments, "seated exactly as previewed").toEqual(up.assign);
        expect(L2.current!.attendance[who.id]).toBe("declined");
        await checkAllTabs(admin, L2);
        await adminTab("📋 Attendance");
        await expect(page.locator("#excused-tonight")).toContainText(who.name);
      } else if (journey === "absent-start") {
        await adminTab("📋 Attendance");
        const onCourts = [1, 2, 3, 4, 5, 6].flatMap((c) => L.players.filter((p) => p.current_court === c));
        const cands = onCourts.filter((p) => p.membership_type !== "spare");
        const who = cands[Math.floor(r() * cands.length)], n = onCourts.indexOf(who);
        await page.locator("#sec-a-att .card").first().locator("div:has(> button[onclick^='markAttForTab'])").nth(n).getByRole("button", { name: "❌" }).click();
        await expect(toast).toHaveText(`${who.name.split(" ")[0]} marked absent — off Court ${who.current_court} tonight, one court down next week`);
        await expect.poll(() => kvOf(admin, "pre_session_attendance")?.[who.id], { message: "pre-session mark saved" }).toBe("absent");
        let L2 = fromDb(admin, L);
        const up = upcoming(L2);
        await checkCourts(page, L2);
        await adminTab("📅 Session");
        await page.locator("#sess-ui").getByRole("button", { name: `🏸 Start Session ${L2.upcoming}` }).click();
        await expect(toast).toContainText(`, 1 marked absent, `);
        L2 = fromDb(admin, L);
        expect(L2.current!.assignments, "absent player not seated").toEqual(up.assign);
        expect({ att: L2.current!.attendance[who.id], from: L2.current!.absentFrom[who.id] }).toEqual({ att: "absent", from: who.current_court });
        expect(kvOf(admin, "pre_session_attendance"), "pre-session marks are used up").toBeNull();
        await checkAllTabs(admin, L2);
      } else if (journey === "payment") {
        const people = [...L.players.filter((p) => p.membership_type !== "spare"), ...L.players.filter((p) => p.membership_type === "spare")];
        const regs = people.filter((p) => p.membership_type !== "spare");
        const who = regs.find((p) => money(L, p.id) < 400) || regs[0];
        await adminTab("💰 Pay");
        await page.locator("#pay-list .pay-row").nth(people.indexOf(who)).getByRole("button", { name: "＋ Record" }).click();
        await page.getByRole("button", { name: "Save payment" }).click();
        await expect(toast).toHaveText("Payment recorded");
        const L2 = fromDb(admin, L), ap = L2.players.filter((p) => p.current_court > 0), paid = ap.filter((p) => p.paid).length;
        expect(L2.players.find((p) => p.id === who.id)!.paid, `${who.name} now counts as paid`).toBe(money(L2, who.id) >= 400);
        await page.evaluate(() => nav("home"));
        await expect(page.locator("#admin-checklist-home .checklist-item").first()).toContainText(`Payments: ${paid}/${ap.length} paid`);
        await adminTab("📋 Registered");
        const P = L2.players;
        expect((await page.locator("#sec-a-reg div[style*='repeat(4,1fr)'] > div > div:first-child").allTextContents()).slice(5, 6), "Registered: paid count").toEqual([String(P.filter((p) => p.paid).length)]);
        if (who.current_court > 0) {
          await adminTab("👥 Players");
          const active = P.filter((p) => p.current_court > 0).sort((a, b) => a.current_court - b.current_court);
          await expect(page.locator("#a-pl-list .card > div:has(> .pl-num)").nth(active.findIndex((p) => p.id === who.id)).locator("span[title='Toggle paid']")).toHaveText(L2.players.find((p) => p.id === who.id)!.paid ? "💰" : "⏳");
        }
        await checkAllTabs(admin, L2);
      } else if (journey === "refund") {
        const who = L.players.filter((p) => isReg(p))[Math.floor(r() * L.players.filter(isReg).length)];
        await setVote(who, "notcoming");
        await adminTab("💰 Pay");
        const row = page.locator("#refunds-card .refund-row").filter({ hasText: who.name }).first();
        await expect(row, "a decline 100 hours before play is refundable").toContainText("Mark refunded");
        await row.getByRole("button", { name: "Mark refunded" }).click();
        await expect(toast).toHaveText("$14 refund recorded");
        const L2 = fromDb(admin, L);
        expect(L2.payments.at(-1)).toMatchObject({ player_id: who.id, kind: "refund", amount: 14, session_number: L2.upcoming });
        await expect(page.locator("#refunds-card .refund-row").filter({ hasText: who.name }).first()).toContainText("refunded");
        await checkAllTabs(admin, L2);
      } else if (journey === "qa") {
        const me = L.players[0], q = `Case ${i + 1}: can we book an extra court on the 3rd?`, ans = `Yes — case ${i + 1}, booked.`;
        await standingsTab(player.page, /Q&A$/);
        await player.page.locator("#qa-input").fill(q);
        await player.page.getByRole("button", { name: "Submit Question" }).click();
        await expect(player.page.locator("#_t")).toHaveText("Question submitted!");
        await refresh(admin);
        await standingsTab(page, /Q&A$/);
        const card = page.locator("#sec-qa .qa-card").first();
        await expect(card.locator(".qa-q")).toHaveText(q);
        await expect(card.locator(".qa-meta")).toContainText(`Asked by ${me.name}`);
        admin.prompts.push(ans);
        await card.getByRole("button", { name: "Answer" }).click();
        await expect(toast).toHaveText("Answer posted!");
        await refresh(player);
        await standingsTab(player.page, /Q&A$/);
        await expect(player.page.locator("#sec-qa .qa-card").first().locator(".qa-ans")).toHaveText(`Admin: ${ans}`);
        await expect(player.page.locator("#sec-qa .qa-card").first().locator(".qa-meta")).toContainText("Asked by a player");
        await checkAllTabs(admin, fromDb(admin, L));
      } else if (journey === "announce") {
        const title = `Case ${i + 1} notice`, body = `Doors open 7:45 PM — case ${i + 1}.`;
        await adminTab("📣 Announce");
        await page.locator("#ann-type").selectOption(["info", "warn", "success"][i % 3]);
        await page.locator("#ann-title").fill(title);
        await page.locator("#ann-body").fill(body);
        await page.getByRole("button", { name: "📣 Post" }).click();
        await expect(toast).toHaveText("Posted!");
        await refresh(player);
        await player.page.evaluate(() => nav("home"));
        await expect(player.page.locator("#ann-home .ann-card").first().locator(".ann-title"), "the player sees it on Home").toHaveText(title);
        await expect(player.page.locator("#ann-home .ann-card").first().locator(".ann-body")).toHaveText(body);
        await checkAllTabs(admin, fromDb(admin, L));
      } else if (journey === "vote") {
        const me = L.players[0], U = L.upcoming, mine = L.rsvps.find((x) => x.session_number === U && x.player_id === me.id)?.response;
        const resp = mine === "coming" ? "notcoming" : "coming";
        await player.page.evaluate(() => nav("home"));
        await player.page.locator("#home-vote").getByRole("button", { name: resp === "coming" ? "✅ I'm Coming" : "❌ Not Coming" }).click();
        await expect(player.page.locator("#_t")).toHaveText(resp === "coming" ? "You are coming! 🎉" : "Noted - see you next time!");
        await refresh(admin);
        await standingsTab(page, /RSVP$/);
        // p85: the answer shows as the group the player's row now sits under.
        const group = await page.locator(`#vote-table tr.vote-row[data-pid="${me.id}"]`).evaluate((tr) => {
          let el = tr.previousElementSibling;
          while (el && !el.classList.contains("vg")) el = el.previousElementSibling;
          return (el?.textContent || "").replace(/\s*\(\d+\)\s*$/, "").trim();
        });
        expect(group, "the organizer sees the new answer").toBe(resp === "coming" ? "✅ Coming" : "❌ Not coming");
        const L2 = fromDb(admin, L);
        expect(ctx0(L2, me.id, U), "logged as the player's own change").toBe(resp);
        await checkCourts(page, L2);
        if (me.current_court > 0) {
          await adminTab("📋 Attendance");
          const onCourts = [1, 2, 3, 4, 5, 6].flatMap((c) => L2.players.filter((p) => p.current_court === c));
          await expect(page.locator("#sec-a-att .card").first().locator("div:has(> button[onclick^='markAttForTab']) > span:first-child").nth(onCourts.findIndex((p) => p.id === me.id))).toHaveText(`${me.name.split(" ")[0]} ${resp === "coming" ? "voted in" : "voted out"}`);
        }
        await checkAllTabs(admin, L2);
      }
    });
  }
}
const ctx0 = (L: League, id: number, U: number) => L.rsvps.find((x) => x.session_number === U && x.player_id === id)?.response;
