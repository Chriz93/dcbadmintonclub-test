/**
 * Cloudflare Pages Function: public no-login unsubscribe at /unsubscribe.
 * Secrets (service role key, signing key) are Pages environment bindings, never shipped to the browser.
 * GET shows a confirmation form; POST (form or RFC 8058 one-click) disables only the signed channel.
 */
import { verifyUnsubscribeWeb } from "../src/services/unsubscribe-token-web";
interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  UNSUBSCRIBE_SIGNING_KEY?: string;
}
type Handler = (context: { request: Request; env: Env }) => Promise<Response>;
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#1c2a24}button{font:inherit;padding:.6rem 1.2rem}</style><main><h1>${title}</h1>${body}</main></html>`,
    {
      status,
      headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
    },
  );
const failure = () =>
  page(
    "Unable to confirm this request",
    "<p>This link is not valid. Use the reminder preferences in Member hub or contact the organizer.</p>",
    400,
  );
async function claimFrom(request: Request, env: Env) {
  const key = env.UNSUBSCRIBE_SIGNING_KEY ?? "";
  const token = new URL(request.url).searchParams.get("token") ?? "";
  return verifyUnsubscribeWeb(token, key);
}
export const onRequestGet: Handler = async ({ request, env }) => {
  try {
    await claimFrom(request, env);
  } catch {
    return failure();
  }
  return page(
    "Stop league reminders",
    '<p>This stops this notification channel for this club. Your membership and session bookings stay in place.</p><form method="post"><button type="submit">Unsubscribe</button></form>',
  );
};
export const onRequestPost: Handler = async ({ request, env }) => {
  let claim;
  try {
    claim = await claimFrom(request, env);
  } catch {
    return failure();
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    return page(
      "Service unavailable",
      "<p>Preference service is not configured.</p>",
      503,
    );
  let url: URL;
  try {
    url = new URL(env.SUPABASE_URL);
  } catch {
    return page(
      "Service unavailable",
      "<p>Preference service is not configured.</p>",
      503,
    );
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".supabase.co") ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    return page(
      "Service unavailable",
      "<p>Preference service is not configured.</p>",
      503,
    );
  let response: Response;
  try {
    response = await fetch(
      new URL("/rest/v1/rpc/unsubscribe_channel", url).toString(),
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          "Content-Profile": "club_app",
        },
        body: JSON.stringify({
          c: claim.club,
          u: claim.user,
          channel_name: claim.channel,
        }),
      },
    );
  } catch {
    return page(
      "Service temporarily unavailable",
      "<p>We could not confirm your preference update. Please try again or use Member hub preferences.</p>",
      502,
    );
  }
  if (!response.ok)
    return page(
      "Unable to confirm this request",
      "<p>The preference service did not accept the request. Use Member hub preferences or contact the organizer.</p>",
      502,
    );
  return page(
    "Unsubscribed",
    "<p>Your membership and bookings have not changed. You can opt in again in Member hub.</p>",
  );
};
