import season from "../../automation/season.json";
/**
 * In-memory stand-in for the TEST Supabase project, mirroring the rules in legacy/migrations L01–L03
 * closely enough to drive the whole site headlessly: sign-in codes, organizer second factor, row-level
 * visibility, versioned state, court-scoped scores, registration by invitation and season rollover.
 * It is a test double, not proof of the real database; the SQL rehearsal in legacy/tests/rules.sql covers that.
 */
import type { Page, Route } from "@playwright/test";
import { guardContext } from "./isolation";
import { waiverVersions, acceptanceProblem, recordAcceptance, type WaiverVersion, type Acceptance } from "./mock-waiver";

export const SB = "https://wgolevihkvmosajumzvl.supabase.co";
export const ORGANIZER = "christygeorge993@gmail.com";

export interface Player {
  id: number; name: string; email: string; phone: string; emergency: string; medical: string; sig: string;
  archived_at?: string | null; legacy_paid?: boolean; waiver_signed: boolean; paid: boolean; email_reminders?: boolean; declared_payment?: string; current_court: number; highest_court: number; season_wins: number;
  season_losses: number; games_played: number; no_show_count: number; membership_type: string; created_at: string;
  approved: boolean; waitlisted: boolean; registered_at: string | null; admin_note: string; user_id: string | null;
}
export interface MockState {
  players: Player[];
  announcements: { id: number; content: string; created_at: string }[];
  state: Record<string, { value: string; version: number }>;
  rsvps: { session_number: number; player_id: number; response: string; note: string; updated_at: string }[];
  payments: { request_id?: string; id: number; player_id: number; kind: string; amount: number; session_number: number | null; method: string; received_on: string; note: string }[];
  pushSubs: { player_id: number; endpoint: string; p256dh: string; auth: string }[];
  nowMs?: number; // fake "now" for the database clock (voting lock)
  undo: { id: number; created_at: string; label: string; actor_email: string; snapshot: string }[];
  rsvpLog: { id: number; session_number: number; player_id: number; old_response: string | null; new_response: string; by_admin: boolean; changed_at: string }[];
  questions: { id: number; player_id: number | null; asker: string; question: string; answer: string | null; answered_at: string | null; created_at: string }[];
  invitations: Record<string, string>;
  pastPlayers?: Record<string, unknown>[];
  admins: string[];
  users: Record<string, string>; // email -> uid
  factors: Record<string, boolean>; // uid -> enrolled
  audit: { action: string; subject?: string }[];
  requests: string[];
  blocked?: string[]; // requests the isolation guard stopped (production, another project, the live sites)
  environment?: { name: string; schema_version: string } | null; // L18 marker; undefined = marked test
  schemaErrors?: string[]; // queries refused because they name a column the database table does not have
  holdRead?: { key: string; until: Promise<void>; served: () => void }; // a slow refresh: one app_state read's reply is fixed when asked, delivered when released
  holdTable?: { table: "players" | "payments"; until: Promise<void>; served: () => void }; // the same for one read of a table (p58 tests)
  // A slow, uneven connection (p63 tests): every reply is fixed when the request arrives and delivered min–max ms later,
  // so replies can arrive in a different order than they were asked for, as on a busy phone or a slow machine.
  latency?: { min: number; max: number; seed: number };
  holdRpc?: { fn: string; until: Promise<void>; served: () => void }; // a save's reply held after the database applied it (p63 tests)
  holdRest?: { path: string; until: Promise<void> };   // p73: a reply that never arrives, to test the page's time limit
  waiverVersions?: WaiverVersion[];    // L20
  waiverAcceptances?: Acceptance[];
}

