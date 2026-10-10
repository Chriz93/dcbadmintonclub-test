// The page a vote reminder's Yes/No button opens (L31).
//
// The league site is static GitHub Pages and cannot run anything, so this is the only place a token can be checked
// and an answer recorded. It is deliberately small: it reads one token, shows one question, and writes one answer.
//
// WHY A BUTTON AND NOT JUST THE LINK. Outlook Safe Links, Gmail and corporate antivirus fetch every URL in a message
// before the person sees it. If GET recorded the vote, those scanners would mark players "coming" who never touched
// the email — the exact fault p96 was written to remove. So GET only ever SHOWS the question; POST records it, and a
// scanner does not submit forms.
//
// The service-role key never leaves this function: the browser gets HTML, nothing else.
const SB = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = Deno.env.get("LEAGUE_SITE_URL") ?? "https://chriz93.github.io/dcbadmintonclub/";

async function rpc(fn: string, body: unknown) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${fn} ${r.status}`);
  return await r.json();
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Tuesday 13 October, 8:00 PM — in the league's timezone, not the visitor's. */
function when(startAt: string) {
  const d = new Date(startAt);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "long", day: "numeric", month: "long" }).format(d);
  const time = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  return `${day}, ${time.replace(/\s?([ap])\.?m\.?/i, (_m, p) => ` ${p.toUpperCase()}M`)}`;
}

function page(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} · Maplewood League</title>
<style>
 :root{color-scheme:light dark;--ink:#17201c;--soft:#4c5a52;--ground:#f4f2ec;--panel:#fff;--line:#ddd9cf;
       --green:#1f9d6a;--red:#b83b4b}
 @media (prefers-color-scheme:dark){:root{--ink:#e8ece9;--soft:#a7b3ac;--ground:#131715;--panel:#1b211e;--line:#2e3833;
       --green:#35b57f;--red:#d4586a}}
 *{box-sizing:border-box}
 body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
      background:var(--ground);color:var(--ink);
      font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
 .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:38px 28px;
       max-width:430px;width:100%;text-align:center}
 .big{font-size:46px;line-height:1;margin-bottom:14px}
 h1{font-size:21px;margin:0 0 8px;font-weight:650}
 p{margin:0 0 18px;color:var(--soft);font-size:15px}
 strong{color:var(--ink)}
 form{display:inline}
 button{font:inherit;font-weight:700;color:#fff;border:0;border-radius:8px;padding:14px 34px;
        cursor:pointer;min-width:190px}
 .yes{background:var(--green)}
 .no{background:var(--red)}
 .alt{display:block;margin-top:14px;font-size:14px}
 a{color:var(--soft)}
 .foot{margin:22px 0 0;font-size:12.5px;color:var(--soft)}
</style></head><body><div class="card">${body}</div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } },
  );
}

const PROBLEM: Record<string, { icon: string; head: string; say: string }> = {
  unknown: { icon: "🤔", head: "This link is not one of ours", say: "It may have been cut short by your email app. Answer on the site instead — it takes a moment." },
  closed: { icon: "⏰", head: "Voting has closed", say: "Answers for this session closed at the deadline, so the courts are already being drawn. Message the organizer if you still want to play." },
  cancelled: { icon: "🚫", head: "That session was cancelled", say: "Nothing to answer. Check the site for the next one." },
  bad_response: { icon: "🤔", head: "That link was incomplete", say: "Answer on the site instead — it takes a moment." },
};
const problemPage = (kind: string) => {
  const p = PROBLEM[kind] ?? PROBLEM.unknown;
  return page(p.head, `<div class="big">${p.icon}</div><h1>${esc(p.head)}</h1><p>${esc(p.say)}</p>
    <p class="foot"><a href="${esc(SITE)}">Open the league site</a></p>`, kind === "unknown" ? 404 : 200);
};

// Exported so the tests can drive it without binding a port; Supabase runs this file as the entry point, where
// import.meta.main is true and the server starts as usual.
export async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let token = url.searchParams.get("t") ?? "";
  let want = url.searchParams.get("r") ?? "";

  if (req.method === "POST") {
    const form = await req.formData();
    token = String(form.get("t") ?? token);
    want = String(form.get("r") ?? want);
  }
  if (!/^[0-9a-f]{64}$/.test(token) || (want !== "coming" && want !== "notcoming")) return problemPage("bad_response");

  try {
    // GET never writes. It asks what to show and shows it.
    if (req.method !== "POST") {
      const info = await rpc("vote_link_info", { p_token: token });
      // Cancelled is checked first and on its own: a session called off AFTER its links went out still has a live
      // token, so it comes back status "ok" and would otherwise render a confirm page for a night nobody is playing.
      if (info.cancelled) return problemPage("cancelled");
      if (info.status !== "ok") return problemPage(info.status);
      const yes = want === "coming";
      const other = yes ? "notcoming" : "coming";
      return page("Confirm your answer",
        `<div class="big">🏸</div>
         <h1>You're answering for Session ${esc(info.session)}</h1>
         <p>${esc(when(info.start_at))}<br>
            ${esc(info.name)} — <strong>${yes ? "I'm playing" : "I can't make it"}</strong></p>
         <form method="POST">
           <input type="hidden" name="t" value="${esc(token)}">
           <input type="hidden" name="r" value="${esc(want)}">
           <button class="${yes ? "yes" : "no"}" type="submit">Confirm</button>
         </form>
         <form method="POST" class="alt">
           <input type="hidden" name="t" value="${esc(token)}">
           <input type="hidden" name="r" value="${esc(other)}">
           <button type="submit" style="background:none;color:var(--soft);min-width:0;padding:6px;
             text-decoration:underline;font-weight:400">
             ${yes ? "Actually, I can't make it" : "Actually, I'm playing"}</button>
         </form>
         ${info.current ? `<p class="foot">You previously answered “${info.current === "coming" ? "I'm playing" : "I can't make it"}”.</p>` : ""}`);
    }

    const out = await rpc("apply_vote_link", { p_token: token, p_response: want });
    if (out.status !== "ok") return problemPage(out.status);
    const yes = out.response === "coming";
    return page(yes ? "You're in" : "Thanks for telling us",
      `<div class="big">${yes ? "✓" : "👍"}</div>
       <h1>${yes ? `You're in, ${esc(out.first_name)}` : `Thanks, ${esc(out.first_name)}`}</h1>
       <p>${yes
         ? `Session ${esc(out.session)} — your court goes up when the line-up is published.`
         : `You're marked as not playing Session ${esc(out.session)}. Your seat goes to a spare.`}</p>
       <p class="foot">Changed your mind? Answer again from <a href="${esc(SITE)}">the league site</a>
          any time before voting closes.</p>`);
  } catch (_e) {
    // Never leak the reason to the visitor; the player can always answer on the site.
    return page("Something went wrong",
      `<div class="big">⚠️</div><h1>That didn't go through</h1>
       <p>Your answer was not recorded. Please try the link again, or answer on the site.</p>
       <p class="foot"><a href="${esc(SITE)}">Open the league site</a></p>`, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
