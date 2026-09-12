// Every control no other suite uses, used where it appears and checked by what it does: organizer votes and answers,
// registrations (court, link, reject), invitations with a note, payments with a date, notes, removals, snapshots,
// cascade, share links, clipboard summaries, the season PDF, views, sign-in steps, reminders and notifications.
import { test, expect, type Page, type Browser } from "@playwright/test";
import fs from "node:fs";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type League, type LiveState } from "./gen";
import { courtOf } from "./oracle";
import { installMock, freshState } from "../mock-supabase";
import { signIn } from "../helpers";
import { fillCourts } from "../rules-model";

/** Opens pages and tabs until an element matching sel is visible; returns false if none is. */
async function reveal(page: Page, sel: string) {
  const views: (() => Promise<unknown>)[] = [
    () => page.evaluate(() => nav("home")), () => page.evaluate(() => nav("courts")), () => page.evaluate(() => nav("schedule")),
    async () => { await page.evaluate(() => nav("scores")); const c = await page.evaluate(() => [1, 2, 3, 4, 5, 6].find((x) => (S.current?.assignments?.[x] || []).length >= 2) || 1); await page.locator("#sc-sel").selectOption(String(c)); },
    ...["lb", "rank", "pstats", "heat", "sessstand", "hist", "vote", "qa"].map((s) => () => page.evaluate((x) => { nav("standings"); showSec("standings", x); }, s)),
    () => page.evaluate(() => nav("register")),
    ...["a-pl", "a-reg", "a-past", "a-wv", "a-sess", "a-att", "a-assign", "a-pay", "a-ann", "a-tools"].map((t) => () => page.evaluate((x) => { nav("admin"); showSec("admin", x); }, t)),
  ];
  for (const go of views) { await go(); if (await page.locator(sel).first().isVisible().catch(() => false)) return true; }
  return false;
}
const league = (seed: number, live: LiveState = "r1-partial", extra = {}) => genLeague(seed, { ...variety(seed), live, ...extra });

