import season from "../../automation/season.json";
/**
 * In-memory stand-in for the TEST Supabase project, mirroring the rules in legacy/migrations L01–L03
 * closely enough to drive the whole site headlessly: sign-in codes, organizer second factor, row-level
 * visibility, versioned state, court-scoped scores, registration by invitation and season rollover.
 * It is a test double, not proof of the real database; the SQL rehearsal in legacy/tests/rules.sql covers that.
 */
import type { Page, Route } from "@playwright/test";

export const SB = "https://wgolevihkvmosajumzvl.supabase.co";
export const ORGANIZER = "christygeorge993@gmail.com";

export interface Player {
  id: number; name: string; email: string; phone: string; emergency: string; medical: string; sig: string;
  waiver_signed: boolean; paid: boolean; email_reminders?: boolean; declared_payment?: string; current_court: number; highest_court: number; season_wins: number;
  season_losses: number; games_played: number; no_show_count: number; membership_type: string; created_at: string;
  approved: boolean; waitlisted: boolean; registered_at: string | null; admin_note: string; user_id: string | null;
}
export interface MockState {
  players: Player[];
  announcements: { id: number; content: string; created_at: string }[];
  state: Record<string, { value: string; version: number }>;
  rsvps: { session_number: number; player_id: number; response: string; note: string; updated_at: string }[];
  payments: { id: number; player_id: number; kind: string; amount: number; session_number: number | null; method: string; received_on: string; note: string }[];
  pushSubs: { player_id: number; endpoint: string; p256dh: string; auth: string }[];
  nowMs?: number; // fake "now" for the database clock (voting lock)
  questions: { id: number; player_id: number | null; asker: string; question: string; answer: string | null; answered_at: string | null; created_at: string }[];
  invitations: Record<string, string>;
  admins: string[];
  users: Record<string, string>; // email -> uid
  factors: Record<string, boolean>; // uid -> enrolled
  audit: { action: string; subject?: string }[];
  requests: string[];
}

const b64url = (s: string) => Buffer.from(s).toString("base64url");
export function token(uid: string, email: string, aal: "aal1" | "aal2") {
  return `${b64url('{"alg":"none"}')}.${b64url(JSON.stringify({ sub: uid, email, aal, exp: 4102444800 }))}.sig`;
}
function claims(req: { headers(): Record<string, string> }, state: MockState) {
  const auth = req.headers()["authorization"] || "";
  const t = auth.replace(/^Bearer /, "");
  if (!t.includes(".")) return null;
  try {
    const p = JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());
    if (!Object.values(state.users).includes(p.sub)) return null;
    return { uid: p.sub as string, email: String(p.email).toLowerCase(), aal: p.aal as string };
  } catch {
    return null;
  }
}

function refreshPaid(s: MockState, playerId: number) {
  const p = s.players.find((x) => x.id === playerId); if (!p) return;
  const rows = s.payments.filter((x) => x.player_id === playerId);
  p.paid = p.membership_type === "spare" ? rows.some((x) => x.kind === "spare") : rows.filter((x) => x.kind === "season" || x.kind === "adjustment").reduce((n, x) => n + x.amount, 0) >= 400;
}
export function seedPlayers(n = 25): Player[] {
  const rows: Player[] = [];
  for (let i = 1; i <= n; i++)
    rows.push({
      id: i, name: `TEST Player ${String(i).padStart(2, "0")}`, email: `test-player-${String(i).padStart(2, "0")}@example.invalid`,
      phone: "", emergency: "", medical: "", sig: "admin", waiver_signed: true, paid: true,
      current_court: Math.min(6, Math.ceil(i / 4)), highest_court: Math.min(6, Math.ceil(i / 4)), season_wins: 0, season_losses: 0,
      games_played: 0, no_show_count: 0, membership_type: "regular", created_at: new Date(2026, 8, 1, 0, 0, i).toISOString(),
      approved: true, waitlisted: false, registered_at: "2026-09-02T00:00:00Z", admin_note: "", user_id: null,
    });
  return rows;
}
export function freshState(): MockState {
  return {
    players: seedPlayers(25), announcements: [], state: {}, rsvps: [], questions: [], payments: [], pushSubs: [],
    invitations: { "christygeorge993+regular@gmail.com": "regular", "christygeorge993+spare@gmail.com": "spare" },
    admins: [ORGANIZER], users: { [ORGANIZER]: "00000000-0000-4000-8000-000000000001" }, factors: {}, audit: [], requests: [],
  };
}

