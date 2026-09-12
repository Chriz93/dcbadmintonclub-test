// Admin → 📇 Past Players: everyone from earlier seasons (organizer only) with their details, the search box, and
// "Invite back" — the usual invitation with their membership; a player already registered this season, one already
// invited and one without an email show a tag instead of the button. 40 leagues.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng } from "./gen";

type Past = { id: number; season_label: string; name: string; email: string | null; phone: string; emergency: string; medical: string; membership_type: string; current_court: number;
  highest_court: number; season_wins: number; season_losses: number; games_played: number; no_show_count: number; paid: boolean; waiver_signed: boolean; sig: string;
  declared_payment: string; admin_note: string; registered_at: string | null; joined_at: string; archived_at: string };
let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); ctx.state.pastPlayers = []; });
for (let i = 0; i < 40; i++) {
  const opts = { ...variety(i + 40), regulars: 4 + (i % 9) };
  test(`Past players ${String(i + 1).padStart(3, "0")} · ${genLeague(31000 + i, opts).title}`, async () => {
    const L = genLeague(31000 + i, { ...opts, dates: ctx.dates }), r = rng(900 + i);
    const past: Past[] = Array.from({ length: 6 + (i % 7) }, (_, k) => ({
      id: 5000 + k, season_label: "2025-26", name: `Past ${String.fromCharCode(65 + ((k * 7 + i) % 26))}${k} Player`, email: k === 2 ? null : `past.${i}.${k}@example.invalid`,
      phone: `613-555-${1000 + k}`, emergency: `Kin ${k}`, medical: k % 3 === 0 ? "Asthma" : "", membership_type: k % 4 === 3 ? "spare" : "regular",
      current_court: 1 + (k % 6), highest_court: 1, season_wins: k * 3, season_losses: k, games_played: k * 4, no_show_count: 0, paid: true, waiver_signed: true,
      sig: "data:sig", declared_payment: "", admin_note: "", registered_at: null, joined_at: "2025-09-01T00:00:00Z", archived_at: "2026-09-11T00:00:00Z" }));
    const withEmail = L.players.find((p) => p.email);
    if (withEmail) past[0].email = withEmail.email;          // came back and registered this season already
    L.invitations[past[1].email!] = "regular";                // already invited
    ctx.state.pastPlayers = structuredClone(past) as never;
    await load(ctx, L);
    const page = ctx.page, toast = page.locator("#_t"), sec = page.locator("#sec-a-past"), rows = sec.locator(".past-row");
    await page.evaluate(() => nav("admin"));
    await page.getByRole("button", { name: "📇 Past Players" }).click();
    const sorted = [...past].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    await expect(sec.locator(".card-title")).toHaveText(`📇 Past Players (${past.length})`);
    expect((await rows.locator("strong").allTextContents()), "every past player, by name").toEqual(sorted.map((p) => p.name));
    const rowOf = (p: Past) => rows.filter({ has: page.locator("strong", { hasText: new RegExp(`^${p.name}$`) }) });
    const stateOf = (p: Past) => !p.email ? "no email" : withEmail && p.email === withEmail.email ? "registered" : L.invitations[p.email] ? "invited" : "button";
    for (const p of past) {
      const row = rowOf(p), st = stateOf(p);
      if (st === "button") await expect(row.getByRole("button", { name: "✉️ Invite back" }), `${p.name} can be invited back`).toBeVisible();
      else await expect(row.locator(".flex-between > .tag"), `${p.name}: ${st}`).toHaveText(st);
    }
    // One row in detail: contact, medical note and last season's record.
    const p = past[Math.floor(r() * past.length)], row = rowOf(p);
    await expect(row.locator(".past-contact")).toHaveText([p.email ? `📧 ${p.email}` : "", `📞 ${p.phone}`, `🆘 ${p.emergency}`].filter(Boolean).join(" · "));
    if (p.medical) await expect(row).toContainText(`🩺 ${p.medical}`);
    await expect(row.locator(".past-record")).toHaveText(`2025-26 · last court ${p.current_court} · ${p.season_wins}W ${p.season_losses}L in ${p.games_played} games`);
    // Search by part of a name, an email or a phone number.
    const target = past[3], term = [target.name.split(" ")[1], target.email!, target.phone][i % 3];
    await sec.locator("#past-q").fill(term);
    expect((await rows.locator("strong").allTextContents()), `search "${term}"`).toEqual(sorted.filter((x) => [x.name, x.email, x.phone].some((v) => String(v || "").toLowerCase().includes(term.toLowerCase()))).map((x) => x.name));
    await expect(sec.locator("#past-q"), "typing keeps focus in the search box").toBeFocused();
    await sec.locator("#past-q").fill("zz-no-such-player");
    await expect(sec).toContainText("No past player matches.");
    await sec.locator("#past-q").fill("");
    // Invite one back: the usual invitation, with their membership; the row then shows "invited".
    const invitable = past.filter((x) => stateOf(x) === "button"), pick = invitable[Math.floor(r() * invitable.length)];
    await rowOf(pick).getByRole("button", { name: "✉️ Invite back" }).click();
    await expect(toast).toHaveText(`Invited ${pick.name} back as ${pick.membership_type}. They sign in with ${pick.email} and register.`);
    expect(ctx.state.invitations[pick.email!], "invitation saved with their membership").toBe(pick.membership_type);
    await expect(rowOf(pick).locator(".flex-between > .tag")).toHaveText("invited");
    await expect(page.locator("#invite-card"), "the Registered tab lists it too").toContainText(pick.email!);
  });
}