test.describe("controls · organizer", () => {
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); await ctx.page.context().grantPermissions(["clipboard-read", "clipboard-write"]); });
  test.afterAll(async () => { await closeCtx(ctx); });
  const kv = (k: string) => JSON.parse(ctx.state.state[k]?.value ?? "null");
  const toast = () => ctx.page.locator("#_t");

  test("Controls · adminSetVote: the organizer sets a player's answer from Standings → RSVP", async () => {
    const L = league(51000, "none"); await load(ctx, L);
    const page = ctx.page, n = await page.evaluate(() => upcomingSessionNumber());
    expect(await reveal(page, `button[onclick$="'notcoming')"][onclick^="adminSetVote("]`)).toBe(true);
    const btn = page.locator(`button[onclick^="adminSetVote("][onclick$="'notcoming')"]`).first(), id = +(await btn.getAttribute("onclick"))!.match(/\((\d+)/)![1];
    await btn.click();
    await expect(toast()).toHaveText(`Answer updated for ${L.players.find((p) => p.id === id)!.name}`);
    expect(ctx.state.rsvps.find((r) => r.session_number === n && r.player_id === id)?.response).toBe("notcoming");
  });
  test("Controls · answerQuestion: the organizer answers a player's question", async () => {
    const L = league(51001, "none"); L.questions = [{ id: 7, player_id: L.players[0].id, asker: L.players[0].name, question: "Is parking free after 7?", answer: null, answered_at: null, created_at: "2026-09-09T12:00:00Z" }] as never;
    await load(ctx, L); ctx.prompts.push("Yes — the east lot is free after 7 PM.");
    expect(await reveal(ctx.page, 'button[onclick^="answerQuestion("]')).toBe(true);
    await ctx.page.locator('button[onclick^="answerQuestion(7)"]').click();
    await expect(toast()).toHaveText("Answer posted!");
    expect((ctx.state.questions as { id: number; answer: string }[]).find((q) => q.id === 7)!.answer).toBe("Yes — the east lot is free after 7 PM.");
  });
  test("Controls · assignCourtToRegistered: a registered player is given a court from the Registered tab", async () => {
    const L = league(51002, "none", { pending: 2 }); await load(ctx, L);
    expect(await reveal(ctx.page, 'select[onchange^="assignCourtToRegistered("]')).toBe(true);
    const sel = ctx.page.locator('select[onchange^="assignCourtToRegistered("]').first(), id = +(await sel.getAttribute("onchange"))!.match(/\((\d+)/)![1];
    await sel.selectOption("3");
    await expect.poll(() => ctx.state.players.find((p) => p.id === id)!.current_court).toBe(3);
  });
  test("Controls · cascadeFillCourt: promoting from an empty court is refused with the reason", async () => {
    const L = league(51003, "r1-partial", { regulars: 13, spares: 0, declineRate: 0, absentRate: 0 }); await load(ctx, L);
    await ctx.page.evaluate(() => { nav("admin"); showSec("admin", "a-sess"); });
    await ctx.page.locator('button[onclick="cascadeFillCourt(6)"]').click();
    await expect(toast()).toHaveText("Court 6 has no players to promote from");
  });
  test("Controls · cascadeFillCourt: the first player of a court moves up to fill the court above", async () => {
    const L = league(51004, "r1-partial", { regulars: 16, spares: 0, declineRate: 0, absentRate: 0 }); const a = L.current!.assignments; const out = a[1].pop()!; void out;
    await load(ctx, L);
    const first = a[2][0];
    await ctx.page.evaluate(() => { nav("admin"); showSec("admin", "a-sess"); });
    await ctx.page.locator('button[onclick="cascadeFillCourt(2)"]').click();
    await expect(toast()).toHaveText(`${L.players.find((p) => p.id === first)!.name} promoted from Court 2 → Court 1`);
    expect(kv("current_session").assignments[1][0]).toBe(first);
  });
  test("Controls · copySessionSummary: the end-of-session summary is copied for Messenger", async () => {
    const L = league(51005, "complete"); await load(ctx, L);
    await ctx.page.evaluate(() => { nav("admin"); showSec("admin", "a-sess"); });
    await ctx.page.getByRole("button", { name: "✅ End & Save Session" }).click();
    await ctx.page.locator('#modal.open button[onclick="copySessionSummary()"]').click();
    const text = await ctx.page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain(`Session ${L.current!.number} — ${L.current!.date}`); expect(text).toContain("📊 FINAL COURTS:");
  });
  test("Controls · copyRoundSummary: the round summary is copied from the score screen", async () => {
    const L = league(51006, "r1-done"); await load(ctx, L);
    expect(await reveal(ctx.page, 'button[onclick="copyRoundSummary()"]')).toBe(true);
    await ctx.page.locator('button[onclick="copyRoundSummary()"]').first().click();
    await expect(toast()).toHaveText(/^Copied to clipboard!/);
    expect(await ctx.page.evaluate(() => navigator.clipboard.readText())).toBe(await ctx.page.evaluate(() => buildRoundSummary()));
  });
  test("Controls · shareMessenger: without the phone share sheet, Messenger's share page opens with the league link", async () => {
    const L = league(51007, "r1-done"); await load(ctx, L);
    await ctx.page.evaluate(() => { (window as unknown as { __open: string[] }).__open = []; window.open = ((u: string) => { (window as unknown as { __open: string[] }).__open.push(u); return null; }) as typeof window.open; Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); });
    expect(await reveal(ctx.page, 'button[onclick="shareMessenger()"]')).toBe(true);
    await ctx.page.locator('button[onclick="shareMessenger()"]').first().click();
    const opened = await ctx.page.evaluate(() => (window as unknown as { __open: string[] }).__open);
    expect(opened.length).toBe(1); expect(opened[0].startsWith("https://www.facebook.com/dialog/send?link=")).toBe(true);
  });
  test("Controls · shareCourtAssignments: WhatsApp opens with every court and its players", async () => {
    const L = league(51008, "r1-partial"); await load(ctx, L);
    await ctx.page.evaluate(() => { (window as unknown as { __open: string[] }).__open = []; window.open = ((u: string) => { (window as unknown as { __open: string[] }).__open.push(u); return null; }) as typeof window.open; });
    expect(await reveal(ctx.page, 'button[onclick="shareCourtAssignments()"]')).toBe(true);
    await ctx.page.locator('button[onclick="shareCourtAssignments()"]').first().click();
    const url = (await ctx.page.evaluate(() => (window as unknown as { __open: string[] }).__open))[0], msg = decodeURIComponent(url.replace("https://wa.me/?text=", ""));
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    for (let c = 1; c <= 6; c++) { expect(msg).toContain(`*Court ${c}*`); for (const id of L.current!.assignments[c] || []) expect(msg).toContain(`• ${L.players.find((p) => p.id === id)!.name}`); }
  });
  test("Controls · deleteAnn: an announcement is deleted after confirming", async () => {
    const L = league(51009, "none"); L.announcements = [{ id: 31, type: "info", title: "Gym change", body: "Gym 127D tonight", created_at: "2026-09-09T00:00:00Z" }] as never;
    await load(ctx, L); await ctx.page.evaluate(() => { nav("admin"); showSec("admin", "a-ann"); });
    await ctx.page.locator('button[onclick="deleteAnn(31)"]').click();
    await expect.poll(() => ctx.state.announcements.length).toBe(0);
  });
  test("Controls · invitePlayer with a note, then deleteInvitation: the invitation is added and withdrawn", async () => {
    const L = league(51010, "none"); await load(ctx, L); await ctx.page.evaluate(() => { nav("admin"); showSec("admin", "a-reg"); });
    const page = ctx.page;
    await page.locator("#inv-email").fill("new.person@example.invalid"); await page.locator("#inv-note").fill("Referred by Kim");
    await page.locator('button[onclick="invitePlayer()"]').click();
    await expect(toast()).toHaveText("Invited new.person@example.invalid as regular. They sign in with that email and register.");
    await expect(page.locator("#inv-note"), "the form is cleared").toHaveValue("");
    expect(ctx.state.invitations["new.person@example.invalid"]).toBe("regular");
    await page.locator(`button[onclick="deleteInvitation('new.person@example.invalid')"]`).click();
    await expect(toast()).toHaveText("Invitation withdrawn");
    expect(ctx.state.invitations["new.person@example.invalid"]).toBeUndefined();
  });
  test("Controls · togglePaid, pay-date and deletePayment: a payment is recorded with its date, then removed", async () => {
    const L = league(51011, "none"); L.payments = []; await load(ctx, L);
    const page = ctx.page, p = L.players.find((x) => x.membership_type === "regular")!;
    expect(await reveal(page, `[onclick="togglePaid(${p.id})"]`)).toBe(true);
    await page.locator(`[onclick="togglePaid(${p.id})"]`).first().click();
    await page.locator("#pay-date").fill("2026-09-14"); await page.locator("#pay-amount").fill("400"); await page.locator("#pay-note").fill("e-transfer 1234");
    await page.locator("#modal.open").getByRole("button", { name: "Save payment" }).click();
    await expect(toast()).toHaveText("Payment recorded");
    const row = ctx.state.payments.find((x) => x.player_id === p.id)!;
    expect(row).toMatchObject({ kind: "season", amount: 400, received_on: "2026-09-14", note: "e-transfer 1234" });
    expect(await reveal(page, `[onclick^="deletePayment(${row.id})"]`)).toBe(true);
    await page.locator(`[onclick^="deletePayment(${row.id})"]`).first().click();
    await expect(toast()).toHaveText("Entry deleted");
    expect(ctx.state.payments.some((x) => x.id === row.id)).toBe(false);
  });
  test("Controls · promptSaveSnapshot then deleteSnapshot: a snapshot is saved and deleted", async () => {
    const L = league(51012, "none"); await load(ctx, L); await ctx.page.evaluate(() => { nav("admin"); showSec("admin", "a-tools"); });
    await ctx.page.locator("#snap-label").fill("Before the draw");
    await ctx.page.getByRole("button", { name: "📸 Save Snapshot Now" }).click(); await expect(toast()).toHaveText("📸 Snapshot saved");
    await expect(ctx.page.locator('#snap-list [onclick^="deleteSnapshot("]')).toHaveCount(1);
    await ctx.page.locator('#snap-list [onclick^="deleteSnapshot("]').first().click();
    await expect(ctx.page.locator('#snap-list [onclick^="deleteSnapshot("]'), "the snapshot is gone from the list").toHaveCount(0);
    expect(Object.keys(ctx.state.state).filter((k) => k.startsWith("snapshot_") && ctx.state.state[k].value !== "null" && !ctx.state.state[k].value.includes("deleted")), "and from the database (or tombstoned)").toEqual([]);
  });
  test("Controls · linkWaiverToPlayer and doLinkWaiver: a sign-up's waiver is linked to an existing player", async () => {
    const L = league(51013, "none", { pending: 2 }); await load(ctx, L);
    const page = ctx.page;
    expect(await reveal(page, '[onclick^="linkWaiverToPlayer("]')).toBe(true);
    const btn = page.locator('[onclick^="linkWaiverToPlayer("]').first(), regId = +(await btn.getAttribute("onclick"))!.match(/(\d+)/)![1], reg = ctx.state.players.find((x) => x.id === regId)!;
    await btn.click();
    await expect(page.locator("#modal.open")).toContainText(`Link ${reg.name}'s waiver & registration data to an existing player.`);
    await page.locator("#modal.open").getByRole("button", { name: "Link Waiver" }).click();
    await expect(toast()).toHaveText("Select a player to link to");
    const target = ctx.state.players.find((x) => x.id !== regId)!;
    await page.locator("#link-target-select").selectOption(String(target.id));
    await page.locator("#modal.open").getByRole("button", { name: "Link Waiver" }).click();
    await expect(toast()).toHaveText(`Waiver linked: ${reg.name} → ${target.name}`);
    expect(ctx.state.players.find((x) => x.id === target.id)!.sig).toBe(reg.sig);
    expect(ctx.state.players.some((x) => x.id === regId), "the separate sign-up is removed after confirming").toBe(false);
  });
  test("Controls · rejectPlayer: a pending sign-up is removed after confirming", async () => {
    const L = league(51014, "none", { pending: 2 }); await load(ctx, L);
    expect(await reveal(ctx.page, '[onclick^="rejectPlayer("]')).toBe(true);
    const btn = ctx.page.locator('[onclick^="rejectPlayer("]').first(), id = +(await btn.getAttribute("onclick"))!.match(/(\d+)/)![1];
    await btn.click();
    await expect.poll(() => ctx.state.players.some((x) => x.id === id)).toBe(false);
  });
  test("Controls · removePlayer: a player is removed, and taken off tonight's court", async () => {
    const L = league(51015, "r1-partial"); await load(ctx, L);
    const id = L.current!.assignments[1][0];
    await ctx.page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); });
    await ctx.page.locator(`[onclick="removePlayer(${id})"]`).first().click();
    await expect.poll(() => ctx.state.players.some((x) => x.id === id)).toBe(false);
    expect(courtOf(kv("current_session").assignments, id)).toBe(0);
  });
  test("Controls · markAbsentFromPlayers: from the Players tab, with a session running", async () => {
    const L = league(51016, "r1-partial"); await load(ctx, L);
    const id = L.current!.assignments[2][0], p = L.players.find((x) => x.id === id)!, c = courtOf(L.current!.assignments, id);
    await ctx.page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); });
    await ctx.page.locator(`[onclick="markAbsentFromPlayers(${id})"]`).first().click();
    await expect(toast()).toHaveText(`${p.name} marked absent — off Court ${p.current_court} tonight, one court down next week`);
    const cs = kv("current_session"); expect({ att: cs.attendance[id], seated: courtOf(cs.assignments, id), from: cs.absentFrom[id] }).toEqual({ att: "absent", seated: 0, from: p.current_court || c });
  });
  test("Controls · markAbsentFromPlayers: with no session running, the reason is given", async () => {
    const L = league(51017, "none"); await load(ctx, L);
    const p = L.players.find((x) => x.current_court > 0)!;
    await ctx.page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); });
    await ctx.page.locator(`[onclick="markAbsentFromPlayers(${p.id})"]`).first().click();
    await expect(toast()).toHaveText("No session is running. For next Tuesday, set their vote to “not coming” in Standings → RSVP.");
  });
  test("Controls · openAdminNote and saveAdminNote: a private note is saved on the player", async () => {
    const L = league(51018, "none"); await load(ctx, L);
    const p = L.players[0];
    await ctx.page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); });
    await ctx.page.locator(`[onclick="openAdminNote(${p.id})"]`).first().click();
    await ctx.page.locator("#admin-note-text").fill("Knee brace; may leave early");
    await ctx.page.locator("#modal.open").getByRole("button", { name: "💾 Save Note" }).click();
    await expect.poll(() => ctx.state.players.find((x) => x.id === p.id)!.admin_note).toBe("Knee brace; may leave early");
  });
  test("Controls · rebalancePlayerCourts: every player is re-seated four to a court by current court", async () => {
    const L = league(51019, "none"); await load(ctx, L);
    await ctx.page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); });
    const act = ctx.state.players.filter((p) => p.current_court > 0).sort((a, b) => a.current_court - b.current_court);
    await ctx.page.locator('button[onclick="rebalancePlayerCourts()"]').first().click();
    const fa = fillCourts(act.map((p) => p.id)), used = fa.slice(1).filter((x) => x.length).length;
    await expect(toast()).toHaveText(`Courts re-sorted — ${act.length} players across ${used} courts`);
    for (let c = 1; c <= 6; c++) for (const id of fa[c]) expect(ctx.state.players.find((p) => p.id === id)!.current_court, `player ${id}`).toBe(c);
  });
  test("Controls · saveAssignments: the Assign tab saves tonight's courts", async () => {
    const L = league(51020, "r1-partial", { regulars: 16, spares: 0, declineRate: 0, absentRate: 0 }); await load(ctx, L);
    const v0 = ctx.state.state["current_session"].version;
    await ctx.page.evaluate(() => { nav("admin"); showSec("admin", "a-assign"); });
    await ctx.page.locator('button[onclick="saveAssignments()"]').first().click();
    await expect(toast()).toHaveText("Assignments saved!");
    expect(ctx.state.state["current_session"].version).toBe(v0 + 1);
  });
  test("Controls · setView: the Courts page switches between the gym and the list", async () => {
    await load(ctx, league(51021, "r1-partial"));
    const page = ctx.page; await page.evaluate(() => nav("courts"));
    await page.getByRole("button", { name: "📋 List View" }).click();
    await expect(page.locator("#court-list-view")).toBeVisible(); await expect(page.locator("#court-gym-view")).toBeHidden();
    await page.getByRole("button", { name: "🏟️ Gym View" }).click();
    await expect(page.locator("#court-gym-view")).toBeVisible(); await expect(page.locator("#court-list-view")).toBeHidden();
  });
  test("Controls · showCourtAddPlayer: the gym view's add button offers every active player for that court", async () => {
    const L = league(51022, "r1-partial"); await load(ctx, L);
    const page = ctx.page; await page.evaluate(() => nav("courts"));
    expect(await reveal(page, 'button[onclick^="showCourtAddPlayer("]')).toBe(true);
    const btn = page.locator('button[onclick^="showCourtAddPlayer("]').first(), c = +(await btn.getAttribute("onclick"))!.match(/(\d+)/)![1];
    await btn.click();
    await expect(page.locator("#modal-title")).toHaveText(`Add Player to Court ${c}`);
    await expect(page.locator("#modal-player-sel option")).toHaveCount(1 + ctx.state.players.filter((p) => p.current_court > 0).length);
  });
  test("Controls · togglePlayerPresence: present, then absent, saved after the short pause", async () => {
    const L = league(51023, "r1-partial"); await load(ctx, L);
    const id = L.current!.assignments[3]?.[0] ?? L.current!.assignments[1][0];
    await ctx.page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); });
    const b = ctx.page.locator(`[onclick="togglePlayerPresence(${id})"]`).first();
    const start = kv("current_session").attendance?.[id];
    await b.click();
    const want = !start || start === "unmarked" ? "present" : start === "present" ? "absent" : undefined;
    await ctx.page.clock.runFor(1200);
    await expect.poll(() => kv("current_session").attendance?.[id]).toBe(want);
  });
  test("Controls · generateSeasonPDF: the season summary downloads as a PDF", async () => {
    await load(ctx, league(51024, "none", { sessions: 6 }));
    const page = ctx.page;
    expect(await reveal(page, 'button[onclick="generateSeasonPDF()"]')).toBe(true);
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.locator('button[onclick="generateSeasonPDF()"]').first().click()]);
    expect(dl.suggestedFilename()).toMatch(/\.pdf$/);
    expect(fs.readFileSync((await dl.path())!).subarray(0, 5).toString()).toBe("%PDF-");
  });
  test("Controls · handleAbsentAndReplace: nothing chosen, nothing changes, and the reason is given", async () => {
    const L = league(51025, "r1-partial"); await load(ctx, L);
    await ctx.page.evaluate(() => { nav("admin"); showSec("admin", "a-sess"); });
    const before = kv("current_session").assignments;
    await ctx.page.getByRole("button", { name: /Remove Absent/ }).click();
    await expect(toast()).toHaveText("Select an absent player");
    expect(kv("current_session").assignments).toEqual(before);
  });
});

