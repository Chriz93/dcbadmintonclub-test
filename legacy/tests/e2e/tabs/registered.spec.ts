// Admin → Registered: overview counts, pending / regular / spare / waitlist / not-registered lists, each registration card,
// invitations (valid, invalid, already a player), approve (including the full-capacity waitlist path), reject, promote from
// the waitlist, and assigning a court from the card. 100 leagues.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, type Player } from "./gen";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
for (let i = 0; i < 100; i++) {
  const opts = { ...variety(i + 8), pending: 1 + (i % 3), ...(i % 4 === 0 ? { regulars: 26 } : {}) };
  test(`Registered ${String(i + 1).padStart(3, "0")} · ${genLeague(18000 + i, opts).title}`, async () => {
    const L = genLeague(18000 + i, { ...opts, dates: ctx.dates });
    const r = rng(80 + i);
    // Some leagues carry a waitlist and a walk-in added by the organizer without a waiver.
    if (i % 3 === 0) L.players.filter((p) => !p.approved && p.membership_type !== "spare").slice(0, 2).forEach((p, k) => { p.approved = true; p.waitlisted = true; p.registered_at = new Date(Date.parse("2026-09-05T12:00:00Z") + k * 6e4).toISOString(); });
    if (i % 5 === 0) L.players.push({ ...L.players[0], id: 900 + i, name: "Walk-in Guest", email: "", sig: "admin", waiver_signed: false, paid: false, current_court: 0, highest_court: 0, season_wins: 0, season_losses: 0, games_played: 0, no_show_count: 0, membership_type: "regular", approved: true, waitlisted: false, medical: "" } as Player);
    await load(ctx, L);
    const page = ctx.page, toast = page.locator("#_t"), sec = page.locator("#sec-a-reg");
    await page.evaluate(() => nav("admin"));
    await page.getByRole("button", { name: /^📋 Registered/ }).click();
    const P = L.players, selfReg = P.filter((p) => p.sig && p.sig !== "admin"), adminAdded = P.filter((p) => p.sig === "admin");
    const waitlisted = selfReg.filter((p) => p.waitlisted), pending = selfReg.filter((p) => !p.approved && !p.waitlisted), approved = selfReg.filter((p) => p.approved && !p.waitlisted);
    const waiver = (p: Player) => !!p.waiver_signed, notReg = adminAdded.filter((p) => !waiver(p) && !selfReg.some((s) => s.name.toLowerCase().includes(p.name.split(" ")[0].toLowerCase()) && waiver(s)));
    const taken = (except?: number) => P.filter((x) => x.membership_type !== "spare" && !x.waitlisted && x.approved && x.sig !== "admin" && String(x.registered_at) >= "2026-09-01" && x.id !== except).length;
    expect(await sec.locator("div[style*='repeat(4,1fr)'] > div > div:first-child").allTextContents(), "overview").toEqual([P.length, selfReg.length, selfReg.filter((p) => p.membership_type !== "spare").length, selfReg.filter((p) => p.membership_type === "spare").length,
      P.filter(waiver).length, P.filter((p) => p.paid).length, notReg.length, P.filter((p) => !p.paid && (p.current_court > 0 || p.sig !== "admin")).length].map(String));
    const cardOf = (title: RegExp) => sec.locator(".card").filter({ has: page.locator(".card-title", { hasText: title }) });
    const names = async (title: RegExp) => (await cardOf(title).count()) ? (await cardOf(title).locator(".flex-between > div:first-child").allTextContents()).map(norm) : [];
    expect(await names(/^⏳ Pending Approval/), "pending list").toEqual(pending.map((p) => p.name + (p.membership_type === "spare" ? "SPARE" : "")));
    expect(await names(/^✅ Regular Members/), "regular members").toEqual(approved.filter((p) => p.membership_type !== "spare").map((p) => p.name));
    expect(await names(/^🔄 Spare Players/), "spare players").toEqual(approved.filter((p) => p.membership_type === "spare").map((p) => p.name + "SPARE"));
    expect(await names(/^⏳ Waitlist/), "waitlist").toEqual(waitlisted.map((p, k) => `#${k + 1} ${p.name}WAITLIST`));
    if (notReg.length) await expect(cardOf(/^❌ Not Registered/)).toContainText("Walk-in Guest");
    const free = Math.max(0, 26 - taken()), first = [...waitlisted].sort((a, b) => String(a.registered_at).localeCompare(String(b.registered_at)) || a.id - b.id)[0];
    await expect(sec.locator("#waitlist-offer"), "waitlist offer only when a place is free").toHaveCount(first && free > 0 ? 1 : 0);
    if (waitlisted.length) await expect(cardOf(/^⏳ Waitlist/).locator(free > 0 ? "button:has-text('↑ Promote')" : ".tag:has-text('Slots Full')")).toHaveCount(waitlisted.length);
    // One registration card in detail.
    const shown = [...pending, ...approved.filter((p) => p.membership_type !== "spare"), ...approved.filter((p) => p.membership_type === "spare")];
    if (shown.length) {
      const p = shown[Math.floor(r() * shown.length)], card = sec.locator("div[style*='padding:12px']").filter({ has: page.locator(".flex-between > div:first-child", { hasText: new RegExp(`^${p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }) }).first();
      await expect(card.locator(".flex-between .tag").first()).toHaveText(p.paid ? "✅ Paid" : "⏳ Unpaid");
      await expect(card).toContainText(`📧 ${p.email}`);
      await expect(card).toContainText(p.current_court > 0 ? `🏸 Court ${p.current_court}` : "🏸 Unassigned");
      await expect(card.locator("select")).toHaveValue(String(p.current_court || 0));
      await expect(card.getByRole("button", { name: "✓ Approve" })).toHaveCount(pending.includes(p) ? 1 : 0);
      if (p.medical) await expect(card).toContainText(`⚕️ ${p.medical}`);
    }
    const act = i % 6;
    if (act === 0 || act === 1) {
      const email = act === 0 ? `new.player${i}@example.invalid` : r() < 0.5 ? "not-an-email" : (P.find((p) => p.email) || { email: "x" }).email;
      await page.locator("#inv-email").fill(email.toUpperCase());
      await page.locator("#inv-type").selectOption(i % 2 ? "spare" : "regular");
      await sec.getByRole("button", { name: "Send invitation" }).click();
      if (act === 0) {
        await expect(toast).toHaveText(`Invited ${email} as ${i % 2 ? "spare" : "regular"}. They sign in with that email and register.`);
        expect(ctx.state.invitations[email], "invitation saved in lower case").toBe(i % 2 ? "spare" : "regular");
        await expect(page.locator("#inv-email")).toHaveValue("");
        await expect(page.locator("#invite-card")).toContainText(email);
      } else await expect(toast).toHaveText(email === "not-an-email" ? "Enter a valid email address" : "That email already belongs to a player — they can sign in and register");
    } else if (act === 2 && pending.length) {
      const p = pending[0], full = p.membership_type !== "spare" && taken(p.id) >= 26;
      await cardOf(/^⏳ Pending Approval/).getByRole("button", { name: "✓ Approve" }).first().click();
      await expect(toast).toHaveText(full ? "Approved (waitlisted — regular slots full)" : "Player approved!");
      const kv = JSON.parse(ctx.state.state["player_approvals"].value);
      expect(kv[p.id], `${p.name} approval saved`).toMatchObject({ approved: true, waitlisted: full });
    } else if (act === 3 && shown.length) {
      const p = shown[0];
      await sec.locator("div[style*='padding:12px']").filter({ hasText: p.email }).first().getByRole("button", { name: "✕" }).click();
      await expect(toast).toHaveText("Registration removed");
      expect(ctx.state.players.some((x) => x.id === p.id), `${p.name} removed`).toBe(false);
    } else if (act === 4 && first && free > 0) {
      await sec.locator("#waitlist-offer").getByRole("button", { name: `Promote ${first.name.split(" ")[0]} to regular` }).click();
      await expect(toast).toHaveText(`${first.name} promoted from the waitlist`);
      expect(JSON.parse(ctx.state.state["player_approvals"].value)[first.id]).toMatchObject({ approved: true, waitlisted: false, membershipType: "regular" });
    } else if (act === 5 && shown.length) {
      const p = shown[shown.length - 1], c = (p.current_court % 6) + 1;
      await sec.locator("div[style*='padding:12px']").filter({ hasText: p.email }).first().locator("select").selectOption(String(c));
      await expect(toast).toHaveText(`${p.name} assigned to Court ${c}`);
      expect(ctx.state.players.find((x) => x.id === p.id)!.current_court).toBe(c);
    }
  });
}