const defaultSeason={...season,registration_start:'2026-09-01',regular_capacity:26,end_time_local:'22:00'};
function leagueInstant(d:string,time:string,zone:string){const[y,m,day]=d.split('-').map(Number),[h,min]=time.split(':').map(Number),target=Date.UTC(y,m-1,day,h,min);let instant=target;const f=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});for(let i=0;i<3;i++){const p=Object.fromEntries(f.formatToParts(new Date(instant)).map(p=>[p.type,p.value]));instant+=target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);}return new Date(instant).toISOString();}
function roundComplete(cur:any){const courts=Object.entries(cur.assignments||{}).filter(([,ids])=>(ids as number[]).length);return courts.length>0&&courts.every(([c,ids])=>{const n=(ids as number[]).length,p=`c${c}_y${cur.cycle}_g`,sc=cur.scores||{},count=n===5?5:n===2&&sc[p+'1']&&sc[p+'1'].w===sc[p+'2']?.w?2:3;return n>=2&&n<=5&&Array.from({length:count},(_,i)=>sc[p+(i+1)]).every(Boolean);});}
const b64url = (s: string) => Buffer.from(s).toString("base64url");
export function token(uid: string, email: string, aal: "aal1" | "aal2") {
  return `${b64url('{"alg":"none"}')}.${b64url(JSON.stringify({ iss:SB+"/auth/v1", sub: uid, email, aal, exp: 4102444800 }))}.sig`;
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
  const config=JSON.parse(s.state.season_config?.value||JSON.stringify(defaultSeason)),cur=JSON.parse(s.state.current_session?.value||'null'),done=new Set(JSON.parse(s.state.completed_sessions?.value||'[]').map((x:{number:number})=>x.number)),n=cur?.number||config.approved_dates.findIndex((_:string,i:number)=>!done.has(i+1))+1;
  p.paid=p.membership_type==='spare'?rows.filter(x=>x.kind==='spare'&&x.session_number===n).reduce((t,x)=>t+x.amount,0)>=config.fees.spare_session:rows.filter(x=>x.kind==='season'||x.kind==='adjustment').reduce((t,x)=>t+x.amount,0)>=config.fees.regular_season;
}
function rebuildMockStats(s:MockState){
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
return n;
}
function snapshot(s:MockState,label:string){
 const key='snapshot_'+crypto.randomUUID(),tables={players:s.players,payments:s.payments,rsvps:s.rsvps,announcements:s.announcements,questions:s.questions,invitations:Object.entries(s.invitations).map(([email,membership_type])=>({email,membership_type})),past_players:s.pastPlayers,waiver_versions:s.waiverVersions,waiver_acceptances:s.waiverAcceptances,app_state:Object.entries(s.state).filter(([k])=>!k.startsWith('snapshot_')&&!['reminder_request','reminder_last_run','vote_digest_last_id'].includes(k)).map(([key,v])=>({key,...v}))};
 s.state[key]={value:JSON.stringify({format:2,environment:'test',label,ts:new Date().toISOString(),tables}),version:1};return key;
}
const TRACKED = ["current_session", "completed_sessions", "player_approvals", "membership_overrides", "pre_session_attendance"];
export function captureState(s: MockState) {
  return JSON.stringify({
    app_state: Object.fromEntries(TRACKED.filter((k) => s.state[k]).map((k) => [k, s.state[k].value])),
    players: [...s.players].sort((a, b) => a.id - b.id).map((p) => ({ id: p.id, archived_at:p.archived_at||null, current_court: p.current_court, highest_court: p.highest_court, no_show_count: p.no_show_count, approved: p.approved, waitlisted: p.waitlisted, membership_type: p.membership_type, season_wins: p.season_wins, season_losses: p.season_losses, games_played: p.games_played })),
  });
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
    players: seedPlayers(25), announcements: [], state: {}, rsvps: [], questions: [], payments: [], pushSubs: [], rsvpLog: [], undo: [],
    invitations: { "christygeorge993+regular@gmail.com": "regular", "christygeorge993+spare@gmail.com": "spare" },
    admins: [ORGANIZER], users: { [ORGANIZER]: "00000000-0000-4000-8000-000000000001" }, factors: {}, audit: [], requests: [],
    waiverVersions: waiverVersions(), waiverAcceptances: [],
  };
}

const PUBLIC_COLS = ["id", "name", "paid", "current_court", "highest_court", "season_wins", "season_losses", "games_played", "no_show_count", "membership_type", "approved", "waitlisted", "registered_at", "created_at"];
function publicRow(p: Player,s: MockState) {
  const o: Record<string, unknown> = {};
  for (const c of PUBLIC_COLS) o[c] = (p as unknown as Record<string, unknown>)[c];
  o.waiver_ok = (s.waiverAcceptances||[]).some(a=>a.waiver_version===(s.waiverVersions||[]).find(v=>v.is_current)?.version&&(a.player_id===p.id||!!p.user_id&&a.user_id===p.user_id));
  o.has_account = !!p.user_id;
  return o;
}
/** PostgREST-style ordering: order=col.asc|desc[,col2.desc]; stable, nulls last ascending and first descending. */
function ordered<T>(rows: T[], url: URL): T[] {
  const spec = url.searchParams.get("order"); if (!spec) return rows;
  const keys = spec.split(",").map((x) => { const [col, dir] = x.split("."); return { col, desc: dir === "desc" }; });
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const x = (a as Record<string, unknown>)[k.col], y = (b as Record<string, unknown>)[k.col];
      if (x === y) continue; if (x == null) return k.desc ? -1 : 1; if (y == null) return k.desc ? 1 : -1;
      return (x < y ? -1 : 1) * (k.desc ? -1 : 1);
    }
    return 0;
  });
}
const nextId = (rows: { id: number }[]) => Math.max(0, ...rows.map((r) => r.id)) + 1;
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


/** Columns of the tables added in L18–L20, exactly as the TEST database has them (information_schema, September 12).
 *  The database refuses a column it does not have (PostgREST error 42703); the stand-in does the same for these tables. */
const REAL_COLUMNS: Record<string, string[]> = {
  environment: ["id", "name", "schema_version", "marked_at"],
  waiver_versions: ["version", "title", "body", "sha256", "published_at", "is_current", "note"],
  waiver_acceptances: ["id", "player_id", "user_id", "email", "participant_name", "typed_signature", "waiver_version", "waiver_sha256", "accepted_at", "client_timezone", "client_utc_offset_minutes", "action", "age_declaration", "minor_name", "media_consent", "registration_ref", "user_agent"],
};