test.describe("controls · player", () => {
  const ME = "controls.player@example.invalid";
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser, ME); });
  test.afterAll(async () => { await closeCtx(ctx); });
  const mine = (seed: number) => { const L: League = genLeague(seed, { ...variety(seed), live: "none" }); Object.assign(L.players[0], { email: ME, approved: true, waitlisted: false, membership_type: "regular", registered_at: "2026-09-03T00:00:00Z", current_court: 2 }); return L; };
  test("Controls · submitRSVP: a player answers 'I'm coming' on Home", async () => {
    const L = mine(51100); L.nowMs = Date.parse("2026-09-12T12:00:00-04:00"); await load(ctx, L);
    await ctx.page.evaluate(() => nav("home"));
    await ctx.page.locator('button[onclick="submitRSVP(true)"]').first().click();
    await expect.poll(() => ctx.state.rsvps.find((r) => r.player_id === L.players[0].id)?.response).toBe("coming");
  });
  test("Controls · setEmailReminders: a player turns reminder emails off", async () => {
    const L = mine(51101); L.nowMs = Date.parse("2026-09-12T12:00:00-04:00"); await load(ctx, L);
    await ctx.page.evaluate(() => nav("home"));
    const box = ctx.page.locator(".email-reminders-toggle").first();
    await box.uncheck();
    await expect(ctx.page.locator("#_t")).toHaveText("Reminders off");
    expect(ctx.state.players.find((p) => p.id === L.players[0].id)!.email_reminders).toBe(false);
  });
  test("Controls · enablePush: a browser that won't grant notifications says so", async () => {
    const L = mine(51102); L.nowMs = Date.parse("2026-09-12T12:00:00-04:00"); await load(ctx, L);
    expect(await reveal(ctx.page, 'button[onclick="enablePush()"]')).toBe(true);
    await ctx.page.locator('button[onclick="enablePush()"]').first().click();
    await expect(ctx.page.locator("#_t")).toHaveText(/^Notifications (are not available in this browser|stay off \(permission not granted\))$/);
    expect(ctx.state.pushSubs).toEqual([]);
  });
});

