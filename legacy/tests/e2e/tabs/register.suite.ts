// Register: the three-step wizard for an invited player — membership and payment declaration, details, waiver, league
// format — with every validation message, the full-capacity waitlist, a returning player (details pre-filled) and a
// player who has already registered this season. The database row and the status card are checked after submitting.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, type Player } from "./gen";

/** The suite's cases; the desktop and phone spec files both call this. */
export function define() {
  const REG = "new.registrant@example.invalid";
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser, REG); });
  test.afterAll(async () => { await closeCtx(ctx); });
  for (let i = 0; i < 100; i++) {
    const story = (["regular", "spare", "regular-paid", "full", "returning", "already", "invalid-1", "invalid-2", "invalid-3", "regular"] as const)[i % 10];
    const opts = { ...variety(i + 13), ...(story === "full" ? { regulars: 26, pending: 0 } : {}) };
    test(`Register ${String(i + 1).padStart(3, "0")} · ${story} · ${genLeague(23000 + i, opts).title}`, async () => {
      const L = genLeague(23000 + i, { ...opts, dates: ctx.dates });
      const r = rng(170 + i), spare = story === "spare";
      L.invitations[REG] = spare ? "spare" : "regular";
      const me: Player | undefined = story === "returning" || story === "already" ? ({ ...L.players[0], id: 800 + i, name: "Riley Returning", email: REG, phone: "613-555-0199", emergency: "Sam 613-555-0100", medical: "Knee brace", approved: story === "already", waitlisted: false, current_court: 0, highest_court: 0, season_wins: 0, season_losses: 0, games_played: 0, no_show_count: 0, membership_type: "regular", registered_at: story === "already" ? "2026-09-05T15:00:00Z" : "2025-09-02T15:00:00Z", paid: false, declared_payment: "will_pay" } as Player) : undefined;
      if (me) L.players.push(me);
      await load(ctx, L);
      const page = ctx.page, toast = page.locator("#_t");
      await page.evaluate(() => { regData = {}; goRS(1); for (const id of ["r-name", "r-phone", "r-emergency", "r-medical", "r-sig", "r-sig-lf"]) { const e = document.getElementById(id) as HTMLInputElement | null; if (e) e.value = ""; } for (const id of ["w1", "w5", "w6", "lf-all"]) { const e = document.getElementById(id) as HTMLInputElement | null; if (e) e.checked = false; } renderRegPage(); });
      await page.evaluate(() => nav("register"));
      // Places held by regulars registered this season (sign-ups awaiting approval included), as every viewer can see them.
      const taken = L.players.filter((p) => p.membership_type !== "spare" && !p.waitlisted && p.sig !== "admin" && String(p.registered_at) >= "2026-09-01").length;
      await expect(page.locator("#reg-slots-text")).toHaveText(taken >= 26 ? "FULL" : `${26 - taken} spots left`);
      if (story === "already") {
        await expect(page.locator("#reg-form")).toBeHidden();
        const card = page.locator("#reg-already");
        await expect(card).toContainText(`${me!.name}`);
        await expect(card).toContainText("✅ Approved");
        await expect(card).toContainText("Membership: Regular Member");
        await expect(card.getByRole("button", { name: "Switch account to register another player" })).toBeVisible();
        return;
      }
      await expect(page.locator("#r-email")).toHaveValue(REG);
      if (story === "returning") {
        await expect(page.locator("#reg-already")).toContainText(`👋 Welcome back, ${me!.name}. A new season needs a fresh registration and agreement.`);
        for (const [id, v] of [["r-name", me!.name], ["r-phone", me!.phone], ["r-emergency", me!.emergency], ["r-medical", me!.medical]]) await expect(page.locator(`#${id}`), `${id} pre-filled`).toHaveValue(v);
      }
      await page.locator(spare ? "#mt-spare-box" : "#mt-regular-box").click();
      const pay = spare ? "per_session" : story === "regular-paid" ? "paid_full" : "will_pay";
      if (!spare) await page.locator(`input[name="pay-decl"][value="${pay}"]`).check();
      const name = story === "returning" ? me!.name : `Jordan Newman ${i + 1}`;
      if (story !== "returning") {
        await page.locator("#r-name").fill(story === "invalid-1" && r() < 0.5 ? "J" : name);
        await page.locator("#r-phone").fill(story === "invalid-1" && r() < 0.5 ? "" : "613-555-0142");
        await page.locator("#r-emergency").fill("Alex Newman, 613-555-0143");
        await page.locator("#r-medical").fill(i % 3 ? "" : "Mild asthma");
      }
      await page.locator("#rs1").getByRole("button", { name: "Continue →" }).click();
      if (story === "invalid-1") {
        const nm = await page.locator("#r-name").inputValue(), ph = await page.locator("#r-phone").inputValue();
        if (ph && nm.length >= 2) { await expect(page.locator("#rs2"), "valid details move on").toHaveClass(/active/); return; }
        await expect(toast).toHaveText(!ph ? "Fill all required fields" : "Name too short");
        await expect(page.locator("#rs1")).toHaveClass(/active/);
        return;
      }
      await expect(page.locator("#rs2")).toHaveClass(/active/);
      // The payment acknowledgement is the season-fee choice on step 1; the waiver step has no second one.
      await expect(page.locator("#rs2 #w5-row, #rs2 #w6-row, #w5, #w6"), "no duplicate payment acknowledgement on step 2").toHaveCount(0);
      await expect(page.locator("#rs2"), "no fee on the waiver step").not.toContainText(spare ? "$400" : "$20 per session");
      if (story === "invalid-2") {
        await page.locator("#rs2").getByRole("button", { name: "Continue →" }).click();
        await expect(toast).toHaveText("Please tick the box to accept the waiver to continue");
        await page.locator("#w1").check();
        await page.locator("#rs2").getByRole("button", { name: "Continue →" }).click();
        await expect(toast).toHaveText("Enter digital signature");
        return;
      }
      await page.locator("#w1").check();
      await page.locator("#r-sig").fill(name);
      await page.locator("#rs2").getByRole("button", { name: "Continue →" }).click();
      await expect(page.locator("#rs3")).toHaveClass(/active/);
      if (story === "invalid-3") {
        await page.locator("#reg-btn-lf").click();
        await expect(toast).toHaveText("Please agree to the league format rules to continue");
        await page.locator("#lf-all").check();
        await page.locator("#reg-btn-lf").click();
        await expect(toast).toHaveText("Enter digital signature");
        return;
      }
      await page.locator("#lf-all").check();
      await page.locator("#r-sig-lf").fill(name);
      await page.locator("#reg-btn-lf").click();
      // Success text and the previous status card remain in hidden DOM between cases.
      // Wait for this submission's complete UI transition before inspecting them
      // or replacing the synthetic database for the next registrant.
      await expect(page.locator("#reg-btn-lf")).toBeEnabled();
      await expect(page.locator("#rs4")).toHaveClass(/active/);
      await expect(page.locator("#reg-already")).toBeVisible();
      await expect(page.locator("#reg-already")).toContainText(name);
      const waitlisted = !spare && taken >= 26;   // a full league puts new regulars on the waitlist
      await expect(page.locator("#reg-success-msg")).toContainText(spare ? "Registered as Spare — Admin will contact you when needed." : waitlisted ? "You have been added to the Regular Waitlist. Admin will promote you when a spot opens." : "Your registration");
      const row = await expect.poll(() => ctx.state.players.find((p) => p.email === REG && p.name === name)).toBeTruthy().then(() => ctx.state.players.find((p) => p.email === REG && p.name === name)!);
      expect({ type: row.membership_type, pay: row.declared_payment, waitlisted: !!row.waitlisted, approved: !!row.approved, phone: row.phone, sig: row.sig }, "saved registration")
        .toEqual({ type: spare ? "spare" : "regular", pay, waitlisted: false /* the waitlist is applied when the organizer approves */, approved: false, phone: story === "returning" ? me!.phone : "613-555-0142", sig: name });
      if (me) expect(row.id, "a returning player keeps their record").toBe(me.id);
      expect(String(row.registered_at) >= "2026-09-01", "registered this season").toBe(true);
      // The Register tab now shows the status card for this season.
      await expect(page.locator("#reg-already")).toContainText("⏳ Your registration is pending admin approval.");
      await expect(page.locator("#reg-already")).toContainText(`Membership: ${spare ? "Spare Player" : "Regular Member"}`);
    });
  }
}
