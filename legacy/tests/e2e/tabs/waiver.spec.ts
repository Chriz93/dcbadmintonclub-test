// Waiver records (L20, p38): registration shows the exact current wording and records who accepted which version,
// when and how; a registered player is asked to accept a newer version; the organizer downloads readable records and a
// CSV; nobody else can read them. Expectations come from the wording files and the rules in L20, not from the app.
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety, type League } from "./gen";
import { wording, sha256, TITLES, waiverVersions, type Acceptance } from "../mock-waiver";

const V1 = "2026-09-v1", V2 = "2026-09-v2";
const REF = /^REG-\d+-\d{8}T\d{6}Z$/;
const clearWaiverCache = (page: Page) => page.evaluate(() => { S.waiver = null; S.waiverVersions = null; });
async function download(page: Page, click: () => Promise<unknown>) {
  const [dl] = await Promise.all([page.waitForEvent("download"), click()]);
  return { name: dl.suggestedFilename(), text: fs.readFileSync((await dl.path())!, "utf8") };
}
/** One acceptance record as the organizer's file must describe it. */
function recordBlock(a: Acceptance, i: number, n: number, leagueTime: string, offset: string) {
  return [
    `ACCEPTANCE ${i} OF ${n}`,
    `Action: ${a.action === "registration" ? "accepted on the registration form (ticked the acceptance box and typed a signature)" : "accepted an updated version on the site (ticked the acceptance box and typed a signature)"}`,
    `Registration reference: ${a.registration_ref}`, `Waiver version: ${a.waiver_version} — ${TITLES[a.waiver_version]}`, `Wording fingerprint (SHA-256): ${a.waiver_sha256}`,
    `Accepted at: ${a.accepted_at} (UTC) = ${leagueTime}`, `Participant's device time zone: ${a.client_timezone || "not reported"} (${offset})`,
    `Accepted by: ${a.age_declaration === "guardian" ? `a parent or legal guardian, for the participant ${a.minor_name}` : "the participant (18 or older)"}`,
    `Typed signature: "${a.typed_signature}"`, `Name and email at acceptance: ${a.participant_name} <${a.email}>`,
    `Photos and video: ${a.media_consent === true ? "consent given (separate optional box ticked)" : a.media_consent === false ? "not given (separate optional box left unticked)" : "no separate choice was offered with this wording"}`,
    `Device: ${a.user_agent || "not reported"}`,
    "Wording check: the fingerprint matches the stored wording below", "", `WAIVER WORDING, EXACTLY AS SHOWN (version ${a.waiver_version}):`, "", wording(a.waiver_version),
  ];
}
const leagueTime = (page: Page, iso: string) => page.evaluate((x) => tzTime(x), iso);
const offsetText = (m: number | null) => (m == null ? "not reported" : `UTC${m < 0 ? "−" : "+"}${String(Math.floor(Math.abs(m) / 60)).padStart(2, "0")}:${String(Math.abs(m) % 60).padStart(2, "0")}`);