const PUBLIC_COLS = ["id", "name", "paid", "current_court", "highest_court", "season_wins", "season_losses", "games_played", "no_show_count", "membership_type", "approved", "waitlisted", "registered_at", "created_at"];
function publicRow(p: Player) {
  const o: Record<string, unknown> = {};
  for (const c of PUBLIC_COLS) o[c] = (p as unknown as Record<string, unknown>)[c];
  o.waiver_ok = p.waiver_signed || (!!p.sig && p.sig !== "admin");
  o.has_account = !!p.user_id;
  return o;
}
function filters(url: URL) {
  const f: Record<string, string> = {};
  for (const [k, v] of url.searchParams) if (v.startsWith("eq.")) f[k] = decodeURIComponent(v.slice(3));
  return f;
}
function matches(row: Record<string, unknown>, f: Record<string, string>) {
  return Object.entries(f).every(([k, v]) => String(row[k]) === v);
}
function isAdmin(c: { uid: string; email: string; aal: string } | null, s: MockState) {
  return !!c && c.aal === "aal2" && s.admins.includes(c.email);
}
function myPlayerId(c: { uid: string; email: string } | null, s: MockState) {
  if (!c) return null;
  const p = s.players.find((x) => x.user_id === c.uid) || s.players.find((x) => !x.user_id && x.email.toLowerCase() === c.email);
  return p ? p.id : null;
}

