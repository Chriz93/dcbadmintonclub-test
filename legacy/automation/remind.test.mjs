import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEASON, upcomingSession, voteStage, spareWindow, planReminders, redirectRecipient, composeEmail, composePush, sessionStart, run } from "./remind.mjs";

test("season file matches the dates compiled into index.html", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const pick = (name) => [...html.match(new RegExp(`const ${name}=\\[([^\\]]*)\\]`))[1].matchAll(/'(\d{4}-\d\d-\d\d)'/g)].map((m) => m[1]);
  assert.deepEqual(SEASON.approved_dates, pick("APPROVED_DATES"));
  assert.deepEqual(SEASON.cancelled_dates, pick("CANCELLED_DATES"));
  assert.equal(SEASON.approved_dates.length, 28);
  assert.equal(SEASON.cancelled_dates.length, 6);
  assert.match(html, /absenceNoticeHours:72/);
});
test("upcoming session follows completed sessions, then the active night", () => {
  assert.deepEqual(upcomingSession(0, null), { number: 1, started: false, complete: false });
  assert.deepEqual(upcomingSession(3, null), { number: 4, started: false, complete: false });
  assert.deepEqual(upcomingSession(3, { number: 4 }), { number: 4, started: true });
  assert.equal(upcomingSession(28, null).complete, true);
});
test("stage bands: Thursday night, Saturday before the cutoff, Monday afternoon; spares up to 3 hours before", () => {
  assert.equal(voteStage(119).kind, "vote-1");
  assert.equal(voteStage(100), null);
  assert.equal(voteStage(80).kind, "vote-2");
  assert.equal(voteStage(72).kind, "vote-2");
  assert.equal(voteStage(71.9), null);
  assert.equal(voteStage(24).kind, "vote-3");
  assert.equal(voteStage(2), null);
  assert.equal(spareWindow(2), false); assert.equal(spareWindow(5), true); assert.equal(spareWindow(200), false);
});
test("plan: one message per player per stage, spares only while seats are open", () => {
  const targets = [
    { player_id: 1, name: "A B", email: "a@x", membership_type: "regular", kind: "vote", open_seats: 1 },
    { player_id: 2, name: "C D", email: "c@x", membership_type: "regular", kind: "vote", open_seats: 1 },
    { player_id: 9, name: "S P", email: "s@x", membership_type: "spare", kind: "spare", open_seats: 1 },
    { player_id: 10, name: "S Q", email: "q@x", membership_type: "spare", kind: "spare", open_seats: 0 },
  ];
  const plan = planReminders(targets, 80, new Set(["1:vote-2"]));
  assert.deepEqual(plan.map((p) => `${p.player_id}:${p.stage}`), ["2:vote-2", "9:spare"]);
  assert.deepEqual(planReminders(targets, 100, new Set()).map((p) => p.stage), ["spare"]); // between bands, spares still invited
  assert.deepEqual(planReminders(targets, 100, new Set(["9:spare"])), []);
});
test("test mode never addresses a player", () => {
  const t = { name: "Real Person", email: "real@example.com" };
  assert.deepEqual(redirectRecipient(t, { ALLOW_REAL_RECIPIENTS: "false", TEST_INBOX: "inbox@x" }), { to: "inbox@x", prefix: "[TEST for Real Person <real@example.com>] " });
  assert.deepEqual(redirectRecipient(t, { ALLOW_REAL_RECIPIENTS: "true" }), { to: "real@example.com", prefix: "" });
});
test("emails carry one-tap links for the right session and the refund note before the cutoff", () => {
  const m = composeEmail({ name: "Pat Lee", stage: "vote-2", open_seats: 0 }, 3, "https://chriz93.github.io/dcbadmintonclub-test/", "org@x");
  assert.match(m.text, /\?vote=coming&s=3/); assert.match(m.text, /\?vote=notcoming&s=3/); assert.match(m.text, /\$14 refund/);
  assert.match(m.subject, /Session 3\? \(Tuesday, September 29\)/);
  const s = composeEmail({ name: "Sam Spare", stage: "spare", open_seats: 2 }, 3, "https://x/", "org@x");
  assert.match(s.subject, /Spare seat open/); assert.match(s.text, /2 seats have opened/); assert.match(s.text, /\$20/);
  assert.equal(sessionStart("2026-09-15").getHours(), 20);
});
test("push payloads open the one-tap vote link and never leave test mode", async () => {
  const p = composePush({ name: "Pat", stage: "vote-1" }, 4, "https://site/");
  assert.equal(p.url, "https://site/?vote=coming&s=4"); assert.equal(p.actions.length, 2);
  const db = { state: async () => null, targets: async () => [{ player_id: 1, name: "P", email: "p@x", membership_type: "regular", kind: "vote", open_seats: 0 }], logged: async () => new Set(), claim: async () => true, unclaim: async () => {}, subscriptions: async () => [{ player_id: 1, endpoint: "https://push/1", p256dh: "k", auth: "a" }], dropSubscription: async () => {} };
  const pushes = [];
  const now = sessionStart(SEASON.approved_dates[0]).getTime() - 24 * 3600000;
  const base = { SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: "k", SITE_URL: "https://site/", GMAIL_USER: "league@gmail.com", TEST_INBOX: "inbox@x", DELIVERY_MODE: "live", VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv" };
  const testMode = await run({ ...base, ALLOW_REAL_RECIPIENTS: "false" }, { db, now, log: () => {}, transport: { sendMail: async () => {} }, pusher: { send: async (s, m) => pushes.push(m) } });
  assert.equal(testMode.sent, 1); assert.equal(testMode.pushed, 0);
  const live = await run({ ...base, ALLOW_REAL_RECIPIENTS: "true" }, { db, now, log: () => {}, transport: { sendMail: async () => {} }, pusher: { send: async (s, m) => pushes.push(m) } });
  assert.equal(live.pushed, 1); assert.match(pushes[0].title, /Session 1/);
});
test("run: dry run plans without sending; live test mode claims, redirects and caps at three", async () => {
  const claims = [];
  const db = {
    state: async (k) => (k === "completed_sessions" ? [{}, {}] : null),
    targets: async () => Array.from({ length: 5 }, (_, i) => ({ player_id: i + 1, name: `P ${i + 1}`, email: `p${i + 1}@x`, membership_type: "regular", kind: "vote", open_seats: 0 })),
    logged: async () => new Set(),
    claim: async (s, p, k) => { claims.push(`${s}:${p}:${k}`); return true; },
    unclaim: async () => {},
  };
  const now = sessionStart(SEASON.approved_dates[2]).getTime() - 80 * 3600000; // 80 h before Session 3
  const lines = [];
  const base = { SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: "k", SITE_URL: "https://site/", GMAIL_USER: "league@gmail.com", TEST_INBOX: "inbox@x" };
  const dry = await run({ ...base }, { db, now, log: (l) => lines.push(l) });
  assert.equal(dry.planned, 5); assert.equal(dry.sent, 0); assert.equal(claims.length, 0);
  assert.ok(lines.some((l) => l.includes("DRY RUN → inbox@x: [TEST for P 1 <p1@x>]")));
  const sentTo = [];
  const live = await run({ ...base, DELIVERY_MODE: "live", ALLOW_REAL_RECIPIENTS: "false" }, { db, now, log: () => {}, transport: { sendMail: async (m) => sentTo.push(m.to) } });
  assert.equal(live.sent, 3); assert.deepEqual(sentTo, ["inbox@x", "inbox@x", "inbox@x"]); assert.deepEqual(claims, ["3:1:vote-2", "3:2:vote-2", "3:3:vote-2"]);
});
