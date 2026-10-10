// The confirm page a vote reminder opens (L31). The property that matters most is the first one: a GET must never
// record anything, because Outlook Safe Links, Gmail and corporate antivirus fetch every URL in an email before the
// person sees it. If GET voted, those scanners would mark players "coming" who never touched the message.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

Deno.env.set("SUPABASE_URL", "https://example.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-key");
const { handler } = await import("./index.ts");

const TOKEN = "a".repeat(64);
/** Stand in for PostgREST; records which functions were called with what. */
function stub(replies: Record<string, unknown>) {
  const calls: { fn: string; body: unknown }[] = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const fn = String(input).split("/rpc/")[1];
    calls.push({ fn, body: JSON.parse(String(init?.body ?? "{}")) });
    if (!(fn in replies)) return Promise.resolve(new Response("no", { status: 500 }));
    return Promise.resolve(new Response(JSON.stringify(replies[fn]), { status: 200, headers: { "content-type": "application/json" } }));
  }) as typeof fetch;
  return calls;
}
const OPEN = {
  vote_link_info: { status: "ok", name: "Jagjot Singh", first_name: "Jagjot", session: 5,
    start_at: "2026-10-14T00:00:00+00:00", closes_at: "2026-10-12T02:00:00+00:00", current: null, cancelled: false },
};
const get = (q: string) => handler(new Request(`https://fn.test/vote?${q}`));
const post = (t: string, r: string) => {
  const body = new FormData(); body.append("t", t); body.append("r", r);
  return handler(new Request("https://fn.test/vote", { method: "POST", body }));
};

Deno.test("a link scanner's GET shows the question and records NOTHING", async () => {
  const calls = stub(OPEN);
  const res = await get(`t=${TOKEN}&r=coming`);
  assertEquals(res.status, 200);
  assertEquals(calls.map((c) => c.fn), ["vote_link_info"], "only the read; apply_vote_link was never called");
  assert(!calls.some((c) => c.fn === "apply_vote_link"), "a GET must never cast a vote");
});

Deno.test("the confirm page names the player, the session and the answer they are about to give", async () => {
  stub(OPEN);
  const html = await (await get(`t=${TOKEN}&r=coming`)).text();
  assertStringIncludes(html, "Jagjot Singh");
  assertStringIncludes(html, "Session 5");
  assertStringIncludes(html, "I'm playing");
  assertStringIncludes(html, "Tuesday, October 13, 8:00 PM");           // the league's timezone, not the visitor's
  assertStringIncludes(html, "Actually, I can't make it");               // the other answer, one tap away
  assertStringIncludes(html, 'method="POST"');
});

Deno.test("pressing Confirm is what records the answer", async () => {
  const calls = stub({ ...OPEN, apply_vote_link: { status: "ok", response: "coming", session: 5, name: "Jagjot Singh", first_name: "Jagjot" } });
  const res = await post(TOKEN, "coming");
  assertEquals(res.status, 200);
  assertEquals(calls.map((c) => c.fn), ["apply_vote_link"]);
  assertEquals(calls[0].body, { p_token: TOKEN, p_response: "coming" });
  assertStringIncludes(await res.text(), "You're in, Jagjot");
});

Deno.test("declining says where the seat goes", async () => {
  stub({ apply_vote_link: { status: "ok", response: "notcoming", session: 5, name: "Jagjot Singh", first_name: "Jagjot" } });
  assertStringIncludes(await (await post(TOKEN, "notcoming")).text(), "Your seat goes to a spare");
});

Deno.test("a token that is not ours, or past the deadline, is refused without touching the database", async () => {
  let calls = stub({});
  assertEquals((await get("t=nope&r=coming")).status, 200);          // not even shaped like a token
  assertEquals(calls.length, 0, "a malformed token never reaches the database");

  calls = stub({});
  await get(`t=${TOKEN}&r=maybe`);                                    // not an answer a reminder asks for
  assertEquals(calls.length, 0);

  calls = stub({ vote_link_info: { status: "unknown" } });
  assertEquals((await get(`t=${TOKEN}&r=coming`)).status, 404);

  stub({ vote_link_info: { status: "closed" } });
  assertStringIncludes(await (await get(`t=${TOKEN}&r=coming`)).text(), "Voting has closed");

  stub({ vote_link_info: { status: "ok", cancelled: true } });
  assertStringIncludes(await (await get(`t=${TOKEN}&r=coming`)).text(), "cancelled");
});

Deno.test("a POST the database refuses does not pretend it worked", async () => {
  stub({ apply_vote_link: { status: "closed" } });
  const html = await (await post(TOKEN, "coming")).text();
  assertStringIncludes(html, "Voting has closed");
  assert(!html.includes("You're in"), "a refused vote must not be reported as recorded");
});

Deno.test("a name with HTML in it cannot break the page", async () => {
  stub({ vote_link_info: { ...OPEN.vote_link_info, name: '<script>alert(1)</script>', first_name: "x" } });
  const html = await (await get(`t=${TOKEN}&r=coming`)).text();
  assert(!html.includes("<script>alert(1)</script>"), "the name is escaped");
  assertStringIncludes(html, "&lt;script&gt;");
});

Deno.test("the page is never cached and never indexed, and leaks no reason when it breaks", async () => {
  stub(OPEN);
  const res = await get(`t=${TOKEN}&r=coming`);
  assertEquals(res.headers.get("cache-control"), "no-store");
  assertStringIncludes(await res.text(), 'name="robots" content="noindex,nofollow"');

  globalThis.fetch = (() => Promise.reject(new Error("service key is sb_secret_hunter2"))) as typeof fetch;
  const bad = await get(`t=${TOKEN}&r=coming`);
  assertEquals(bad.status, 500);
  const html = await bad.text();
  assert(!html.includes("sb_secret"), "the failure reason never reaches the visitor");
  assertStringIncludes(html, "was not recorded");
});