// ═══ A. Registration: the wording on screen, and the record it leaves ═══
test.describe("waiver · registration", () => {
  const REG = "waiver.registrant@example.invalid";
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser, REG); });
  test.afterAll(async () => { await closeCtx(ctx); });
  type Story = "adult" | "adult-photos" | "guardian" | "guardian-no-name" | "short-signature" | "no-tick" | "v1-current" | "wording-changed" | "version-changed" | "returning" | "spare";
  const STORIES: Story[] = ["adult", "adult-photos", "guardian", "guardian-no-name", "short-signature", "no-tick", "v1-current", "wording-changed", "version-changed", "returning", "spare"];
  for (let i = 0; i < 66; i++) {
    const story = STORIES[i % STORIES.length], opts = variety(i + 40);
    test(`Waiver registration ${String(i + 1).padStart(3, "0")} · ${story} · ${genLeague(41000 + i, opts).title}`, async () => {
      const L: League & { waiverAcceptances?: Acceptance[] } = genLeague(41000 + i, { ...opts, dates: ctx.dates });
      L.invitations[REG] = story === "spare" ? "spare" : "regular";
      const back = story === "returning" ? { ...L.players[0], id: 900 + i, name: "Rae Returning", email: REG, approved: false, waitlisted: false, current_court: 0, highest_court: 0, registered_at: "2025-09-01T00:00:00Z", user_id: null } : null;
      if (back) L.players.push(back);
      await load(ctx, L);
      const page = ctx.page, toast = page.locator("#_t"), s = ctx.state;
      if (story === "v1-current") s.waiverVersions = waiverVersions(V1);
      await clearWaiverCache(page);
      await page.evaluate(() => { regData = {}; goRS(1); for (const id of ["r-name", "r-phone", "r-emergency", "r-medical", "r-sig", "r-sig-lf", "wv-minor"]) { const e = document.getElementById(id) as HTMLInputElement | null; if (e) e.value = ""; } for (const id of ["w1", "lf-all", "wv-media"]) { const e = document.getElementById(id) as HTMLInputElement | null; if (e) e.checked = false; } (document.getElementById("wv-age-adult") as HTMLInputElement).checked = true; wvAgeChanged(); });
      await page.evaluate(() => nav("register"));
      const cur = story === "v1-current" ? V1 : V2, name = back ? back.name : `Wren Waiver ${i + 1}`;
      await page.locator(story === "spare" ? "#mt-spare-box" : "#mt-regular-box").click();
      if (!back) { await page.locator("#r-name").fill(name); await page.locator("#r-phone").fill("613-555-0150"); await page.locator("#r-emergency").fill("Ash Waiver, 613-555-0151"); }
      await page.locator("#rs1").getByRole("button", { name: "Continue →" }).click();
      await expect(page.locator("#rs2")).toHaveClass(/active/);
      // The wording shown is the current version, exactly (every section heading and the notice at the top).
      await expect(page.locator("#waiver-meta")).toHaveText(`Version ${cur} ${TITLES[cur]}`);
      const shown = norm(await page.locator("#waiver-box").innerText());
      for (const h of wording(cur).split("\n").filter((l) => l.startsWith("## "))) expect(shown, `heading ${h}`).toContain(h.slice(3));
      if (cur === V2) expect(shown).toContain("PLEASE READ CAREFULLY — THIS AGREEMENT AFFECTS YOUR LEGAL RIGHTS.");
      await expect(page.locator("#wv-media-row"), "the photo box appears only when the wording makes it optional").toBeVisible({ visible: cur === V2 });
      await expect(page.locator("#wv-minor-row")).toBeHidden();
      await expect(page.locator("label[for=w1]")).toHaveText(`I have read this waiver, I understand it, and I accept it (version ${cur}).`);
      const guardian = story === "guardian" || story === "guardian-no-name";
      if (guardian) { await page.locator("#wv-age-guardian").check(); await expect(page.locator("#wv-minor-row")).toBeVisible(); if (story === "guardian") await page.locator("#wv-minor").fill("Kit Waiver"); }
      if (story === "adult-photos") await page.locator("#wv-media").check();
      if (story !== "no-tick") await page.locator("#w1").check();
      await page.locator("#r-sig").fill(story === "short-signature" ? "W" : name);
      await page.locator("#reg-btn").click();
      if (story === "no-tick") { await expect(toast).toHaveText("Please tick the box to accept the waiver to continue"); await expect(page.locator("#rs2")).toHaveClass(/active/); return; }
      if (story === "guardian-no-name") { await expect(toast).toHaveText("Enter the full name of the participant under 18"); await expect(page.locator("#rs2")).toHaveClass(/active/); return; }
      if (story === "short-signature") { await expect(toast).toHaveText("Type your full name (2 to 80 characters) as your signature"); await expect(page.locator("#rs2")).toHaveClass(/active/); return; }
      await expect(page.locator("#rs3")).toHaveClass(/active/);
      if (story === "wording-changed") { const v = s.waiverVersions!.find((x) => x.version === V2)!; v.body += "\nA sentence added after the page loaded."; v.sha256 = sha256(v.body); }
      if (story === "version-changed") s.waiverVersions!.forEach((v) => (v.is_current = v.version === V1));
      await page.locator("#lf-all").check(); await page.locator("#r-sig-lf").fill(name);
      const before = (s.waiverAcceptances || []).length;
      await page.locator("#reg-btn-lf").click();
      if (story === "wording-changed" || story === "version-changed") {
        await expect(toast).toHaveText(story === "wording-changed" ? `Registration error: The waiver text on your screen does not match version ${V2} — reload the page and try again` : "Registration error: The waiver was updated while you were registering — reload the page and read the current version");
        expect(s.waiverAcceptances!.length, "nothing recorded").toBe(before);
        expect(s.players.some((p) => p.email === REG && p.name === name), "no registration saved").toBe(!!back);
        await expect(page.locator("#rs2"), "back to the waiver, which now shows the new wording").toHaveClass(/active/);
        await expect(page.locator("#waiver-meta")).toHaveText(story === "version-changed" ? `Version ${V1} ${TITLES[V1]}` : `Version ${V2} ${TITLES[V2]}`);
        if (story === "wording-changed") await expect(page.locator("#waiver-box")).toContainText("A sentence added after the page loaded.");
        return;
      }
      await expect(page.locator("#rs4")).toHaveClass(/active/);
      const rec = s.waiverAcceptances!.at(-1)!, player = s.players.find((p) => p.email === REG)!;
      const [tz, offset] = await page.evaluate(() => [Intl.DateTimeFormat().resolvedOptions().timeZone, -new Date().getTimezoneOffset()] as [string, number]);
      expect(s.waiverAcceptances!.length, "one new record").toBe(before + 1);
      expect(rec, "the record names the exact wording, the signer and how they accepted").toMatchObject({
        player_id: back ? back.id : player.id, email: REG, participant_name: name, typed_signature: name, waiver_version: cur, waiver_sha256: sha256(wording(cur)),
        client_timezone: tz, client_utc_offset_minutes: offset, action: "registration", age_declaration: guardian ? "guardian" : "adult", minor_name: guardian ? "Kit Waiver" : "",
        media_consent: cur === V1 ? null : story === "adult-photos",
      });
      expect(rec.registration_ref).toMatch(REF); expect(rec.registration_ref.startsWith(`REG-${rec.player_id}-`)).toBe(true);
      expect(rec.user_agent.length).toBeGreaterThan(0); expect(Date.parse(rec.accepted_at)).not.toBeNaN();
    });
  }
});

