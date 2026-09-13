// Admin → Players: court distribution, the sync-to-last-session banner, active and unassigned lists, moving a player or
// benching them, marking absent, removing, calling in, adding (new, duplicate, blank, registered, capacity) and
// re-sorting. With and without a session running. 100 leagues.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, NC } from "./gen";
import { courtOf } from "./oracle";
import { fillCourts } from "../rules-model";
import {manualMoveExpected} from './manual-move-oracle';
import {expectAdjust, REFUSAL} from './adjust-oracle';
import { poolAction, rowActions, COURT_LOCK } from "./pool";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
for (let i = 0; i < 100; i++) {
  const opts = { ...variety(i + 9), ...(i % 2 ? { live: "none" as const } : {}), ...(i % 10 === 5 ? { regulars: 26 } : {}) };
  test(`Players ${String(i + 1).padStart(3, "0")} · ${genLeague(19000 + i, opts).title}`, async () => {
    const L = genLeague(19000 + i, { ...opts, dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page, r = rng(90 + i), toast = page.locator("#_t"), P = L.players, cur = L.current;
    const kv = (k: string) => { const v = ctx.state.state[k]; return v && v.value !== "null" ? JSON.parse(v.value) : null; };
    const db = (id: number) => ctx.state.players.find((p) => p.id === id);
    await page.evaluate(() => nav("admin"));
    await page.getByRole("button", { name: "👥 Players" }).click();
    const list = page.locator("#a-pl-list");
    if (!P.length) { await expect(list).toContainText("No players yet"); return; }
    const counts = [1, 2, 3, 4, 5, 6].map((c) => P.filter((p) => p.current_court === c).length);
    expect(await page.locator("#a-pl-court-summary div[style*='repeat(6,1fr)'] > div").evaluateAll((ds) => ds.map((d) => [...d.children].map((x) => x.textContent))), "court distribution")
      .toEqual(counts.map((n, k) => [`C${k + 1}`, String(n), `${n}/${Math.max(4, n)}`]));
    let mism = 0;
    if (!cur && L.sessions.length) { const fa = L.sessions.at(-1)!.finalAssignments!; for (let c = 1; c <= NC; c++) for (const id of fa[c] || []) { const p = P.find((x) => x.id === id); if (p && p.current_court !== c) mism++; } }
    await expect(page.locator("#a-pl-court-summary .alert"), "sync banner when courts differ from the last final standings").toHaveCount(mism ? 1 : 0);
    if (mism) await expect(page.locator("#a-pl-court-summary .alert")).toContainText(`${mism} player${mism > 1 ? "s" : ""} need updating`);
    const regs = P.filter((p) => p.membership_type !== "spare").length, active = P.filter((p) => p.current_court > 0).sort((a, b) => a.current_court - b.current_court), bench = P.filter((p) => !p.current_court);
    await expect(list.locator(".card-title").first()).toHaveText(`Active Players — ${active.length} on Courts (${regs} Regular · ${P.length - regs} Spare)${bench.length ? ` · ${bench.length} Unassigned` : ""}`);
    const rows = list.locator(".card > div:has(> .pl-num)");
    await expect(rows).toHaveCount(active.length);
    for (let k = 0; k < active.length; k++) {
      const p = active[k], info = rows.nth(k).locator("> div").nth(1).locator("> div"), absent = cur?.attendance?.[p.id] === "absent";
      expect(norm((await info.first().textContent()) || ""), `row ${k + 1}`).toBe(`${p.name}${p.membership_type === "spare" ? "SPARE" : ""}${absent ? "ABSENT" : ""}`);
      expect(norm((await info.nth(1).textContent()) || "")).toBe(`${p.email || "—"} · C${p.current_court} · ${p.season_wins}W ${p.season_losses}L · Absent:${p.no_show_count}`);
      await expect(rows.nth(k).locator("select")).toHaveValue(String(p.current_court));
    }
    // p61: a spare already coming to the next session shows their status instead of Call In; p62: Call In is disabled,
    // with the reason, once both rounds are finished.
    const benchRows = list.locator(".card > div:has(> button[onclick^='callInSpare']), .card > div:has(> span.tag[title*=' is coming to the next session'])");
    expect((await benchRows.locator("> div:first-child > div:first-child").allTextContents()).map(norm), "spare pool / unassigned").toEqual(bench.map((p) => p.name + (p.membership_type === "spare" ? "SPARE" : "")));
    expect(await benchRows.evaluateAll(rowActions), "each pool player's action").toEqual(bench.map((p) => poolAction(ctx, L, p.id)));
    if (cur?.completed) for (let j = 0; j < bench.length; j++) { const b = benchRows.nth(j).locator("> button[onclick^='callInSpare']"); await expect(b).toBeDisabled(); await expect(b).toHaveAttribute("title", COURT_LOCK); }

    const act = i % 7, k = Math.floor(r() * Math.max(1, active.length)), p = active[k];
    if ((act === 0 || act === 1) && p) {
      const c = act === 1 ? 0 : (p.current_court % NC) + 1;
      await rows.nth(k).locator("select").selectOption(String(c));
      if(cur){const want=manualMoveExpected(L,p.id,c);if(want.message)await expect(toast).toContainText(want.message);expect(kv('current_session').assignments).toEqual(want.lineup);expect(db(p.id)!.current_court,'earned court is unchanged during play').toBe(p.current_court);}
      else await expect.poll(()=>db(p.id)!.current_court).toBe(c);
    } else if (act === 2 && p) {
      await rows.nth(k).getByRole("button", { name: "🚫" }).click();
      if (!cur) {
        await expect(toast).toHaveText("No session is running. For next Tuesday, set their vote to “not coming” in Standings → RSVP.");
        expect(db(p.id)!.current_court, "nothing changes between sessions").toBe(p.current_court);
        return;
      }
      if(!p.approved||p.waitlisted){await expect(toast).toHaveText('Choose an approved, non-waitlisted player');return;}
      const from=courtOf(cur.assignments,p.id)||p.current_court,ref=expectAdjust(cur,{absent:[p.id],returning:[],late:[]});
      if(!ref.ok){await expect(toast).toHaveText(REFUSAL[ref.why!]);expect(kv('current_session')).toEqual(cur);return;}
      await expect(toast).toHaveText(courtOf(ref.lineup,p.id)?`${p.name} marked absent; their scored court stays unchanged until the round ends`:`${p.name} marked absent — off Court ${from} tonight, one court down next week`);
      const cs = kv("current_session");
      expect(cs.assignments).toEqual(ref.lineup);expect(cs.attendance[p.id]).toBe('absent');expect(cs.absentFrom[p.id]).toBe(from);
    } else if (act === 3 && p) {
      await rows.nth(k).getByRole("button", { name: "✕" }).click();
      if(cur&&courtOf(cur.assignments,p.id)){await expect(toast).toContainText('Player is assigned tonight');expect(db(p.id)?.archived_at).toBeFalsy();expect(kv('current_session')).toEqual(cur);}
      else{await expect(toast).toHaveText('Player archived; history retained');expect(db(p.id)?.archived_at).toBeTruthy();expect(db(p.id)?.approved).toBe(false);expect(ctx.state.payments).toEqual(L.payments);}
    } else if (act === 4 && bench.some((x) => poolAction(ctx, L, x.id) === "📲 Call In")) {
      const offered = bench.filter((x) => poolAction(ctx, L, x.id) === "📲 Call In"), u = offered[Math.floor(r() * offered.length)], j = bench.indexOf(u);
      const callIn = benchRows.nth(j).getByRole("button", { name: `Call in ${u.name}` });
      if (cur?.completed) { await expect(callIn).toBeDisabled(); await expect(callIn).toHaveAttribute("title", COURT_LOCK); return; }
      await callIn.click();
      if (!cur) {
        // p61: before a session Call In answers a spare "coming" for the next session and puts a regular on the ladder at the
        // bottom court in use (call-in.spec.ts checks the seat and the next session's court against the reference).
        if (!u.approved || u.waitlisted) { await expect(toast).toHaveText("Approve this player before calling them in"); return; }
        if (u.membership_type === "spare") {
          await expect.poll(() => ctx.state.rsvps.filter((v) => v.session_number === L.upcoming && v.player_id === u.id).at(-1)?.response, { message: "answered coming" }).toBe("coming");
          await expect(toast).toContainText(`${u.name} is coming to Session ${L.upcoming}`);
          return;
        }
        const used = P.filter((x) => x.id !== u.id && x.approved && !x.waitlisted && x.membership_type !== "spare" && x.current_court > 0).map((x) => x.current_court), bottom = used.length ? Math.max(...used) : 1;
        await expect.poll(() => db(u.id)!.current_court, { message: "earned court saved" }).toBe(bottom);
        await expect(toast).toContainText(`${u.name} joins the ladder on Court ${bottom} (the bottom court)`);
        return;
      }
      if(!u.approved||u.waitlisted){await expect(toast).toHaveText('Choose an approved, non-waitlisted player');return;}
      const from=courtOf(cur.assignments,u.id)||u.current_court||NC,ref=expectAdjust(cur,{absent:[],returning:[{id:u.id,court:from}],late:[]});
      if(!ref.ok){await expect(toast).toHaveText(REFUSAL[ref.why!]);expect(kv('current_session')).toEqual(cur);return;}
      await expect(toast).toHaveText(`${u.name} called in → Court ${courtOf(ref.lineup,u.id)}`);
      expect(kv('current_session').assignments).toEqual(ref.lineup);expect(kv('current_session').attendance[u.id]).toBe('present');expect(db(u.id)!.current_court).toBe(u.current_court);
    } else if (act === 5) {
      const kind = i % 20 === 5 ? "regular" : r() < 0.5 ? "regular" : "spare", c = Math.floor(r() * 7);
      const pick = r(), existing = active[0], registered = bench.find((x) => x.name);
      const name = pick < 0.15 ? "" : pick < 0.3 && existing ? existing.name.toUpperCase() : pick < 0.45 && registered ? registered.name : `Newcomer ${i + 1}`;
      await page.locator("#np-name").fill(name);
      await page.locator("#np-membership").selectOption(kind);
      await page.locator("#np-court").selectOption(String(c));
      await page.getByRole("button", { name: "+ Add Player" }).click();
      const taken = P.filter((x) => x.membership_type !== "spare" && !x.waitlisted && x.approved).length;
      if (!name) { await expect(toast).toHaveText("Enter a name"); return; }
      if(P.some(p=>p.name.toLowerCase()===name.toLowerCase())){await expect(toast).toHaveText('This name is already on file. Open their player record to edit or approve it.');return;}
      if(kind==='regular'&&taken>=26){await expect(toast).toHaveText('Player not added: Regular places are full');return;}
      await expect.poll(()=>ctx.state.players.some(p=>p.name===name)).toBe(true);
      const row = ctx.state.players.find((x) => x.name === name)!;
      expect({sig:row.sig,court:row.current_court,approved:row.approved,waiver:row.waiver_signed}).toEqual({sig:'admin',court:cur?0:c,approved:true,waiver:false});
      if(cur&&c>0){const want=manualMoveExpected({...L,players:[...L.players,row]},row.id,c);if(want.message)await expect(toast).toContainText(want.message);expect(kv('current_session').assignments).toEqual(want.lineup);}
      else await expect(toast).toHaveText(`${name} added as ${kind}!`);
      await expect(page.locator("#np-name")).toHaveValue("");
    } else if (act === 6) {
      await page.locator("#a-pl-court-summary").getByRole("button", { name: /Re-sort/ }).click();
      if(cur){const ref=expectAdjust(cur),apply=page.locator('#adj-apply');if(await apply.isVisible()&&await apply.isEnabled()){await apply.click();await expect(toast).toContainText('Courts adjusted');expect(kv('current_session').assignments).toEqual(ref.lineup);}else expect(kv('current_session').assignments).toEqual(cur.assignments);return;}
      const filled = fillCourts(active.map((x) => x.id)), want = (id: number) => filled.findIndex((ids) => ids.includes(id));
      await expect(toast).toHaveText(`Courts re-sorted — ${active.length} players across ${filled.slice(1).filter((x) => x.length).length} courts`);
      active.forEach((x) => expect(db(x.id)!.current_court, `${x.name} after re-sort`).toBe(want(x.id)));
      if (cur) { const a = kv("current_session").assignments; active.forEach((x) => expect(courtOf(a, x.id)).toBe(want(x.id))); }
    }
  });
}
