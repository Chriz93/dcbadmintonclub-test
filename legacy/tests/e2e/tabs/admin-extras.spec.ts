// Organizer extras the tab suites had not reached: private notes, editing a registration, adding a player from the court
// popup (a full court refuses without moving anyone), the sync-to-final-standings banner, withdrawing an invitation and the
// present / absent tag on the Players tab. 100 leagues.
import {manualMoveExpected} from "./manual-move-oracle";
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, NC, type GenOpts } from "./gen";
import { courtOf } from "./oracle";
import { kvOf } from "./checks";
import { adjustInput } from "./adjust-oracle";
import { reference } from "../../unit/adjust-reference.mjs";

type Act = "note" | "edit" | "court-add" | "sync" | "withdraw" | "presence";
const ACTS: [Act, Partial<GenOpts>][] = [["note", {}], ["note", { live: "r1-partial" }], ["edit", {}], ["edit", { pending: 2 }], ["court-add", { live: "r1-partial" }],
  ["court-add", { live: "none" }], ["sync", { live: "none", sessions: 3 }], ["withdraw", {}], ["presence", { live: "r2-partial" }], ["presence", { live: "none" }]];
let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
for (let i = 0; i < 100; i++) {
  const [act, extra] = ACTS[i % ACTS.length], base = variety(i + 18);
  const opts: GenOpts = { ...base, regulars: Math.max(6, base.regulars ?? 6), ...(i % 7 === 3 ? { regulars: 26, declineRate: 0, absentRate: 0 } : {}), ...extra };
  test(`Admin extras ${String(i + 1).padStart(3, "0")} · ${act} · ${genLeague(28000 + i, opts).title}`, async () => {
    const L = genLeague(28000 + i, { ...opts, dates: ctx.dates });
    const r = rng(600 + i);
    if (act === "sync") {   // some players' stored courts drift from last week's final standings
      const fa = L.sessions.at(-1)!.finalAssignments!, onFinal = [1, 2, 3, 4, 5, 6].flatMap((c) => (fa[c] || []).map((id) => [id, c]));
      for (const [id, c] of onFinal.filter(() => r() < 0.3).slice(0, 3).concat(onFinal.length ? [onFinal[0]] : [])) { const p = L.players.find((x) => x.id === id)!; p.current_court = (c % NC) + 1; }
    }
    if (act === "withdraw") { L.invitations[`waiting.${i}@example.invalid`] = "regular"; L.invitations[`spare.${i}@example.invalid`] = "spare"; }
    await load(ctx, L);
    const page = ctx.page, toast = page.locator("#_t"), cur = L.current, db = (id: number) => ctx.state.players.find((p) => p.id === id)!;
    const adminTab = async (name: RegExp) => { await page.evaluate(() => nav("admin")); await page.locator("#admin-panel .ptab").filter({ hasText: name }).click(); };
    const active = L.players.filter((p) => p.current_court > 0).sort((a, b) => a.current_court - b.current_court);
    const rows = page.locator("#a-pl-list .card > div:has(> .pl-num)");

    if (act === "note") {
      if (!active.length) return;
      const k = Math.floor(r() * active.length), p = active[k], text = `Knee brace — may leave early (case ${i + 1})`;
      await adminTab(/^👥 Players$/);
      await rows.nth(k).locator(".notes-btn").click();
      await expect(page.locator("#modal-title"), "title shows the name as written").toHaveText(`📝 Admin Note — ${p.name}`);
      await expect(page.locator("#admin-note-text")).toHaveValue("");
      await page.locator("#admin-note-text").fill(`  ${text}  `);
      await page.getByRole("button", { name: "💾 Save Note" }).click();
      await expect(toast).toHaveText("Note saved!");
      expect(db(p.id).admin_note, "saved, trimmed").toBe(text);
      await expect(rows.nth(k).locator(".notes-btn")).toHaveText("📝");
      await rows.nth(k).locator(".notes-btn").click();
      await expect(page.locator("#admin-note-text")).toHaveValue(text);
      await page.getByRole("button", { name: "🗑 Clear Note" }).click();
      await expect(toast).toHaveText("Note cleared");
      expect(db(p.id).admin_note).toBe("");
      await expect(rows.nth(k).locator(".notes-btn")).toHaveText("📋");
    } else if (act === "edit") {
      const regs = L.players.filter((p) => p.sig && p.sig !== "admin" && !p.waitlisted);
      const p = regs[Math.floor(r() * regs.length)];
      await adminTab(/^📋 Registered/);
      await page.locator("#sec-a-reg div[style*='padding:12px']").filter({ hasText: p.email }).first().getByRole("button", { name: "✏️ Edit" }).click();
      await expect(page.locator("#modal-title")).toHaveText(`Edit Registration — ${p.name}`);
      for (const [id, v] of [["edit-name", p.name], ["edit-email", p.email], ["edit-phone", p.phone], ["edit-emergency", p.emergency], ["edit-medical", p.medical]]) await expect(page.locator(`#${id}`), `${id} pre-filled`).toHaveValue(v);
      if (i % 4 === 2) {
        await page.locator(i % 8 === 2 ? "#edit-name" : "#edit-email").fill("  ");
        await page.getByRole("button", { name: "Save Changes" }).click();
        await expect(toast).toHaveText("Name and email required");
        expect(db(p.id).name).toBe(p.name);
        await page.evaluate(() => closeModal());
        return;
      }
      const phone = `613-555-${7000 + i}`, medical = i % 3 ? "" : "Allergic to latex";
      await page.locator("#edit-phone").fill(phone);
      await page.locator("#edit-medical").fill(medical);
      await page.getByRole("button", { name: "Save Changes" }).click();
      await expect(toast).toHaveText("Registration updated!");
      expect({ name: db(p.id).name, email: db(p.id).email, phone: db(p.id).phone, medical: db(p.id).medical }).toEqual({ name: p.name, email: p.email, phone, medical });
      await expect(page.locator("#sec-a-reg div[style*='padding:12px']").filter({ hasText: p.email }).first()).toContainText(`📞 ${phone}`);
    } else if (act === "court-add") {
      if (!active.length) return;
      const c = 1 + (i % NC), pick = active[Math.floor(r() * active.length)];
      await page.evaluate(() => nav("courts"));
      await page.locator(`#court-gym-view .gym-court[onclick="showCourtDetail(${c})"]`).click();
      await page.locator("#modal-body").getByRole("button", { name: "+ Add Player to Court" }).click();
      await expect(page.locator("#modal-title")).toHaveText(`Add Player to Court ${c}`);
      expect((await page.locator("#modal-player-sel option").allTextContents()).slice(1), "players holding a court").toEqual(ctx.state.players.filter((p) => p.current_court > 0).map((p) => `${p.name} (C${p.current_court})`));
      await page.locator("#modal-player-sel").selectOption(String(pick.id));
      await page.getByRole("button", { name: `Add to Court ${c}` }).click();
      const want=manualMoveExpected(L,pick.id,c);
      if(want.message)await expect(toast).toContainText(want.message);
      if(cur){await expect.poll(()=>kvOf(ctx,"current_session").assignments).toEqual(want.lineup);expect(await page.evaluate(()=>S.current.assignments)).toEqual(want.lineup);}
    } else if (act === "sync") {
      const last = L.sessions.at(-1)!, fa = last.finalAssignments!;
      const drift = [1, 2, 3, 4, 5, 6].flatMap((c) => (fa[c] || []).map((id) => ({ id, c }))).filter(({ id, c }) => L.players.find((p) => p.id === id) && L.players.find((p) => p.id === id)!.current_court !== c);
      await adminTab(/^👥 Players$/);
      const banner = page.locator("#a-pl-court-summary .alert");
      await expect(banner).toContainText(`${drift.length} player${drift.length > 1 ? "s" : ""} need updating`);
      await banner.getByRole("button", { name: `↳ Sync to Session ${last.number} Final Standings` }).click();
      await expect(toast).toHaveText(`✓ Synced ${drift.length} player court${drift.length > 1 ? "s" : ""} to Session ${last.number}`);
      for (const { id, c } of drift) expect(db(id).current_court, `${L.players.find((p) => p.id === id)!.name} back on Court ${c}`).toBe(c);
      await expect(banner, "banner gone once in sync").toHaveCount(0);
    } else if (act === "withdraw") {
      await adminTab(/^📋 Registered/);
      const card = page.locator("#invite-card"), inv = Object.entries(ctx.state.invitations);
      const lines = (await card.locator("div:has(> span + button)").evaluateAll((ds) => ds.map((d) => (d.querySelector("span")!.textContent || "").replace(/\s+/g, " ").trim())));
      expect(lines, "every invitation, with registered / waiting").toEqual(inv.map(([email, type]) => `${email} ${type} ${L.players.some((p) => p.email.toLowerCase() === email) ? "registered" : "waiting"}`));
      const k = Math.floor(r() * inv.length), [email] = inv[k];
      const withdraw = card.locator("div:has(> span + button)").nth(k).getByRole("button", { name: "✕" });
      await expect(withdraw, "✕ calls deleteInvitation for this address").toHaveAttribute("onclick", "deleteInvitation(this.dataset.email)");
      await expect(withdraw).toHaveAttribute("data-email", email);
      await withdraw.click();
      await expect(toast).toHaveText("Invitation withdrawn");
      expect(Object.keys(ctx.state.invitations), `${email} withdrawn`).not.toContain(email);
      await expect(card.locator("div:has(> span + button)")).toHaveCount(inv.length - 1);
    } else if (act === "presence") {
      if (!active.length) return;
      const k = Math.floor(r() * active.length), p = active[k], tag = rows.nth(k).locator("span[title='Toggle present/absent']");
      let st: string | undefined = cur ? cur.attendance[p.id] : undefined;
      const show = (s?: string) => (s === "absent" ? "❌" : s === "present" ? "✅" : "—");
      await adminTab(/^👥 Players$/);
      await expect(tag).toHaveText(show(st));
      for (let n = 0; n < 1 + (i % 3); n++) {
        if (cur) {
          // p57: during a session "present" means on a court. A seated, unmarked player becomes present; a present player
          // is marked absent through the court engine; a player without a court (or absent) is seated through it and is
          // present. When the engine refuses (reference model), nothing changes.
          const cs = kvOf(ctx, "current_session"), seatedNow = courtOf(cs.assignments, p.id) > 0, was = cs.attendance?.[p.id];
          const want = seatedNow && was === "present" ? "absent" : "present";
          const viaEngine = !seatedNow || was === "present" || was === "absent";
          const from = courtOf(cs.assignments, p.id) || p.current_court || 6, base = adjustInput(cs);
          const ok = !viaEngine || (reference({ ...base, absent: want === "absent" ? [p.id] : [], returning: want === "present" ? [{ id: p.id, court: from }] : [], late: [] }) as { ok: boolean }).ok;
          if (ok) st = want;
        } else st = !st || st === "unmarked" ? "present" : st === "present" ? "absent" : undefined;
        await tag.click();
        await expect(tag, cur ? "during a session the tag follows the courts: — → ✅ → ❌ → ✅" : "before the session the tag cycles — / ✅ / ❌").toHaveText(show(st));
      }
      await expect.poll(() => (cur ? kvOf(ctx, "current_session")?.attendance?.[p.id] : kvOf(ctx, "pre_session_attendance")?.[p.id]), { message: "saved after the short pause", timeout: 8000 }).toBe(st);
    }
  });
}