// ═══ B. A registered player and a newer version ═══
test.describe("waiver · updated version on Home", () => {
  const ME = "waiver.player@example.invalid";
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser, ME); });
  test.afterAll(async () => { await closeCtx(ctx); });
  type Kind = "older-only" | "none" | "current" | "not-this-season" | "accept-adult" | "accept-guardian" | "accept-photos" | "no-tick" | "short-sig" | "guardian-no-name";
  const KINDS: Kind[] = ["older-only", "none", "current", "not-this-season", "accept-adult", "accept-guardian", "accept-photos", "no-tick", "short-sig", "guardian-no-name"];
  for (let i = 0; i < 40; i++) {
    const kind = KINDS[i % KINDS.length], opts = variety(i + 60);
    test(`Waiver update ${String(i + 1).padStart(3, "0")} · ${kind} · ${genLeague(42000 + i, opts).title}`, async () => {
      const L: League & { waiverAcceptances?: Acceptance[] } = genLeague(42000 + i, { ...opts, dates: ctx.dates });
      const me = { ...L.players[0], email: ME, name: "Moe Member", registered_at: kind === "not-this-season" ? "2025-09-02T00:00:00Z" : "2026-09-03T00:00:00Z", approved: true, user_id: null };
      L.players[0] = me;
      const uid = ctx.state.users[ME], v = waiverVersions();
      const rec = (ver: string, id: number): Acceptance => ({ id, player_id: me.id, user_id: uid, email: ME, participant_name: me.name, typed_signature: me.name, waiver_version: ver, waiver_sha256: v.find((x) => x.version === ver)!.sha256, accepted_at: "2026-09-03T00:00:00.000Z", client_timezone: "America/Toronto", client_utc_offset_minutes: -240, action: "registration", age_declaration: "adult", minor_name: "", media_consent: null, registration_ref: `REG-${me.id}-20260903T000000Z`, user_agent: "t" });
      L.waiverAcceptances = kind === "none" || kind === "not-this-season" ? [] : kind === "current" ? [rec(V2, 1)] : [rec(V1, 1)];
      await load(ctx, L);
      const page = ctx.page, card = page.locator("#waiver-update-card"), toast = page.locator("#_t");
      await clearWaiverCache(page);
      await page.evaluate(() => nav("home"));
      if (kind === "current" || kind === "not-this-season") { await expect(card, "no prompt").toHaveCount(0); return; }
      await expect(card).toContainText(kind === "none" ? `Please read the league waiver (version ${V2}) and accept it, so your acceptance is on record.` : `The league waiver has a new version (${V2}). Please read it and accept it.`);
      if (kind === "older-only" || kind === "none") { expect(ctx.state.waiverAcceptances!.length, "nothing recorded just by showing the card").toBe(L.waiverAcceptances.length); return; }
      await card.getByRole("button", { name: "Read and accept" }).click();
      const modal = page.locator("#modal.open");
      await expect(modal).toContainText(`Waiver — version ${V2}`);
      await expect(modal.locator("#wva-box")).toContainText("Release and waiver of claims");
      if (kind === "accept-guardian" || kind === "guardian-no-name") await modal.locator("input[name=wva-age][value=guardian]").check();
      if (kind === "accept-guardian") await modal.locator("#wva-minor").fill("Mia Member");
      if (kind === "accept-photos") await modal.locator("#wva-media").check();
      if (kind !== "no-tick") await modal.locator("#wva-ok").check();
      await modal.locator("#wva-sig").fill(kind === "short-sig" ? "M" : "Moe Member");
      await modal.locator("#wva-btn").click();
      const n0 = L.waiverAcceptances.length;
      if (kind === "no-tick" || kind === "short-sig" || kind === "guardian-no-name") {
        await expect(toast).toHaveText(kind === "no-tick" ? "Please tick the box to accept the waiver" : kind === "short-sig" ? "Type your full name (2 to 80 characters) as your signature" : "Enter the full name of the participant under 18");
        expect(ctx.state.waiverAcceptances!.length).toBe(n0); return;
      }
      await expect(toast).toHaveText(`Thank you — your acceptance of waiver version ${V2} is recorded`);
      const r = ctx.state.waiverAcceptances!.at(-1)!;
      expect(ctx.state.waiverAcceptances!.length).toBe(n0 + 1);
      expect(r).toMatchObject({ player_id: me.id, action: "updated-version", waiver_version: V2, waiver_sha256: sha256(wording(V2)), typed_signature: "Moe Member", age_declaration: kind === "accept-guardian" ? "guardian" : "adult", minor_name: kind === "accept-guardian" ? "Mia Member" : "", media_consent: kind === "accept-photos" });
      await expect(card, "the prompt goes away once accepted").toHaveCount(0);
      // Accepting the same version again is refused by the database.
      const again = await page.evaluate(async (w) => { try { await rpc("accept_waiver", { p_version: w.v, p_sha: w.h, p_sig: "Moe Member" }); return "accepted"; } catch (e) { return (e as Error).message; } }, { v: V2, h: sha256(wording(V2)) });
      expect(again).toBe(`You have already accepted waiver version ${V2}`);
    });
  }
});