export async function installMock(page: Page, s: MockState) {
  await page.route(`${SB}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    s.requests.push(`${method} ${path}${url.search}`);
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const body = () => (req.postData() ? JSON.parse(req.postData()!) : {});
    const c = claims(req, s);
    // ── Auth ──
    if (path === "/auth/v1/otp") return json(200, {});
    if (path === "/auth/v1/verify") {
      const { email, token: code } = body();
      if (code !== "123456") return json(400, { msg: "Token has expired or is invalid" });
      const em = String(email).toLowerCase();
      if (!s.users[em]) s.users[em] = `00000000-0000-4000-8000-${String(Object.keys(s.users).length + 1).padStart(12, "0")}`;
      const uid = s.users[em];
      return json(200, { access_token: token(uid, em, "aal1"), refresh_token: "r", expires_in: 3600, user: { id: uid, email: em } });
    }
    if (path === "/auth/v1/token") {
      if (!c) return json(400, { error: "invalid" });
      return json(200, { access_token: token(c.uid, c.email, c.aal as "aal1"), refresh_token: "r", expires_in: 3600, user: { id: c.uid, email: c.email } });
    }
    if (path === "/auth/v1/logout") return route.fulfill({ status: 204, body: "" });
    if (path === "/auth/v1/user") {
      if (!c) return json(401, { msg: "no session" });
      return json(200, { id: c.uid, email: c.email, factors: s.factors[c.uid] ? [{ id: "factor-1", factor_type: "totp", status: "verified" }] : [] });
    }
    if (path === "/auth/v1/factors" && method === "POST") return json(200, { id: "factor-1", totp: { qr_code: "<svg xmlns='http://www.w3.org/2000/svg'/>", secret: "SYNTHETICSECRET" } });
    if (path === "/auth/v1/factors/factor-1/challenge") return json(200, { id: "challenge-1" });
    if (path === "/auth/v1/factors/factor-1/verify") {
      if (!c) return json(401, { msg: "no session" });
      if (body().code !== "654321") return json(400, { msg: "Invalid TOTP code entered" });
      s.factors[c.uid] = true;
      return json(200, { access_token: token(c.uid, c.email, "aal2"), refresh_token: "r", expires_in: 3600, user: { id: c.uid, email: c.email } });
    }
    // ── Everything below needs a signed-in member ──
    if (!c) return json(401, { message: "permission denied", code: "42501" });
    const admin = isAdmin(c, s);
    const me = myPlayerId(c, s);
    const f = filters(url);
    // ── RPC ──
    if (path.startsWith("/rest/v1/rpc/")) {
      const fn = path.slice("/rest/v1/rpc/".length);
      const a = body();
      const deny = (m: string, code = "42501") => json(code === "40001" ? 409 : 403, { message: m, code }); // PostgREST: 403 insufficient privilege, 409 serialization
      if (fn === "admin_status") return json(200, { organizer: s.admins.includes(c.email), verified: admin, player_id: me, email: c.email });
      if (fn === "set_state") {
        if (!admin) return deny("Organizer verification required");
        const cur = s.state[a.k];
        if (!cur) { if ((a.expected ?? 0) !== 0) return deny("Stale state: refresh before saving", "40001"); s.state[a.k] = { value: a.v, version: 1 }; return json(200, 1); }
        if (a.expected !== cur.version) return deny("Stale state: refresh before saving", "40001");
        cur.value = a.v; cur.version += 1; s.audit.push({ action: "state.set", subject: a.k }); return json(200, cur.version);
      }
      if (fn === "delete_state") { if (!admin) return deny("Organizer verification required"); delete s.state[a.k]; return json(200, null); }
      if (fn === "set_rsvp") {
        if (a.p_player !== me && !admin) return deny("You can only answer for yourself");
        const target = s.players.find((x) => x.id === a.p_player);
        const startIso = season.approved_dates[a.p_session - 1];
        const startMs = startIso ? new Date(`${startIso}T20:00:00-04:00`).getTime() : 0; // Ottawa (EDT during the test dates)
        if (!admin && target && target.membership_type !== "spare" && startMs && (s.nowMs ?? Date.now()) > startMs - 48 * 3600000) return deny("Voting closed 48 hours before play. Message the admin in the group to change your answer.");
        const ex = s.rsvps.find((r) => r.session_number === a.p_session && r.player_id === a.p_player);
        if (ex) { ex.response = a.p_response; ex.updated_at = new Date().toISOString(); } else s.rsvps.push({ session_number: a.p_session, player_id: a.p_player, response: a.p_response, note: a.p_note || "", updated_at: new Date().toISOString() });
        return json(200, null);
      }
      if (fn === "register_me") {
        const inv = s.invitations[c.email];
        const existing = s.players.find((x) => x.user_id === c.uid) || s.players.find((x) => !x.user_id && x.email.toLowerCase() === c.email);
        if (!existing && !inv && !s.admins.includes(c.email)) return deny("Registration is closed. This link is for players Christy has confirmed; contact the organizer if you were accepted.");
        const declared = ["paid_full", "will_pay", "per_session"].includes(a.p_payment) ? a.p_payment : "";
        if (existing) { Object.assign(existing, { declared_payment: declared || existing.declared_payment || "", name: a.p_name, phone: a.p_phone ?? existing.phone, emergency: a.p_emergency ?? existing.emergency, medical: a.p_medical ?? existing.medical, sig: a.p_sig || existing.sig, waiver_signed: !!a.p_sig || existing.waiver_signed, registered_at: new Date().toISOString(), user_id: c.uid }); return json(200, existing.id); }
        const id = Math.max(0, ...s.players.map((p) => p.id)) + 1;
        s.players.push({ id, name: a.p_name, email: c.email, phone: a.p_phone || "", emergency: a.p_emergency || "", medical: a.p_medical || "", sig: a.p_sig || "", waiver_signed: !!a.p_sig, paid: false, current_court: 0, highest_court: 0, season_wins: 0, season_losses: 0, games_played: 0, no_show_count: 0, membership_type: inv || a.p_membership || "regular", declared_payment: declared, created_at: new Date().toISOString(), approved: false, waitlisted: false, registered_at: new Date().toISOString(), admin_note: "", user_id: c.uid });
        return json(200, id);
      }
      if (fn === "save_court_scores") {
        const st = s.state["current_session"]; if (!st) return json(400, { message: "No active session" });
        const cur = JSON.parse(st.value);
        if (a.p_expected != null && a.p_expected !== st.version) return deny("Stale state: refresh before saving", "40001");
        if ((cur.cycle || 1) !== a.p_cycle) return deny("That round is over — refresh to see the current round", "40001");
        if (cur.completed) return json(400, { message: "Session is complete; scores are locked" });
        const assigned: number[] = cur.assignments?.[String(a.p_court)] || [];
        if (!admin && (me == null || !assigned.includes(me))) return deny("Only players on this court (or the organizer) can enter its scores");
        const target = assigned.length === 5 ? 15 : 21;
        let cnt = 0;
        for (const [k, sc] of Object.entries(a.p_scores as Record<string, { sA: number; sB: number; w: string }>)) {
          if (!new RegExp(`^c${a.p_court}_y${a.p_cycle}_g[1-5]$`).test(k)) return json(400, { message: `Score key ${k} is not on this court/round` });
          const hi = Math.max(sc.sA, sc.sB), lo = Math.min(sc.sA, sc.sB);
          if (sc.sA === sc.sB || hi !== target || lo >= target || lo < 0) return json(400, { message: `Game ${k} must finish at ${target} with no tie` });
          if (sc.w !== (sc.sA > sc.sB ? "A" : "B")) return json(400, { message: "Winner flag does not match" });
          cur.scores = cur.scores || {}; cur.scores[k] = sc; cnt++;
        }
        if (!cnt) return json(400, { message: "No scores supplied" });
        st.value = JSON.stringify(cur); st.version += 1; s.audit.push({ action: "scores.saved", subject: `court ${a.p_court}` });
        return json(200, st.version);
      }
      if (fn === "start_new_season") {
        if (!admin) return deny("Organizer verification required");
        if (s.state["current_session"]) return json(400, { message: "End the active session before starting a new season" });
        if (s.state[`archive_${a.p_label}`]) return json(400, { message: "Unique archive label required" });
        s.state[`archive_${a.p_label}`] = { value: JSON.stringify({ label: a.p_label, completed_sessions: JSON.parse(s.state["completed_sessions"]?.value || "[]"), players: s.players.map((p) => ({ id: p.id, season_wins: p.season_wins })) }), version: 1 };
        for (const k of Object.keys(s.state)) if (/^(completed_sessions|player_approvals|membership_overrides|pre_session_attendance|round_snapshots|votes_session_|rsvp_session_)/.test(k)) delete s.state[k];
        s.rsvps = [];
        let n = 0; for (const p of s.players) { Object.assign(p, { season_wins: 0, season_losses: 0, games_played: 0, no_show_count: 0, paid: false, approved: false, waitlisted: false, registered_at: null }); n++; }
        return json(200, { archived: a.p_label, players_reset: n });
      }
      if (fn === "rebuild_player_stats") {
        if (!admin) return deny("Organizer verification required");
        const sessions = JSON.parse(s.state["completed_sessions"]?.value || "[]") as { scores?: Record<string, { a1: number | null; a2: number | null; b1: number | null; b2: number | null; w: string }> }[];
        const cur = s.state["current_session"] ? JSON.parse(s.state["current_session"].value) : null;
        const counted = new Set<number>((cur?.movements || []).map((m: { cycle: number }) => m.cycle));
        const games = sessions.flatMap((x) => Object.values(x.scores || {}));
        if (cur?.scores) for (const [k, sc] of Object.entries(cur.scores as Record<string, never>)) { const m = k.match(/_y(\d+)_/); if (m && counted.has(parseInt(m[1]))) games.push(sc); }
        const t: Record<number, { g: number; w: number; l: number }> = {};
        for (const sc of games) {
          for (const id of [sc.a1, sc.a2]) if (typeof id === "number") { t[id] = t[id] || { g: 0, w: 0, l: 0 }; t[id].g++; if (sc.w === "A") t[id].w++; else if (sc.w === "B") t[id].l++; }
          for (const id of [sc.b1, sc.b2]) if (typeof id === "number") { t[id] = t[id] || { g: 0, w: 0, l: 0 }; t[id].g++; if (sc.w === "B") t[id].w++; else if (sc.w === "A") t[id].l++; }
        }
        let n = 0;
        for (const p of s.players) { const x = t[p.id] || { g: 0, w: 0, l: 0 }; if (p.season_wins !== x.w || p.season_losses !== x.l || p.games_played !== x.g) { Object.assign(p, { season_wins: x.w, season_losses: x.l, games_played: x.g }); n++; } }
        s.audit.push({ action: "stats.rebuilt" });
        return json(200, { players_changed: n });
      }
      if (fn === "set_email_reminders") { const p = s.players.find((x) => x.id === me); if (!p) return deny("No player record"); p.email_reminders = !!a.p_on; return json(200, null); }
      if (fn === "record_payment") {
        if (!admin) return deny("Organizer verification required");
        const id = s.payments.length + 1;
        s.payments.push({ id, player_id: a.p_player, kind: a.p_kind, amount: Number(a.p_amount), session_number: a.p_session ?? null, method: "e-transfer", received_on: a.p_received_on || new Date().toISOString().slice(0, 10), note: a.p_note || "" });
        refreshPaid(s, a.p_player); s.audit.push({ action: "payment.recorded", subject: String(a.p_player) });
        return json(200, id);
      }
      if (fn === "delete_payment") { if (!admin) return deny("Organizer verification required"); const row = s.payments.find((x) => x.id === a.p_id); s.payments = s.payments.filter((x) => x.id !== a.p_id); if (row) refreshPaid(s, row.player_id); return json(200, null); }
      if (fn === "save_push_subscription") { if (!me) return deny("No player record"); if (!String(a.p_endpoint).startsWith("https://")) return json(400, { message: "Invalid subscription" }); s.pushSubs = s.pushSubs.filter((x) => x.endpoint !== a.p_endpoint); s.pushSubs.push({ player_id: me, endpoint: a.p_endpoint, p256dh: a.p_p256dh, auth: a.p_auth }); return json(200, null); }
      if (fn === "update_my_profile") return json(200, null);
      return json(404, { message: `unknown rpc ${fn}` });
    }
    // ── Tables ──
    const table = path.replace("/rest/v1/", "");
    if (table === "players") {
      if (method === "GET") { const rows = admin ? s.players : s.players.filter((p) => p.user_id === c.uid || (!p.user_id && p.email.toLowerCase() === c.email)); return json(200, rows.filter((r) => matches(r as unknown as Record<string, unknown>, f))); }
      if (!admin) return json(403, { message: "permission denied", code: "42501" });
      if (method === "PATCH") { const rows = s.players.filter((r) => matches(r as unknown as Record<string, unknown>, f)); rows.forEach((r) => Object.assign(r, body())); return json(200, rows); }
      if (method === "POST") { const id = Math.max(0, ...s.players.map((p) => p.id)) + 1; const row = { ...seedPlayers(1)[0], ...body(), id, created_at: new Date().toISOString() }; s.players.push(row); return json(201, [row]); }
      if (method === "DELETE") { s.players = s.players.filter((r) => !matches(r as unknown as Record<string, unknown>, f)); return route.fulfill({ status: 204, body: "" }); }
    }
    if (table === "players_public" && method === "GET") return json(200, s.players.map(publicRow).filter((r) => matches(r, f)));
    if (table === "invitations") {
      if (!admin) return json(403, { message: "permission denied", code: "42501" });
      if (method === "GET") return json(200, Object.entries(s.invitations).map(([email, membership_type]) => ({ email, membership_type, note: "", created_at: "2026-09-01T00:00:00Z" })));
      if (method === "POST") { const b = body(); s.invitations[b.email] = b.membership_type; return json(201, [b]); }
      if (method === "DELETE") { const em = decodeURIComponent(String(f.email || "").replace(/^eq\./, "")); delete s.invitations[em]; return route.fulfill({ status: 204, body: "" }); }
    }
    if (table === "announcements") {
      if (method === "GET") return json(200, [...s.announcements].reverse());
      if (!admin) return json(403, { message: "permission denied", code: "42501" });
      if (method === "POST") { const row = { id: s.announcements.length + 1, created_at: new Date().toISOString(), ...body() }; s.announcements.push(row); return json(201, [row]); }
      if (method === "DELETE") { s.announcements = s.announcements.filter((r) => !matches(r as unknown as Record<string, unknown>, f)); return route.fulfill({ status: 204, body: "" }); }
    }
    if (table === "app_state" && method === "GET") {
      const rows = Object.entries(s.state).filter(([k]) => admin || (!k.startsWith("snapshot_") && !["admin_pin", "pin", "invite_code"].includes(k))).map(([key, v]) => ({ key, value: v.value, version: v.version, created_at: "2026-09-01T00:00:00Z" }));
      return json(200, rows.filter((r) => matches(r, f)));
    }
    if (table === "rsvps" && method === "GET") return json(200, s.rsvps.filter((r) => matches(r as unknown as Record<string, unknown>, f)));
    if (table === "payments" && method === "GET") return json(200, s.payments.filter((r) => admin || r.player_id === me).filter((r) => matches(r as unknown as Record<string, unknown>, f)));
    if (table === "questions") {
      if (method === "GET") return json(200, s.questions);
      if (method === "POST") { const b = body(); if (b.player_id !== me) return json(403, { message: "permission denied", code: "42501" }); const row = { id: s.questions.length + 1, player_id: b.player_id, asker: b.asker, question: b.question, answer: null, answered_at: null, created_at: new Date().toISOString() }; s.questions.push(row); return json(201, [row]); }
      if (!admin) return json(403, { message: "permission denied", code: "42501" });
      if (method === "PATCH") { const rows = s.questions.filter((r) => matches(r as unknown as Record<string, unknown>, f)); rows.forEach((r) => Object.assign(r, body())); return json(200, rows); }
      if (method === "DELETE") { s.questions = s.questions.filter((r) => !matches(r as unknown as Record<string, unknown>, f)); return route.fulfill({ status: 204, body: "" }); }
    }
    return json(404, { message: `unhandled ${method} ${path}` });
  });
}