async function gate(browser: Browser) {
  const page = await browser.newPage(), s = freshState(); await installMock(page, s); page.on("dialog", (d) => d.accept()); await page.goto("/"); return { page, s };
}
test("Controls · checkPin: the organizer's second step without a code asks for one", async ({ browser }) => {
  const { page } = await gate(browser);
  await signIn(page, "christygeorge993@gmail.com");
  await page.click("#bnav-admin");
  await expect(page.locator("#admin-lock-msg")).toContainText(/authenticator|Enter the 6-digit/i);
  await page.locator('button[onclick="checkPin()"]').click();
  await expect(page.locator("#pin-err")).toHaveText("Enter the authenticator code");
  await page.close();
});
test("Controls · signInReset: 'Use a different email' goes back to the email box", async ({ browser }) => {
  const { page } = await gate(browser);
  await page.locator("#signin-email-input").fill("someone@example.invalid"); await page.locator("#signin-btn").click();
  await expect(page.locator("#signin-code-input")).toBeVisible();
  await page.locator('button[onclick="signInReset()"]').click();
  await expect(page.locator("#signin-email-input")).toBeVisible(); await expect(page.locator("#signin-code-input")).toBeHidden();
  await page.close();
});
test("Controls · showSignIn: 'Already registered? Sign in' signs out to the sign-in screen", async ({ browser }) => {
  const { page } = await gate(browser);
  await signIn(page, "christygeorge993+regular@gmail.com");
  await page.waitForFunction(() => !!_syncTimer);   // the post-sign-in load has finished and its redraws are done
  await page.evaluate(() => { clearInterval(_syncTimer); _syncTimer = null; nav("home"); });
  await expect(page.locator('button[onclick="showSignIn()"]')).toBeVisible();
  await page.locator('button[onclick="showSignIn()"]').first().click();
  await expect(page.locator("#invite-gate")).toBeVisible();
  await page.close();
});