// ═══ C. The organizer's Waivers tab and its downloads ═══
test.describe("waiver · organizer records", () => {
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
  test.afterAll(async () => { await closeCtx(ctx); });
  type Kind = "record-one" | "record-history" | "record-none" | "record-guardian" | "csv" | "csv-tricky" | "wording-v1" | "wording-v2" | "make-current" | "orphan" | "export-button" | "summary";
  const KINDS: Kind[] = ["record-one", "record-history", "record-none", "record-guardian", "csv", "csv-tricky", "wording-v1", "wording-v2", "make-current", "orphan", "export-button", "summary"];
  for (let i = 0; i < 72; i++) {
    const kind = KINDS[i % KINDS.length], opts = { ...variety(i + 80), regulars: 6 + (i % 9) };
    test(`Waiver records ${String(i + 1).padStart(3, "0")} · ${kind} · ${genLeague(43000 + i, opts).title}`, async () => {
      const L: League & { waiverAcceptances?: Acceptance[] } = genLeague(43000 + i, { ...opts, dates: ctx.dates });
      const reg = L.players.filter((p) => String(p.registered_at) >= "2026-09-01"), v = waiverVersions();
      const target = reg[i % Math.max(1, reg.length)] || L.players[0];
      if (target && String(target.registered_at) < "2026-09-01") target.registered_at = "2026-09-04T01:02:03Z";
      const mk = (id: number, p: typeof target, ver: string, extra: Partial<Acceptance> = {}): Acceptance => ({ id, player_id: p.id, user_id: null, email: p.email, participant_name: p.name, typed_signature: p.name, waiver_version: ver, waiver_sha256: v.find((x) => x.version === ver)!.sha256, accepted_at: `2026-09-0${1 + (id % 8)}T1${id % 10}:0${id % 6}:00.000Z`, client_timezone: id % 2 ? "America/Toronto" : "America/Vancouver", client_utc_offset_minutes: id % 2 ? -240 : -420, action: "registration", age_declaration: "adult", minor_name: "", media_consent: ver === V2 ? id % 3 === 0 : null, registration_ref: `REG-${p.id}-2026090${1 + (id % 8)}T1${id % 10}0${id % 6}00Z`, user_agent: `agent ${id}`, ...extra });
      const others = L.players.filter((p) => p.id !== target.id && String(p.registered_at) >= "2026-09-01").slice(0, 4).map((p, k) => mk(10 + k, p, V2));
      L.waiverAcceptances = kind === "record-none" ? others : kind === "record-history" ? [mk(1, target, V1), mk(2, target, V2, { action: "updated-version", media_consent: true }), ...others]
        : kind === "record-guardian" ? [mk(1, target, V2, { age_declaration: "guardian", minor_name: "Tiny Tester", media_consent: false }), ...others]
        : kind === "csv-tricky" ? [mk(1, target, V2, { participant_name: `=HYPERLINK("x"), "Quoted", Name`, typed_signature: "+1 sig", user_agent: "agent, with comma\nnewline" }), ...others]
        : kind === "orphan" ? [mk(1, { ...target, id: 99999, email: "gone.person@example.invalid", name: "Gone Person" } as typeof target, V2, { player_id: null }), ...others]
        : [mk(1, target, V2), ...others];
      await load(ctx, L);
      const page = ctx.page, toast = page.locator("#_t"), acc = ctx.state.waiverAcceptances!;
      await clearWaiverCache(page);
      await page.evaluate(() => nav("admin"));
      if (kind === "export-button") {
        await page.getByRole("button", { name: "👥 Players" }).click();
        const tag = page.locator(`#sec-a-pl .tag[onclick="exportWaiver(${target.id})"]`);
        if (!(await tag.count())) { const f = await download(page, () => page.evaluate((id) => exportWaiver(id), target.id)); expect(f.text).toContain("WAIVER ACCEPTANCE RECORD"); return; }
        const f = await download(page, () => tag.first().click());
        expect(f.text, "the Players export is the acceptance record").toContain("MAPLEWOOD LADDER LEAGUE (DC BADMINTON CLUB) — WAIVER ACCEPTANCE RECORD");
        expect(f.text, "not the old paraphrase of today's terms").not.toContain("TERMS AGREED TO");
        return;
      }
      await page.locator("#tab-a-wv").click();
      const sec = page.locator("#sec-a-wv");
      await expect(sec.locator(".wv-ver-row")).toHaveCount(2);
      await expect(sec.locator(`.wv-ver-row[data-version="${V2}"] .tag`, { hasText: /^current$/ })).toHaveCount(1);
      await expect(sec.locator(`.wv-ver-row[data-version="${V1}"] .tag`, { hasText: /^current$/ })).toHaveCount(0);
      await expect(sec.locator(`.wv-ver-row[data-version="${V2}"]`).getByRole("button", { name: "Make current" }), "the current version has no Make current button").toHaveCount(0);
      for (const ver of [V1, V2]) { const n = acc.filter((a) => a.waiver_version === ver).length; await expect(sec.locator(`.wv-ver-row[data-version="${ver}"] .wv-sub`)).toContainText(`SHA-256 ${sha256(wording(ver)).slice(0, 16)}… · ${n} acceptance${n === 1 ? "" : "s"}`); }
      const players = L.players.filter((p) => String(p.registered_at) >= "2026-09-01" || acc.some((a) => a.player_id === p.id));
      if (kind === "summary") {
        const onCur = players.filter((p) => acc.some((a) => a.player_id === p.id && a.waiver_version === V2)).length;
        await expect(sec.locator("#wv-summary")).toHaveText(`Current version ${V2} · ${onCur} of ${players.length} registered player${players.length === 1 ? " has" : "s have"} accepted it`);
        await expect(sec.locator(".wv-row[data-player]")).toHaveCount(players.length);
        for (const p of players) { const list = acc.filter((a) => a.player_id === p.id); await expect(sec.locator(`.wv-row[data-player="${p.id}"] .wv-sub`)).toContainText(list.length ? `Version ${list.at(-1)!.waiver_version}` : "No acceptance record on file"); }
        return;
      }
      if (kind === "wording-v1" || kind === "wording-v2") {
        const ver = kind === "wording-v1" ? V1 : V2;
        const f = await download(page, () => sec.locator(`.wv-ver-row[data-version="${ver}"]`).getByRole("button", { name: "⬇ Wording" }).click());
        expect(f.name).toBe(`waiver-wording_${ver}.txt`);
        expect(f.text).toBe(`${TITLES[ver]}\nVersion ${ver} · SHA-256 ${sha256(wording(ver))}\n\n${wording(ver)}\n`);
        return;
      }
      if (kind === "make-current") {
        await sec.locator(`.wv-ver-row[data-version="${V1}"]`).getByRole("button", { name: "Make current" }).click();
        await expect(toast).toHaveText(`Version ${V1} is now the current waiver`);
        expect(ctx.state.waiverVersions!.filter((x) => x.is_current).map((x) => x.version)).toEqual([V1]);
        await expect(sec.locator(`.wv-ver-row[data-version="${V1}"] .tag`, { hasText: /^current$/ })).toHaveCount(1);
        expect(acc.length, "publishing changes no record").toBe(L.waiverAcceptances.length);
        return;
      }
      if (kind === "csv" || kind === "csv-tricky") {
        const f = await download(page, () => sec.locator("#wv-csv").click());
        expect(f.name).toMatch(/^waiver-acceptances_\d{4}-\d{2}-\d{2}\.csv$/);
        const lines = f.text.split("\r\n");
        expect(lines[0]).toBe("id,player_id,participant_name,email,waiver_version,waiver_sha256,accepted_at,client_timezone,client_utc_offset_minutes,action,age_declaration,minor_name,media_consent,registration_ref,typed_signature,user_agent,accepted_at_league_time");
        expect(f.text.endsWith("\r\n")).toBe(true);
        if (kind === "csv-tricky") {
          expect(f.text, "a formula-looking name is neutralised and quoted").toContain(`"'=HYPERLINK(""x""), ""Quoted"", Name"`);
          expect(f.text, "a signature starting with + is neutralised").toContain(",'+1 sig,");
          expect(f.text, "a comma and a line break stay inside one quoted cell").toContain(`"agent, with comma\nnewline"`);
        } else expect(lines.filter((l) => /^\d+,/.test(l)).length, "one row per acceptance").toBe(acc.length);
        return;
      }
      if (kind === "orphan") {
        await expect(sec).toContainText("People no longer on the player list");
        const f = await download(page, () => sec.locator('button[data-email="gone.person@example.invalid"]').click());
        expect(f.text).toContain("Player record: no longer on the player list");
        expect(f.text).toContain(`Name and email at acceptance: Gone Person <gone.person@example.invalid>`);
        return;
      }
      // A person's record: every acceptance, oldest first, each with its exact wording; or a plain statement that none exists.
      const f = await download(page, () => sec.locator(`.wv-row[data-player="${target.id}"]`).getByRole("button", { name: "⬇ Record" }).click());
      expect(f.name).toMatch(new RegExp(`^waiver-record_${target.name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}_\\d{4}-\\d{2}-\\d{2}\\.txt$`));
      expect(f.text).toContain("MAPLEWOOD LADDER LEAGUE (DC BADMINTON CLUB) — WAIVER ACCEPTANCE RECORD");
      expect(f.text).toContain(`Name on file: ${target.name}\nSign-in email: ${target.email}\nPlayer record: #${target.id}\n`);
      expect(f.text).toContain("from the TEST site");
      const mine = acc.filter((a) => a.player_id === target.id);
      if (!mine.length) { expect(f.text).toContain("No acceptance record exists for this person."); expect(f.text).not.toContain("WAIVER WORDING"); return; }
      for (let k = 0; k < mine.length; k++) expect(f.text, `acceptance ${k + 1}`).toContain(recordBlock(mine[k], k + 1, mine.length, await leagueTime(page, mine[k].accepted_at), offsetText(mine[k].client_utc_offset_minutes)).join("\n"));
      if (mine.length > 1) expect(f.text.indexOf("ACCEPTANCE 1 OF 2")).toBeLessThan(f.text.indexOf("ACCEPTANCE 2 OF 2"));
      for (const o of acc.filter((a) => a.player_id !== target.id)) expect(f.text, "nobody else's record is in this file").not.toContain(o.email);
    });
  }
});

