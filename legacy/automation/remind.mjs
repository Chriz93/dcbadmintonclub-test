#!/usr/bin/env node
// Vote reminders and spare-seat invitations for the legacy league site.
//
// Runs hourly from GitHub Actions. Reads the league state with the service-role key (never shipped to browsers),
// asks the database who still needs a nudge (reminder_targets), claims a reminder_log row per player and stage
// BEFORE sending (so two overlapping runs can never email twice), then sends through the league Gmail account.
//
// Safety rails: DELIVERY_MODE must be "live" to send anything; ALLOW_REAL_RECIPIENTS must be "true" to address
// players — otherwise every message is redirected to TEST_INBOX with the intended recipient in the subject, at most
// three per run. Nothing here prints secrets.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

process.env.TZ = process.env.TZ || "America/Toronto";
const here = dirname(fileURLToPath(import.meta.url));
export const SEASON = JSON.parse(readFileSync(join(here, "season.json"), "utf8"));

// ── Pure logic (unit-tested) ─────────────────────────────────────────────────────────────────────
export function sessionStart(iso) { const [h, m] = SEASON.start_time_local.split(":").map(Number); const [y, mo, d] = iso.split("-").map(Number); return new Date(y, mo - 1, d, h, m, 0); }
export function upcomingSession(completedCount, current) {
  if (current && current.number) return { number: current.number, started: true };
  const n = Math.min(completedCount + 1, SEASON.approved_dates.length);
  return { number: n, started: false, complete: completedCount >= SEASON.approved_dates.length };
}
// Stage bands in hours before the 8 PM start. Hourly runs: the first run inside a band sends, the log stops repeats.
export const STAGES = [
  { kind: "vote-1", from: 120, to: 108, label: "first reminder" },   // Thu 8 PM – Fri 8 AM
  { kind: "vote-2", from: 84, to: 72, label: "before the refund cutoff" }, // Sat 8 AM – Sat 8 PM
  { kind: "vote-3", from: 58, to: 46, label: "final reminder before the Sunday 10 PM deadline" }, // Sun 10 AM – Sun 10 PM
];
export function voteStage(hoursUntil) { return STAGES.find((s) => hoursUntil < s.from && hoursUntil >= s.to) || null; }
export function spareWindow(hoursUntil) { return hoursUntil < SEASON.fees.spare_ask_hours && hoursUntil >= 3; } // spares are asked from 3 days before
/** Decide what to send. targets = rows from reminder_targets(); logged = Set of `${player_id}:${kind}` already claimed. */
export function planReminders(targets, hoursUntil, logged) {
  const stage = voteStage(hoursUntil);
  const plan = [];
  for (const t of targets) {
    if (t.kind === "vote" && stage && !logged.has(`${t.player_id}:${stage.kind}`)) plan.push({ ...t, stage: stage.kind, label: stage.label });
    if (t.kind === "spare" && spareWindow(hoursUntil) && t.open_seats > 0 && !logged.has(`${t.player_id}:spare`)) plan.push({ ...t, stage: "spare", label: "seat open" });
  }
  return plan;
}
export function redirectRecipient(target, env) {
  if (env.ALLOW_REAL_RECIPIENTS === "true") return { to: target.email, prefix: "" };
  return { to: env.TEST_INBOX || env.GMAIL_USER, prefix: `[TEST for ${target.name} <${target.email}>] ` };
}
export function composeEmail(t, session, siteUrl, organizerEmail) {
  const date = new Date(sessionStart(SEASON.approved_dates[session - 1])).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" });
  const yes = `${siteUrl}?vote=coming&s=${session}`, no = `${siteUrl}?vote=notcoming&s=${session}`;
  const cutoffHours = SEASON.fees.absence_notice_hours;
  if (t.stage === "spare") {
    const seats = t.open_seats === 1 ? "one seat has opened" : `${t.open_seats} seats have opened`;
    return {
      subject: `Spare seat open — Session ${session}, ${date}`,
      text: `Hi ${t.name.split(" ")[0]},\n\nA regular player can't make Session ${session} on ${date}, so ${seats}. Seats go to spares in the order they answer.\n\nI'm available: ${yes}\nNot available: ${no}\n\nA confirmed seat costs $${SEASON.fees.spare_session} by e-transfer to ${organizerEmail}. If you are on standby you will be emailed the moment a seat opens.\n\n— Maplewood League\nTurn these emails off from the vote card on the site.`,
      html: `<p>Hi ${esc(t.name.split(" ")[0])},</p><p>A regular player can't make <strong>Session ${session} on ${date}</strong>, so ${seats}. Seats go to spares in the order they answer.</p><p><a href="${yes}" style="${BTN}background:#1f9d6a;">I'm available</a> &nbsp; <a href="${no}" style="${BTN}background:#b83b4b;">Not available</a></p><p>A confirmed seat costs $${SEASON.fees.spare_session} by e-transfer to ${esc(organizerEmail)}. If you are on standby you will be emailed the moment a seat opens.</p><p style="color:#888;font-size:12px;">— Maplewood League · turn these emails off from the vote card on the site.</p>`,
    };
  }
  const refund = t.stage === "vote-2" ? `Decline by 8:00 PM Saturday (${cutoffHours} hours before play) to keep the $${SEASON.fees.absence_refund} refund. ` : t.stage === "vote-3" ? "Votes close Sunday 10:00 PM. " : "";
  return {
    subject: `Are you playing Session ${session}? (${date})`,
    text: `Hi ${t.name.split(" ")[0]},\n\nYou haven't answered for Session ${session} on ${date} (8:00–10:00 PM). Everyone votes by Sunday 10:00 PM. ${refund}One tap:\n\nI'm coming: ${yes}\nNot coming: ${no}\n\n— Maplewood League\nTurn these emails off from the vote card on the site.`,
    html: `<p>Hi ${esc(t.name.split(" ")[0])},</p><p>You haven't answered for <strong>Session ${session} on ${date}</strong> (8:00–10:00 PM). ${esc(refund)}One tap:</p><p><a href="${yes}" style="${BTN}background:#1f9d6a;">I'm coming</a> &nbsp; <a href="${no}" style="${BTN}background:#b83b4b;">Not coming</a></p><p style="color:#888;font-size:12px;">— Maplewood League · turn these emails off from the vote card on the site.</p>`,
  };
}
export function composePush(t, session, siteUrl) {
  const date = new Date(sessionStart(SEASON.approved_dates[session - 1])).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
  if (t.stage === "spare") return { title: `Spare seat open — Session ${session}`, body: `${date}: a regular can't make it. Tap to claim the seat ($${SEASON.fees.spare_session}).`, url: `${siteUrl}?vote=coming&s=${session}` };
  return { title: `Are you playing Session ${session}?`, body: `${date}, 8:00 PM. Tap to answer in one step.`, url: `${siteUrl}?vote=coming&s=${session}`, actions: [{ action: "coming", title: "I'm coming" }, { action: "notcoming", title: "Not coming" }] };
}
/** Digest of vote changes since the last run for the admin; late (after the deadline) and by-admin changes are flagged. */
export function composeDigest(rows, players) {
  const name = (id) => players.find((p) => p.id === id)?.name || `#${id}`;
  const word = (v) => (v === "coming" ? "coming" : v === "notcoming" ? "not coming" : v || "—");
  let late = 0;
  const lines = rows.map((r) => {
    const start = sessionStart(SEASON.approved_dates[r.session_number - 1]);
    const isLate = start && new Date(r.changed_at).getTime() > start.getTime() - SEASON.fees.vote_deadline_hours * 3600000 && !r.by_admin;
    if (isLate) late++;
    const when = new Date(r.changed_at).toLocaleString("en-CA", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    return `${when} · Session ${r.session_number} · ${name(r.player_id)}: ${word(r.old_response)} → ${word(r.new_response)}${isLate ? "  ⚠ AFTER THE DEADLINE" : ""}${r.by_admin ? "  (by admin)" : ""}`;
  });
  return { subject: `${rows.length} vote change${rows.length === 1 ? "" : "s"}${late ? ` (${late} after the deadline)` : ""}`, text: `Vote changes since the last digest:\n\n${lines.join("\n")}\n\nOpen the admin Home for the full list.`, late };
}
/** Who still has to vote, and exactly what one of them would receive. Used by the admin's test email. */
export async function previewReminder(db, env) {
  try {
    const completed = (await db.state("completed_sessions")) || [];
    const up = upcomingSession(completed.length, await db.state("current_session"));
    if (up.complete) return { who: "The season is complete.", text: "", html: "" };
    const voters = (await db.targets(up.number)).filter((t) => t.kind === "vote");
    if (!voters.length) return { who: `Everyone has answered for Session ${up.number}.`, text: "", html: "" };
    const names = voters.map((t) => t.name);
    const who = `${voters.length} player${voters.length === 1 ? "" : "s"} have not voted for Session ${up.number}: ${names.slice(0, 8).join(", ")}${names.length > 8 ? `, and ${names.length - 8} more` : ""}. Only these players are emailed.`;
    const m = composeEmail({ ...voters[0], stage: "vote-1" }, up.number, env.SITE_URL, env.ORGANIZER_EMAIL || env.GMAIL_USER);
    return { who, text: `\n\nThis is the reminder ${voters[0].name} would receive.\n\nSubject: ${m.subject}\n\n${m.text}`,
      html: `<hr><p><em>This is the reminder ${esc(voters[0].name)} would receive.</em><br>Subject: <strong>${esc(m.subject)}</strong></p>${m.html}` };
  } catch (e) {
    return { who: `Could not read the league state: ${e.message}`, text: "", html: "" };
  }
}
const BTN = "display:inline-block;padding:12px 20px;border-radius:10px;color:#fff;font-weight:700;text-decoration:none;";
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ── Supabase access (service role, server only) ─────────────────────────────────────────────────
function api(env) {
  const base = env.SUPABASE_URL.replace(/\/$/, ""), key = env.SUPABASE_SERVICE_ROLE_KEY;
  // Either key format works: a new-style secret key (sb_secret_…) goes in apikey alone; a legacy service_role JWT also needs Bearer.
  const h = key.startsWith("sb_secret_") ? { apikey: key, "Content-Type": "application/json" } : { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  return {
    async state(k) { const r = await fetch(`${base}/rest/v1/app_state?key=eq.${k}&select=value`, { headers: h }); if (!r.ok) throw new Error(`app_state ${k}: ${r.status}`); const rows = await r.json(); return rows[0] ? JSON.parse(rows[0].value) : null; },
    async targets(session) { const r = await fetch(`${base}/rest/v1/rpc/reminder_targets`, { method: "POST", headers: h, body: JSON.stringify({ p_session: session }) }); if (!r.ok) throw new Error(`reminder_targets: ${r.status}`); return r.json(); },
    async logged(session) { const r = await fetch(`${base}/rest/v1/reminder_log?session_number=eq.${session}&select=player_id,kind`, { headers: h }); if (!r.ok) throw new Error(`reminder_log: ${r.status}`); return new Set((await r.json()).map((x) => `${x.player_id}:${x.kind}`)); },
    async claim(session, player, kind) { const r = await fetch(`${base}/rest/v1/reminder_log`, { method: "POST", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify({ session_number: session, player_id: player, kind }) }); return r.status === 201; },
    async unclaim(session, player, kind) { await fetch(`${base}/rest/v1/reminder_log?session_number=eq.${session}&player_id=eq.${player}&kind=eq.${kind}`, { method: "DELETE", headers: h }); },
    async voteLog(sinceId) { const r = await fetch(`${base}/rest/v1/rsvp_log?id=gt.${sinceId}&select=id,session_number,player_id,old_response,new_response,by_admin,changed_at&order=id.asc&limit=200`, { headers: h }); return r.ok ? r.json() : []; },
    async playersBrief() { const r = await fetch(`${base}/rest/v1/players?select=id,name,email,membership_type`, { headers: h }); return r.ok ? r.json() : []; },
    async setState(k, v) {
      const cur = await fetch(`${base}/rest/v1/app_state?key=eq.${k}&select=version`, { headers: h });
      const version = cur.ok ? (((await cur.json())[0] || {}).version || 0) + 1 : 1;
      await fetch(`${base}/rest/v1/app_state?on_conflict=key`, { method: "POST", headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ key: k, value: JSON.stringify(v), version }) });
    },
    async subscriptions(playerIds) { if (!playerIds.length) return []; const r = await fetch(`${base}/rest/v1/push_subscriptions?player_id=in.(${playerIds.join(",")})&select=player_id,endpoint,p256dh,auth`, { headers: h }); return r.ok ? r.json() : []; },
    async dropSubscription(endpoint) { await fetch(`${base}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: "DELETE", headers: h }); },
  };
}

export async function run(env = process.env, deps = {}) {
  const log = deps.log || ((...a) => console.log(...a));
  for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SITE_URL", "GMAIL_USER"]) if (!env[k]) throw new Error(`${k} is required`);
  const db = deps.db || api(env);
  const live = env.DELIVERY_MODE === "live";
  const testMode = env.ALLOW_REAL_RECIPIENTS !== "true";
  const now = deps.now || Date.now();
  // The admin's Tools screen queues a request here; the browser never holds a mail password.
  const request = db.state ? await db.state("reminder_request").catch(() => null) : null;
  const finish = async (result) => {
    const out = { ...result, mode: live ? (testMode ? "test-inbox" : "live") : "dry-run" };
    if (db.setState && (request || result.sent)) await db.setState("reminder_last_run", { at: new Date(now).toISOString(), requested: request ? request.kind : null, ...out });
    if (request && db.setState) await db.setState("reminder_request", null);
    return out;
  };
  // A test email only ever goes to an address this league already owns, so it is sent whatever the delivery mode says.
  if (env.SMOKE_TEST === "true" || (request && request.kind === "smoke")) {
    const allowed = [env.TEST_INBOX, env.ORGANIZER_EMAIL, env.GMAIL_USER].filter(Boolean).map((x) => x.toLowerCase());
    const asked = String((request && request.to) || "").toLowerCase();
    const to = allowed.includes(asked) ? asked : env.TEST_INBOX || env.GMAIL_USER;
    const p = await previewReminder(db, env);
    const transport = deps.transport || (await gmail(env));
    await transport.sendMail({
      from: `"Maplewood League" <${env.GMAIL_USER}>`, to, subject: "Reminder job test email",
      text: `The reminder job can send email. Sent ${new Date(now).toString()} from GitHub Actions. No player was contacted.\n\n${p.who}${p.text}`,
      html: `<p>The reminder job can send email. Sent ${new Date(now).toString()} from GitHub Actions. <strong>No player was contacted.</strong></p><p>${esc(p.who)}</p>${p.html}`,
    });
    log(`Test email sent to ${to}`);
    return finish({ sent: 1, planned: 1, smoke: true, note: `Test email delivered to ${to}. ${p.who}` });
  }
  const forced = !!(request && request.kind === "vote");
  const completed = (await db.state("completed_sessions")) || [];
  const current = await db.state("current_session");
  const up = upcomingSession(completed.length, current);
  if (up.complete) { log("Season complete; nothing to send."); return finish({ sent: 0, planned: 0, note: "The season is complete." }); }
  const start = sessionStart(SEASON.approved_dates[up.number - 1]);
  const hoursUntil = (start.getTime() - now) / 3600000;
  log(`Upcoming: Session ${up.number} on ${SEASON.approved_dates[up.number - 1]} (${hoursUntil.toFixed(1)} h away${up.started ? ", already started" : ""})${forced ? " — reminders requested by the admin" : ""}`);
  if (up.started || hoursUntil < 0) { log("Session started or past; nothing to send."); return finish({ sent: 0, planned: 0, note: `Session ${up.number} has already started, so there is nothing to remind about.` }); }
  const targets = await db.targets(up.number);
  const logged = await db.logged(up.number);
  // A requested run ignores the timing bands but still sends each player at most one message per request.
  const plan = forced
    ? targets.filter((t) => t.kind === "vote" || t.open_seats > 0).map((t) => ({ ...t, stage: `manual-${request.id || "0"}`, label: "requested by the admin" })).filter((t) => !logged.has(`${t.player_id}:${t.stage}`))
    : planReminders(targets, hoursUntil, logged);
  log(`${targets.length} target(s) from the database, ${plan.length} to send now (stage ${forced ? "requested" : voteStage(hoursUntil)?.kind || "none"}, spare window ${spareWindow(hoursUntil)}).`);
  const cap = testMode ? 3 : Infinity;
  let sent = 0;
  const transport = live ? (deps.transport || (await gmail(env))) : null;
  const pusher = live && env.VAPID_PRIVATE_KEY && env.VAPID_PUBLIC_KEY ? (deps.pusher || (await webPush(env))) : null;
  const subs = pusher ? await db.subscriptions(plan.map((t) => t.player_id)) : [];
  let pushed = 0;
  for (const t of plan) {
    if (sent >= cap) { log("Test-mode cap reached; remaining reminders left for the next run."); break; }
    const { to, prefix } = redirectRecipient(t, env);
    const mail = composeEmail(t, up.number, env.SITE_URL, env.ORGANIZER_EMAIL || env.GMAIL_USER);
    if (!live) { log(`DRY RUN → ${to}: ${prefix}${mail.subject}`); continue; }
    if (!(await db.claim(up.number, t.player_id, t.stage))) { log(`Already claimed: player ${t.player_id} ${t.stage}`); continue; }
    try {
      await transport.sendMail({ from: `"Maplewood League" <${env.GMAIL_USER}>`, to, replyTo: env.ORGANIZER_EMAIL || env.GMAIL_USER, subject: prefix + mail.subject, text: mail.text, html: mail.html });
      sent++; log(`Sent ${t.stage} → ${testMode ? "TEST_INBOX" : "player " + t.player_id}`);
      if (pusher && !testMode) for (const sub of subs.filter((x) => x.player_id === t.player_id)) { // push only ever goes to the player's own devices
        try { await pusher.send(sub, composePush(t, up.number, env.SITE_URL)); pushed++; }
        catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await db.dropSubscription(sub.endpoint); log(`Push failed for player ${t.player_id}: ${e.statusCode || e.message}`); }
      }
    } catch (e) {
      await db.unclaim(up.number, t.player_id, t.stage);
      log(`Send failed for player ${t.player_id} (${e.message}); claim released for retry.`);
    }
  }
  // ── Admin digest of vote changes ───────────────────────────────────────────────────────────────
  let digest = 0;
  if (db.voteLog) {
    const last = Number((await db.state("vote_digest_last_id")) || 0);
    const rows = await db.voteLog(last);
    if (rows.length) {
      const d = composeDigest(rows, await db.playersBrief());
      const to = env.ALLOW_REAL_RECIPIENTS === "true" ? env.ORGANIZER_EMAIL || env.GMAIL_USER : env.TEST_INBOX || env.GMAIL_USER;
      if (!live) log(`DRY RUN digest → ${to}: ${d.subject}`);
      else {
        await transport.sendMail({ from: `"Maplewood League" <${env.GMAIL_USER}>`, to, subject: `[Admin] ${d.subject}`, text: d.text });
        await db.setState("vote_digest_last_id", rows[rows.length - 1].id);
        digest = rows.length; log(`Digest of ${rows.length} vote change(s) sent to the admin${d.late ? ` (${d.late} after the deadline)` : ""}`);
      }
    }
  }
  const note = !live ? `Delivery mode is dry-run: ${plan.length} reminder(s) planned, nothing sent. Set LEGACY_DELIVERY_MODE=live to send.`
    : plan.length === 0 ? "Nobody needed a reminder."
    : testMode ? `Sent to the league inbox instead of players (at most ${cap} per run).`
    : `Sent to ${sent} player(s).`;
  return finish({ sent, pushed, planned: plan.length, digest, note });
}
async function webPush(env) {
  const wp = (await import("web-push")).default;
  wp.setVapidDetails(`mailto:${env.ORGANIZER_EMAIL || env.GMAIL_USER}`, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  return { send: (sub, payload) => wp.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: "normal" }) };
}
async function gmail(env) {
  if (!/^[a-z]{16}$/.test(env.GMAIL_APP_PASSWORD || "")) throw new Error("GMAIL_APP_PASSWORD must be a 16-letter Gmail app password");
  const nodemailer = (await import("nodemailer")).default;
  return nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD }, tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) run().then((r) => console.log(JSON.stringify(r))).catch((e) => { console.error(e.message); process.exit(1); });
