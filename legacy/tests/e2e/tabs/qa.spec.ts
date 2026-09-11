// Standings → Q&A: the organizer answers, edits and deletes; approved players ask (and cannot moderate); players awaiting
// approval can read but not ask. Questions and answers are shown as plain text, never as markup. 100 leagues.
import { test, expect } from "@playwright/test";
import { openAs, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng } from "./gen";

const PLAYER = "qa.tester@example.invalid";
const TEXTS = ["Is parking free after 7?", "Can I bring a guest <b>once</b>?", "What if it's a tie & we both reach 21?", "Shuttles: feather or \"nylon\"?", "Où est le gymnase ? 🏸"];
let admin: Ctx, player: Ctx;
test.beforeAll(async ({ browser }) => { admin = await openAs(browser); player = await openAs(browser, PLAYER); });
test.afterAll(async () => { await admin?.page.close(); await player?.page.close(); });
for (let i = 0; i < 100; i++) {
  const asAdmin = i % 2 === 0, pendingViewer = !asAdmin && i % 8 === 7;
  const opts = { ...variety(i + 5), regulars: 6 + (i % 15), ...(asAdmin ? {} : { viewerEmail: PLAYER, viewerKind: pendingViewer ? ("pending" as const) : ("regular" as const), pending: pendingViewer ? 1 : 0 }) };
  test(`Q&A ${String(i + 1).padStart(3, "0")} · ${asAdmin ? "organizer" : pendingViewer ? "player awaiting approval" : "player"} · ${genLeague(15000 + i, opts).title}`, async () => {
    const ctx = asAdmin ? admin : player, page = ctx.page, r = rng(300 + i), toast = page.locator("#_t");
    const L = genLeague(15000 + i, { ...opts, dates: ctx.dates });
    await load(ctx, L);
    await page.evaluate(() => nav("standings"));
    await page.locator("#page-standings .ptab").filter({ hasText: /Q&A$/ }).click();
    const sec = page.locator("#sec-qa"), cards = sec.locator(".qa-card");
    const qs = [...L.questions].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const days = await page.evaluate((ts) => ts.map((t) => new Date(t).toLocaleDateString("en-CA", { month: "short", day: "numeric" })), qs.map((q) => q.created_at));
    if (!qs.length) await expect(sec).toContainText("No questions yet — be the first to ask!");
    await expect(cards).toHaveCount(qs.length);
    for (let k = 0; k < qs.length; k++) {
      const c = cards.nth(k), q = qs[k];
      await expect(c.locator(".qa-q")).toHaveText(q.question);
      await expect(c.locator(".qa-meta")).toHaveText(`Asked by ${asAdmin ? q.asker : "a player"} · ${days[k]}`);
      if (q.answer) await expect(c.locator(".qa-ans")).toHaveText(`Admin: ${q.answer}`); else await expect(c.locator(".qa-unanswered")).toHaveText("⏳ Awaiting admin response");
      await expect(c.getByRole("button")).toHaveText(asAdmin ? [q.answer ? "Edit Answer" : "Answer", "Delete"] : []);
    }
    await expect(sec.locator("#qa-input"), "question box only for approved players").toHaveCount(!asAdmin && !pendingViewer ? 1 : 0);

    if (asAdmin) {
      if (!qs.length) return;
      const k = Math.floor(r() * qs.length), q = qs[k], act = i % 6;
      if (act === 0 || act === 4) {
        await cards.nth(k).getByRole("button", { name: "Delete" }).click();
        await expect(toast).toHaveText("Deleted");
        expect(ctx.state.questions.some((x) => x.id === q.id), "question removed").toBe(false);
        await expect(cards).toHaveCount(qs.length - 1);
      } else if (act === 2) {
        await cards.nth(k).getByRole("button", { name: q.answer ? "Edit Answer" : "Answer" }).click();   // OK on an empty prompt: nothing changes
        expect(ctx.state.questions.find((x) => x.id === q.id)!.answer).toBe(q.answer);
      } else {
        const ans = `${TEXTS[i % TEXTS.length].replace("?", ".")} — answered in case ${i + 1}`;
        ctx.prompts.push(`  ${ans}  `);
        await cards.nth(k).getByRole("button", { name: q.answer ? "Edit Answer" : "Answer" }).click();
        await expect(toast).toHaveText("Answer posted!");
        const row = ctx.state.questions.find((x) => x.id === q.id)!;
        expect(row.answer, "answer saved, trimmed").toBe(ans);
        expect(row.answered_at).toBeTruthy();
        await expect(cards.nth(k).locator(".qa-ans")).toHaveText(`Admin: ${ans}`);
        await expect(cards.nth(k).getByRole("button").first()).toHaveText("Edit Answer");
      }
      return;
    }
    if (pendingViewer) return;
    const input = sec.locator("#qa-input");
    await sec.getByRole("button", { name: "Submit Question" }).click();
    await expect(toast).toHaveText("Enter your question");
    expect(ctx.state.questions.length).toBe(L.questions.length);
    const text = TEXTS[Math.floor(r() * TEXTS.length)] + ` (case ${i + 1})`;
    await input.fill(`  ${text}\n`);
    await sec.getByRole("button", { name: "Submit Question" }).click();
    await expect(toast).toHaveText("Question submitted!");
    const me = L.players[0], row = ctx.state.questions.at(-1)!;
    expect({ player_id: row.player_id, asker: row.asker, question: row.question }, "saved with my name").toEqual({ player_id: me.id, asker: me.name, question: text });
    await expect(cards.first().locator(".qa-q"), "newest first, shown as text").toHaveText(text);
    await expect(cards.first().locator(".qa-unanswered")).toHaveText("⏳ Awaiting admin response");
    await expect(sec.locator("#qa-input")).toHaveValue("");
  });
}