// ═══ D. Who can see records ═══
test.describe("waiver · permissions", () => {
  const ME = "waiver.viewer@example.invalid";
  let ctx: Ctx;
  test.beforeAll(async ({ browser }) => { ctx = await openAs(browser, ME); });
  test.afterAll(async () => { await closeCtx(ctx); });
  for (let i = 0; i < 16; i++) {
    const opts = variety(i + 100);
    test(`Waiver permissions ${String(i + 1).padStart(3, "0")} · a player sees only their own record · ${genLeague(44000 + i, opts).title}`, async () => {
      const L: League & { waiverAcceptances?: Acceptance[] } = genLeague(44000 + i, { ...opts, dates: ctx.dates });
      const me = { ...L.players[0], email: ME, name: "Vic Viewer", registered_at: "2026-09-03T00:00:00Z", user_id: null }; L.players[0] = me;
      const v2 = waiverVersions().find((x) => x.version === V2)!, uid = ctx.state.users[ME];
      L.waiverAcceptances = L.players.slice(0, 5).map((p, k) => ({ id: k + 1, player_id: p.id, user_id: p.id === me.id ? uid : `00000000-0000-4000-8000-0000000009${String(k).padStart(2, "0")}`, email: p.email, participant_name: p.name, typed_signature: p.name, waiver_version: V2, waiver_sha256: v2.sha256, accepted_at: "2026-09-03T00:00:00.000Z", client_timezone: "", client_utc_offset_minutes: null, action: "registration", age_declaration: "adult", minor_name: "", media_consent: null, registration_ref: `REG-${p.id}-20260903T000000Z`, user_agent: "" }));
      await load(ctx, L);
      const page = ctx.page;
      const seen = await page.evaluate(() => (S.waiverAcc || []).map((a: { email: string }) => a.email));
      expect(seen, "only my own acceptance reaches my page").toEqual([ME]);
      const k = i % 4;
      if (k === 0) expect(await page.evaluate(async () => { try { await rpc("publish_waiver_version", { p_version: "2026-09-v1" }); return "published"; } catch (e) { return (e as Error).message; } })).toBe("Organizer verification required");
      if (k === 1) { await page.evaluate((id) => downloadWaiverRecord(id), L.players[1].id); await expect(page.locator("#_t")).toHaveText("Organizer verification required"); }
      if (k === 2) { await page.evaluate(() => downloadWaiverCsv()); await expect(page.locator("#_t")).toHaveText("Organizer verification required"); }
      if (k === 3) { await page.evaluate(() => nav("admin")); await expect(page.locator("#sec-a-wv")).toBeHidden(); }
      expect(ctx.state.waiverVersions!.find((x) => x.is_current)!.version, "nothing published").toBe(V2);
    });
  }
});