export async function installMock(page: Page, s: MockState) {
  s.blocked = s.blocked || [];
  // SLOW_NET=40-400 runs any suite on a slow, uneven connection (see MockState.latency).
  const slow = process.env.SLOW_NET?.match(/^(\d+)-(\d+)$/);
  if (slow && !s.latency) s.latency = { min: Number(slow[1]), max: Number(slow[2]), seed: 1 };
  await guardContext(page.context(), s.blocked);
  await page.route(`${SB}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    s.requests.push(`${method} ${path}${url.search}`);
    const json = async (status: number, body: unknown) => {
      const text = JSON.stringify(body), l = s.latency;   // the reply as it is now, whenever it arrives
      if (l) { l.seed = (l.seed * 1103515245 + 12345) % 2147483648; await new Promise((r) => setTimeout(r, l.min + (l.seed / 2147483648) * (l.max - l.min))); }
      const hr = s.holdRpc; if (hr && path === `/rest/v1/rpc/${hr.fn}`) { s.holdRpc = undefined; hr.served(); await hr.until; }
      const hs = s.holdRest; if (hs && path === hs.path && method === "GET") await hs.until;   // p73: held until the test releases it (a background load must not consume the hold)
      return route.fulfill({ status, contentType: "application/json", body: text });
    };
    const body = () => (req.postData() ? JSON.parse(req.postData()!) : {});
    const c = claims(req, s);
    // A query naming a column the table does not have is refused, as the database refuses it (a missing created_at took the
    // TEST site down: p53). Every suite fails on such a refusal (harness closeCtx).
    const tbl = path.startsWith("/rest/v1/") ? path.slice(9) : "";
    if (REAL_COLUMNS[tbl] && method === "GET") {
      const cols = [...(url.searchParams.get("select") || "*").split(","), ...(url.searchParams.get("order") || "").split(",").map((o) => o.split(".")[0])].map((x) => x.trim()).filter((x) => x && x !== "*");
      const bad = cols.find((x) => !REAL_COLUMNS[tbl].includes(x));
      if (bad) { (s.schemaErrors ??= []).push(`${method} ${path}${url.search}: no column ${bad}`); return json(400, { code: "42703", message: `column ${tbl}.${bad} does not exist` }); }
    }
    // L18: signed-in users read the environment marker; the site checks it right after sign-in (anonymous: nothing).
    // L20: signed-in users read the waiver wording (not logged: the site checks the current version on every sync).
    if (path === "/rest/v1/waiver_versions" && method === "GET") { s.requests.pop(); if (!c) return json(401, { message: "permission denied", code: "42501" }); const vs = (s.waiverVersions ??= waiverVersions()); return json(200, ordered(vs.filter((r) => matches(r as unknown as Record<string, unknown>, filters(url))), url)); }
    if (path === "/rest/v1/environment" && method === "GET") { s.requests.pop(); if (!c) return json(401, { message: "permission denied", code: "42501" }); return json(200, s.environment === undefined ? [{ name: "test", schema_version: "L24" }] : s.environment ? [s.environment] : []); }
    // ── Auth ──
    if (path === "/auth/v1/otp") return json(200, {});
    if (path === "/auth/v1/verify") {
      const { email, token: code } = body();
      if (code !== "123456" && code !== "12345678") return json(400, { msg: "Token has expired or is invalid" });   // Supabase sends 6 or 8 digits (a project setting)
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
        if(['pin','admin_pin','invite_code','season_config'].includes(a.k))return deny('Retired key');
        const data=JSON.parse(a.v),old=s.state[a.k];
        if(old&&a.expected!==old.version||!old&&(a.expected??0)!==0)return deny('Stale state: refresh before saving','40001');
        if(a.k==='player_approvals'||a.k==='membership_overrides'){
          const next=structuredClone(s.players);
          for(const [id,x] of Object.entries(data)){const p=next.find(p=>p.id===Number(id));if(!p)continue;if(a.k==='membership_overrides')p.membership_type=String(x);else{const v=x as {approved?:boolean;waitlisted?:boolean;membershipType?:string};if(v.approved!==undefined)p.approved=v.approved;if(v.waitlisted!==undefined)p.waitlisted=v.waitlisted;if(v.membershipType)p.membership_type=v.membershipType;}}
          if(next.some(p=>!['regular','spare'].includes(p.membership_type)))return deny('Invalid membership type');
          const capacity=JSON.parse(s.state.season_config?.value||JSON.stringify(defaultSeason)).regular_capacity;
          if(next.filter(p=>!p.archived_at&&p.approved&&!p.waitlisted&&p.membership_type==='regular').length>Math.max(capacity,s.players.filter(p=>!p.archived_at&&p.approved&&!p.waitlisted&&p.membership_type==='regular').length))return deny('Regular places are full; keep the player on the waitlist');
          s.players=next;
        }
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
        const prior=s.rsvps.find(r=>r.session_number===a.p_session&&r.player_id===a.p_player);
        if(prior?.response===a.p_response){prior.note=a.p_note||'';return json(200,null);}
        const startIso = season.approved_dates[a.p_session - 1];
        const startMs = startIso ? new Date(`${startIso}T20:00:00-04:00`).getTime() : 0; // Ottawa (EDT during the test dates)
        if (!admin && target && target.membership_type !== "spare" && startMs && (s.nowMs ?? Date.now()) > startMs - 46 * 3600000) return deny("Voting closed Sunday 10:00 PM. Message the admin in the group to change your answer.");
        const ex = s.rsvps.find((r) => r.session_number === a.p_session && r.player_id === a.p_player);
        const nowIso = new Date(s.nowMs ?? Date.now()).toISOString();
        if (!ex || ex.response !== a.p_response) s.rsvpLog.push({ id: s.rsvpLog.length + 1, session_number: a.p_session, player_id: a.p_player, old_response: ex ? ex.response : null, new_response: a.p_response, by_admin: admin, changed_at: nowIso });
        if (ex) { ex.response = a.p_response; ex.updated_at = nowIso; } else s.rsvps.push({ session_number: a.p_session, player_id: a.p_player, response: a.p_response, note: a.p_note || "", updated_at: nowIso });
        return json(200, null);
      }
      if (fn === "register_me") {
        const inv = s.invitations[c.email];
        const existing = s.players.find((x) => x.user_id === c.uid) || s.players.find((x) => !x.user_id && x.email.toLowerCase() === c.email);
        // L25: open registration — anyone signed in with a verified email registers as pending; an invitation only sets the type.
        // L20: the registration also records the acceptance of the exact current waiver wording, or is refused.
        const wa = { player_id: null as number | null, user_id: c.uid, email: c.email, name: a.p_name, version: a.p_waiver_version, sha: a.p_waiver_sha, sig: a.p_waiver_sig, tz: a.p_tz, offset: a.p_offset, action: "registration" as const, age: a.p_age, minor: a.p_minor, media: a.p_media, ua: a.p_ua };
        const wp = acceptanceProblem(s.waiverVersions ??= waiverVersions(), wa);
        if (wp) return json(400, { message: wp, code: "22023" });
        const wNow = new Date(s.nowMs ?? Date.now()).toISOString();
        const declared = ["paid_full", "will_pay", "per_session"].includes(a.p_payment) ? a.p_payment : "";
        if (existing) { Object.assign(existing, { approved:existing.archived_at?false:existing.approved,waitlisted:existing.archived_at?false:existing.waitlisted,archived_at:null,membership_type:inv||existing.membership_type,declared_payment: declared || existing.declared_payment || "", name: a.p_name, phone: a.p_phone ?? existing.phone, emergency: a.p_emergency ?? existing.emergency, medical: a.p_medical ?? existing.medical, sig: a.p_sig || existing.sig, waiver_signed: !!a.p_sig || existing.waiver_signed, registered_at: new Date().toISOString(), user_id: c.uid }); recordAcceptance(s.waiverVersions!, s.waiverAcceptances ??= [], { ...wa, player_id: existing.id }, wNow); return json(200, existing.id); }
        const id = Math.max(0, ...s.players.map((p) => p.id)) + 1;
        s.players.push({ id, name: a.p_name, email: c.email, phone: a.p_phone || "", emergency: a.p_emergency || "", medical: a.p_medical || "", sig: a.p_sig || "", waiver_signed: !!a.p_sig, paid: false, current_court: 0, highest_court: 0, season_wins: 0, season_losses: 0, games_played: 0, no_show_count: 0, membership_type: inv || a.p_membership || "regular", declared_payment: declared, created_at: new Date().toISOString(), approved: false, waitlisted: false, registered_at: new Date().toISOString(), admin_note: "", user_id: c.uid });
        recordAcceptance(s.waiverVersions!, s.waiverAcceptances ??= [], { ...wa, player_id: id }, wNow);
        return json(200, id);
      }
      if (fn === "save_court_scores") {
        const st = s.state["current_session"]; if (!st) return json(400, { message: "No active session" });
        const cur = JSON.parse(st.value);
        if (a.p_expected !== st.version || String(a.p_session)!==String(cur.id)) return deny("Stale state: refresh before saving", "40001");
        if ((cur.cycle || 1) !== a.p_cycle) return deny("That round is over — refresh to see the current round", "40001");
        if (cur.completed) return json(400, { message: "Session is complete; scores are locked" });
        const assigned: number[] = cur.assignments?.[String(a.p_court)] || [];
        if (!admin && (me == null || !assigned.includes(me))) return deny("Only players on this court (or the organizer) can enter its scores");
        if(JSON.stringify(a.p_lineup)!==JSON.stringify(assigned))return deny('Stale state: court lineup changed','40001');
        const target = assigned.length === 5 ? 15 : 21;
        let cnt = 0;
        for (const [k, sc] of Object.entries(a.p_scores as Record<string, { sA: number; sB: number; w: string }>)) {
          if (!new RegExp(`^c${a.p_court}_y${a.p_cycle}_g[1-5]$`).test(k)) return json(400, { message: `Score key ${k} is not on this court/round` });
          const hi = Math.max(sc.sA, sc.sB), lo = Math.min(sc.sA, sc.sB);
          if (sc.sA === sc.sB || hi !== target || lo >= target || lo < 0) return json(400, { message: `Game ${k} must finish at ${target} with no tie` });
          if (sc.w !== (sc.sA > sc.sB ? "A" : "B")) return json(400, { message: "Winner flag does not match" });
          cur.scores = cur.scores || {}; cur.scores[k] = sc; cnt++;
        }
        // L19: two players play best of three — no Game 3 once one player has won the first two.
        if (assigned.length === 2) { const g = (n: number) => cur.scores?.[`c${a.p_court}_y${a.p_cycle}_g${n}`]; if(g(1)&&g(2)&&g(1).w===g(2).w){const k=`c${a.p_court}_y${a.p_cycle}_g3`;if(a.p_scores[k])return json(400,{message:'Best of three: there is no Game 3 after one player wins the first two games'});delete cur.scores[k];} }
        if (!cnt) return json(400, { message: "No scores supplied" });
        s.undo.push({ id: (s.undo.at(-1)?.id || 0) + 1, created_at: new Date().toISOString(), label: `Scores: Court ${a.p_court}, Round ${a.p_cycle}`, actor_email: c.email, snapshot: captureState(s) });
        st.value = JSON.stringify(cur); st.version += 1; s.audit.push({ action: "scores.saved", subject: `court ${a.p_court}` });
        return json(200, st.version);
      }
      if (fn === "start_new_season") {
        if (!admin) return deny("Organizer verification required");
        if(!a.p_config?.approved_dates?.length||!a.p_config?.registration_start)return deny("Enter next-season dates and registration start");
        if (s.state["current_session"]) return json(400, { message: "End the active session before starting a new season" });
        if (s.state[`archive_${a.p_label}`]) return json(400, { message: "Unique archive label required" });
        s.state[`archive_${a.p_label}`] = { value: JSON.stringify({ label: a.p_label, completed_sessions: JSON.parse(s.state["completed_sessions"]?.value || "[]"), players: s.players.map((p) => ({ id: p.id, season_wins: p.season_wins })) }), version: 1 };
        for (const k of Object.keys(s.state)) if (/^(completed_sessions|player_approvals|membership_overrides|pre_session_attendance|round_snapshots|votes_session_|rsvp_session_)/.test(k)) delete s.state[k];
        s.rsvps = [];
        const np = s.payments.length; s.payments = [];   // L15: last season's ledger moves to payments_archive
        let n = 0; for (const p of s.players) { Object.assign(p, { season_wins: 0, season_losses: 0, games_played: 0, no_show_count: 0, paid: false, approved: false, waitlisted: false, registered_at: null }); n++; }
        s.state.season_config={value:JSON.stringify(a.p_config),version:(s.state.season_config?.version||0)+1};return json(200, { archived: a.p_label, players_reset: n, payments_archived: np,season:a.p_config.season,sessions:a.p_config.approved_dates.length });
      }
      if(fn==='start_league_session'){
        if(!admin)return deny('Organizer verification required');if(s.state.current_session&&s.state.current_session.value!=='null')return deny('Session already active');
        const cur=a.p_session;
        if(Object.values(cur.assignments as Record<string,number[]>).some(ids=>ids.length===1||ids.length>5))return deny('Courts must have zero or 2–5 players');
        for(const [c,ids]of Object.entries(cur.assignments as Record<string,number[]>))for(const id of ids){const p=s.players.find(p=>p.id===id);if(!p?.approved||p.waitlisted)return deny('Only approved players can start');if(p.membership_type==='spare')p.current_court=Number(c);}
        s.state.current_session={value:JSON.stringify(cur),version:1};delete s.state.pre_session_attendance;return json(200,1);
      }
      if(fn==='add_league_player'){
        if(!admin)return deny('Organizer verification required');const cap=JSON.parse(s.state.season_config?.value||JSON.stringify(defaultSeason)).regular_capacity;
        if(a.p_membership==='regular'&&s.players.filter(p=>!p.archived_at&&p.approved&&!p.waitlisted&&p.membership_type==='regular').length>=cap)return deny('Regular places are full');
        const id=nextId(s.players),court=s.state.current_session?0:a.p_court;s.players.push({...seedPlayers(1)[0],id,name:a.p_name,email:'',membership_type:a.p_membership,current_court:court,highest_court:court,waiver_signed:false,paid:false,registered_at:null});return json(200,id);
      }
      if(fn==='finalize_session'){
        if(!admin)return deny('Organizer verification required');
        const st=s.state.current_session,cur=JSON.parse(st?.value||'null');if(!cur||a.p_expected!==st.version||String(cur.id)!==a.p_session)return deny('Stale state: refresh before ending','40001');
        if(!a.p_early&&(!cur.completed&&!roundComplete(cur)||cur.cycle<2))return deny('Finish both rounds and every court');
        if(a.p_early&&(!a.p_reason?.trim()||!cur.movements?.length))return deny('No completed rounds or early finish reason');
        const final={...a.p_finished,completed:true,ended_early:!!a.p_early,end_reason:a.p_reason||''};
        for(const [court,ids] of Object.entries(final.finalAssignments as Record<string,number[]>))for(const id of ids){const p=s.players.find(p=>p.id===id);if(p&&cur.attendance?.[id]!=='absent'){p.current_court=Number(court);p.highest_court=Math.min(p.highest_court||Number(court),Number(court));}}
        for(const [id,status]of Object.entries(cur.attendance||{}))if(status==='absent'){const p=s.players.find(p=>p.id===Number(id));if(p){p.no_show_count++;p.current_court=Math.min(6,(cur.absentFrom?.[id]||p.current_court||6)+1);}}
        const sessions=JSON.parse(s.state.completed_sessions?.value||'[]');if(sessions.some((x:{number:number})=>x.number===cur.number))return deny('Already completed');sessions.push(final);
        s.state.completed_sessions={value:JSON.stringify(sessions),version:(s.state.completed_sessions?.version||0)+1};delete s.state.current_session;delete s.state.round_snapshots;rebuildMockStats(s);return json(200,final);
      }
      if(fn==='archive_player'){if(!admin)return deny('Organizer verification required');const cur=JSON.parse(s.state.current_session?.value||'null');if(cur&&Object.values(cur.assignments).flat().includes(a.p_player))return deny('Player is assigned tonight; use Adjust courts before archiving');const p=s.players.find(p=>p.id===a.p_player);if(p)Object.assign(p,{archived_at:new Date().toISOString(),approved:false,current_court:0});return json(200,null);}
      if(fn==='save_league_snapshot'){if(!admin)return deny('Organizer verification required');return json(200,snapshot(s,a.p_label));}
      if(fn==='restore_league_snapshot'){
       if(!admin)return deny('Organizer verification required');const d=JSON.parse(s.state[a.p_key]?.value||'null');if(d?.format!==2)return deny('Unsupported snapshot format');
       snapshot(s,'Before restoring '+d.label);
       const snapshots=Object.fromEntries(Object.entries(s.state).filter(([k])=>k.startsWith('snapshot_'))),versions=Object.fromEntries(Object.entries(s.state).map(([k,v])=>[k,v.version]));
       const extra=s.players.filter(p=>!d.tables.players.some((x:Player)=>x.id===p.id)).map(p=>({...p,archived_at:new Date().toISOString(),approved:false,current_court:0}));
       s.players=[...structuredClone(d.tables.players),...extra];s.payments=structuredClone(d.tables.payments);s.rsvps=structuredClone(d.tables.rsvps);s.announcements=structuredClone(d.tables.announcements);s.invitations=Object.fromEntries(d.tables.invitations.map((i:any)=>[i.email,i.membership_type]));s.questions=structuredClone(d.tables.questions);s.state={...Object.fromEntries(d.tables.app_state.map(({key,...v}:any)=>[key,v])),...snapshots};
       for(const [k,v]of Object.entries(s.state))if(!k.startsWith('snapshot_'))v.version=Math.max(versions[k]||0,v.version)+1;
       s.undo=[];return json(200,{restored:a.p_key});
      }
      if(fn==='cancel_league_session'){
       if(!admin)return deny('Organizer verification required');const cur=JSON.parse(s.state.current_session?.value||'null'),config=JSON.parse(s.state.season_config?.value||JSON.stringify(defaultSeason)),history=JSON.parse(s.state.completed_sessions?.value||'[]');
       if(a.p_expected!==(s.state.current_session?.version||0)||cur&&cur.number!==a.p_session)return deny('Session changed; refresh first','40001');
       if(!config.approved_dates[a.p_session-1]||history.some((x:any)=>x.number===a.p_session))return deny('Invalid or completed session');
       if(!a.p_reason?.trim()||!['shuttles','refund','makeup','none'].includes(a.p_resolution))return deny('Reason and compensation required');
       snapshot(s,'Before cancelling session '+a.p_session);
       const compensation=s.players.filter(p=>p.approved&&!p.waitlisted&&!p.archived_at).flatMap(p=>{const paid=s.payments.filter(x=>x.player_id===p.id&&x.kind==='spare'&&x.session_number===a.p_session).reduce((t,x)=>t+x.amount,0);if(p.membership_type==='spare'&&!paid)return[];return[{player_id:p.id,amount:p.membership_type==='spare'?paid:a.p_resolution==='shuttles'?2:a.p_amount,unit:p.membership_type==='spare'||a.p_resolution==='refund'?'CAD':a.p_resolution==='shuttles'?'shuttles':'plan',resolution:a.p_resolution,status:a.p_resolution==='none'?'fulfilled':'pending'}];});
       const finished={number:a.p_session,id:cur?.id||'cancelled-'+a.p_session,date:config.approved_dates[a.p_session-1],status:'cancelled',completed:true,reason:a.p_reason,compensation,scores:{},assignments:{},movements:[]};history.push(finished);
       s.state.completed_sessions={value:JSON.stringify(history),version:(s.state.completed_sessions?.version||0)+1};delete s.state.current_session;delete s.state.round_snapshots;s.undo=[];rebuildMockStats(s);return json(200,finished);
      }
      if(fn==='settle_cancellation'){
       if(!admin)return deny('Organizer verification required');const history=JSON.parse(s.state.completed_sessions?.value||'[]'),entry=history.find((x:any)=>x.number===a.p_session&&x.status==='cancelled')?.compensation.find((x:any)=>x.player_id===a.p_player);if(!entry)return deny('No compensation');if(entry.status!=='fulfilled'){
       if(entry.unit==='CAD'){const paid=s.payments.filter(p=>p.kind==='refund'&&p.player_id===a.p_player&&p.session_number===a.p_session).reduce((t,p)=>t+p.amount,0);if(entry.amount>paid)s.payments.push({id:nextId(s.payments),request_id:crypto.randomUUID(),player_id:a.p_player,kind:'refund',amount:entry.amount-paid,session_number:a.p_session,method:'e-transfer',received_on:'2026-09-13',note:'Cancellation refund'});}
       entry.status='fulfilled';s.state.completed_sessions={value:JSON.stringify(history),version:s.state.completed_sessions.version+1};}return json(200,entry);
      }
      if(fn==='list_league_snapshots'){if(!admin)return deny('Organizer verification required');return json(200,Object.entries(s.state).filter(([k,v])=>k.startsWith('snapshot_')&&v.value!=='null'&&!JSON.parse(v.value)._deleted).map(([key,v])=>{const d=JSON.parse(v.value);return{key,format:d.format||1,label:d.label,ts:d.ts,player_count:d.tables?.players?.length||d.players?.length||0,completed_count:JSON.parse(d.tables?.app_state?.find((x:any)=>x.key==='completed_sessions')?.value||'[]')?.length||0,active_session:!!d.tables?.app_state?.find((x:any)=>x.key==='current_session'&&x.value!=='null')};}));}
      if (fn === "rebuild_player_stats") {
        if (!admin) return deny("Organizer verification required");
        const n=rebuildMockStats(s);
        s.audit.push({ action: "stats.rebuilt" });
        return json(200, { players_changed: n });
      }
      if (fn === "dispatch_reminder_job") {
        if (!admin) return deny("Organizer verification required");
        // The real job runs on GitHub; here it finishes a moment later and reports back the way the job does.
        const req = s.state["reminder_request"] ? JSON.parse(s.state["reminder_request"].value) : null;
        s.audit.push({ action: "dispatch", subject: JSON.stringify(req) });
        setTimeout(() => {
          const sent = req?.kind === "smoke" ? 1 : 0;
          s.state["reminder_last_run"] = { value: JSON.stringify({ at: new Date((s.nowMs ?? Date.now()) + 30000).toISOString(), mode: "test-inbox", sent, planned: sent, note: req?.kind === "smoke" ? `Test email delivered to ${req.to}.` : "Vote reminders checked." }), version: (s.state["reminder_last_run"]?.version || 0) + 1 };
          delete s.state["reminder_request"];
        }, 800);
        return json(200, { dispatched: true, request_id: 1, reason: a.p_reason });
      }
      if (fn === "set_email_reminders") { const p = s.players.find((x) => x.id === me); if (!p) return deny("No player record"); p.email_reminders = !!a.p_on; return json(200, null); }
      if (fn === "record_payment") {
        if (!admin) return deny("Organizer verification required");
        if(!a.p_request||!Number.isFinite(Number(a.p_amount))||Number(a.p_amount)<=0)return deny('A positive payment and request ID are required');
        const prior=s.payments.find(p=>p.request_id===a.p_request);if(prior){if(prior.player_id!==a.p_player||prior.amount!==Number(a.p_amount)||prior.kind!==a.p_kind||prior.session_number!==(a.p_session??null)||prior.note!==(a.p_note||''))return deny('Request ID was used for a different payment');return json(200,prior.id);}
        if(['spare','refund'].includes(a.p_kind)&&(!Number.isInteger(a.p_session)||a.p_session<1||a.p_session>season.approved_dates.length))return deny('A valid session is required');
        const id = nextId(s.payments);
        s.payments.push({ id, request_id:a.p_request, player_id: a.p_player, kind: a.p_kind, amount: Number(a.p_amount), session_number: a.p_session ?? null, method: "e-transfer", received_on: a.p_received_on || new Date().toISOString().slice(0, 10), note: a.p_note || "" });
        refreshPaid(s, a.p_player); s.audit.push({ action: "payment.recorded", subject: String(a.p_player) });
        return json(200, id);
      }
      if (fn === "delete_payment") { if (!admin) return deny("Organizer verification required"); const row = s.payments.find((x) => x.id === a.p_id); s.payments = s.payments.filter((x) => x.id !== a.p_id); if (row) refreshPaid(s, row.player_id); return json(200, null); }
      if(fn==='delete_push_subscription'){s.pushSubs=s.pushSubs.filter(x=>!(x.player_id===me&&x.endpoint===a.p_endpoint));return json(200,null);}
      if (fn === "save_push_subscription") { if (!me) return deny("No player record"); if (!String(a.p_endpoint).startsWith("https://")) return json(400, { message: "Invalid subscription" }); s.pushSubs = s.pushSubs.filter((x) => x.endpoint !== a.p_endpoint); s.pushSubs.push({ player_id: me, endpoint: a.p_endpoint, p256dh: a.p_p256dh, auth: a.p_auth }); return json(200, null); }
      if (fn === "checkpoint") { if (!admin) return deny("Organizer verification required"); const id = (s.undo.at(-1)?.id || 0) + 1; s.undo.push({ id, created_at: new Date().toISOString(), label: String(a.p_label || "Admin action").slice(0, 120), actor_email: c.email, snapshot: captureState(s) }); return json(200, id); }
      if (fn === "checkpoint_settle") { if (!admin) return deny("Organizer verification required"); const e = s.undo.find((x) => x.id === a.p_id); if (e && e.snapshot === captureState(s)) { s.undo = s.undo.filter((x) => x.id !== a.p_id); return json(200, true); } return json(200, false); }
      if (fn === "undo_last") {
        if (!admin) return deny("Organizer verification required");
        const e = s.undo.pop(); if (!e) return json(400, { message: "Nothing to undo" });
        if (e.snapshot === captureState(s)) return json(200, { undone: null, skipped: e.label, taken_at: e.created_at, remaining: s.undo.length });
        const snap = JSON.parse(e.snapshot);
        for (const k of TRACKED) { if (k in snap.app_state) s.state[k] = { value: snap.app_state[k], version: (s.state[k]?.version || 0) + 1 }; else delete s.state[k]; }
        for (const x of snap.players) { const p = s.players.find((q) => q.id === x.id); if (p) Object.assign(p, x); }
        s.audit.push({ action: "undo", subject: e.label });
        return json(200, { undone: e.label, taken_at: e.created_at, remaining: s.undo.length });
      }
      if (fn === "accept_waiver") {
        if (me == null) return deny("Register first — there is no player record for this sign-in");
        const acc = (s.waiverAcceptances ??= []), p = s.players.find((x) => x.id === me)!;
        if (acc.some((x) => x.player_id === me && x.waiver_version === a.p_version)) return json(400, { message: `You have already accepted waiver version ${a.p_version}`, code: "22023" });
        const wa = { player_id: me, user_id: c.uid, email: c.email, name: p.name, version: a.p_version, sha: a.p_sha, sig: a.p_sig, tz: a.p_tz, offset: a.p_offset, action: "updated-version" as const, age: a.p_age, minor: a.p_minor, media: a.p_media, ua: a.p_ua };
        const wp = acceptanceProblem(s.waiverVersions ??= waiverVersions(), wa); if (wp) return json(400, { message: wp, code: "22023" });
        return json(200, recordAcceptance(s.waiverVersions, acc, wa, new Date(s.nowMs ?? Date.now()).toISOString()).id);
      }
      if (fn === "publish_waiver_version") {
        if (!admin) return deny("Organizer verification required");
        const vs = (s.waiverVersions ??= waiverVersions());
        if (!vs.some((v) => v.version === a.p_version)) return json(400, { message: `No waiver version ${a.p_version}`, code: "22023" });
        vs.forEach((v) => (v.is_current = v.version === a.p_version)); s.audit.push({ action: "waiver.published", subject: a.p_version });
        return json(200, null);
      }
      if (fn === "update_my_profile") return json(200, null);
      return json(404, { message: `unknown rpc ${fn}` });
    }
    // ── Tables ──
    const table = path.replace("/rest/v1/", "");
    if (table === "players") {
      if (method === "GET") { const rows = admin ? s.players : s.players.filter((p) => p.user_id === c.uid || (!p.user_id && p.email.toLowerCase() === c.email)); const reply = ordered(rows.filter((r) => matches(r as unknown as Record<string, unknown>, f)), url);
        const h = s.holdTable; if (h && h.table === "players") { s.holdTable = undefined; const frozen = JSON.parse(JSON.stringify(reply)); h.served(); await h.until; return json(200, frozen); }
        return json(200, reply); }
      if (!admin) return json(403, { message: "permission denied", code: "42501" });
      if (method === "PATCH") { const rows = s.players.filter((r) => matches(r as unknown as Record<string, unknown>, f)); rows.forEach((r) => Object.assign(r, body())); return json(200, rows); }
      if (method === "POST") { const b = body(); if (b.id != null && s.players.some((p) => p.id === b.id)) return json(409, { message: "duplicate key value violates unique constraint", code: "23505" }); const id = b.id ?? nextId(s.players); const row = { ...seedPlayers(1)[0], ...b, id, created_at: b.created_at ?? new Date().toISOString() }; s.players.push(row); return json(201, [row]); }
      if (method === "DELETE") { s.players = s.players.filter((r) => !matches(r as unknown as Record<string, unknown>, f)); return route.fulfill({ status: 204, body: "" }); }
    }
    if (table === "players_public" && method === "GET") return json(200, ordered(s.players.filter(p=>!p.archived_at).map(p=>publicRow(p,s)).filter((r) => matches(r, f)), url));
    if (table === "invitations") {
      if (!admin) return json(403, { message: "permission denied", code: "42501" });
      if (method === "GET") return json(200, Object.entries(s.invitations).map(([email, membership_type]) => ({ email, membership_type, note: "", created_at: "2026-09-01T00:00:00Z" })));
      if (method === "POST") { const b = body(); s.invitations[b.email] = b.membership_type; return json(201, [b]); }
      if (method === "DELETE") { const em = decodeURIComponent(String(f.email || "").replace(/^eq\./, "")); delete s.invitations[em]; return route.fulfill({ status: 204, body: "" }); }
    }
    if (table === "waiver_acceptances" && method === "GET") { const all = s.waiverAcceptances ?? []; return json(200, ordered((admin ? all : all.filter((r) => r.user_id === c.uid)).filter((r) => matches(r as unknown as Record<string, unknown>, f)), url)); }
    if (table === "past_players" && method === "GET") { if (!admin) return json(403, { message: "permission denied", code: "42501" }); return json(200, ordered(s.pastPlayers || [], url)); }
    if (table === "announcements") {
      if (method === "GET") return json(200, ordered(s.announcements, url));
      if (!admin) return json(403, { message: "permission denied", code: "42501" });
      if (method === "POST") { const row = { id: nextId(s.announcements), created_at: new Date().toISOString(), ...body() }; s.announcements.push(row); return json(201, [row]); }
      if (method === "DELETE") { s.announcements = s.announcements.filter((r) => !matches(r as unknown as Record<string, unknown>, f)); return route.fulfill({ status: 204, body: "" }); }
    }
    if(table==='season_dates'&&method==='GET'){const config=JSON.parse(s.state.season_config?.value||JSON.stringify(defaultSeason));return json(200,config.approved_dates.map((d:string,i:number)=>({session_number:i+1,play_on:d,start_at:leagueInstant(d,config.start_time_local,config.time_zone),cancelled:JSON.parse(s.state.completed_sessions?.value||'[]').some((x:{number:number;status?:string})=>x.number===i+1&&x.status==='cancelled'),cancellation_reason:''})));}
    if (table === "app_state" && method === "GET") {
      if(f.key==='season_config'&&!s.state.season_config)return json(200,[{key:'season_config',value:JSON.stringify(defaultSeason),version:1}]);
      const rows = Object.entries(s.state).filter(([k]) => admin || (!k.startsWith("snapshot_") && !["admin_pin", "pin", "invite_code"].includes(k))).map(([key, v]) => ({ key, value: v.value, version: v.version, created_at: "2026-09-01T00:00:00Z" }));
      const reply = rows.filter((r) => matches(r, f));
      // A slow background refresh (p52 tests): the reply's contents are fixed now; it arrives when the test releases it.
      const h = s.holdRead; if (h && url.searchParams.get("key") === `eq.${h.key}`) { s.holdRead = undefined; h.served(); await h.until; }
      return json(200, reply);
    }
    if (table === "rsvps" && method === "GET") return json(200, ordered(s.rsvps.filter((r) => matches(r as unknown as Record<string, unknown>, f)), url));
    if (table === "undo_journal" && method === "GET") { if (!admin) return json(403, { message: "permission denied", code: "42501" }); return json(200, [...s.undo].reverse().slice(0, 10).map(({ snapshot, ...rest }) => rest)); }
    if (table === "rsvp_log" && method === "GET") { if (!admin) return json(403, { message: "permission denied", code: "42501" }); return json(200, [...s.rsvpLog].reverse()); }
    if (table === "payments" && method === "GET") { const reply = ordered(s.payments.filter((r) => admin || r.player_id === me).filter((r) => matches(r as unknown as Record<string, unknown>, f)), url);
      const h = s.holdTable; if (h && h.table === "payments") { s.holdTable = undefined; const frozen = JSON.parse(JSON.stringify(reply)); h.served(); await h.until; return json(200, frozen); }
      return json(200, reply); }
    if (table === "questions") {
      if (method === "GET") return json(200, ordered(s.questions, url));
      if (method === "POST") { const b = body(); if (b.player_id !== me) return json(403, { message: "permission denied", code: "42501" }); const row = { id: nextId(s.questions), player_id: b.player_id, asker: b.asker, question: b.question, answer: null, answered_at: null, created_at: new Date().toISOString() }; s.questions.push(row); return json(201, [row]); }
      if (!admin) return json(403, { message: "permission denied", code: "42501" });
      if (method === "PATCH") { const rows = s.questions.filter((r) => matches(r as unknown as Record<string, unknown>, f)); rows.forEach((r) => Object.assign(r, body())); return json(200, rows); }
      if (method === "DELETE") { s.questions = s.questions.filter((r) => !matches(r as unknown as Record<string, unknown>, f)); return route.fulfill({ status: 204, body: "" }); }
    }
    return json(404, { message: `unhandled ${method} ${path}` });
  });
}
