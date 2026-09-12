// Production isolation for every browser test. The suites only ever talk to the in-memory stand-in for the TEST
// project (mock-supabase.ts). Any request to another Supabase project — production above all — or to the live
// sites is aborted and recorded, and a run refuses to start when its environment mentions the production project.
import type { BrowserContext } from "@playwright/test";

export const TEST_REF = "wgolevihkvmosajumzvl";
export const PROD_REF = "bwepvxelvwgwxrnaglrx";

/** Throws when any environment variable points at the production project (a stray SUPABASE_URL, a copied key file…). */
export function refuseProduction(env: Record<string, string | undefined> = process.env) {
  const bad = Object.entries(env).filter(([, v]) => typeof v === "string" && v.includes(PROD_REF)).map(([k]) => k).sort();
  if (bad.length) throw new Error(`Refusing to run tests: ${bad.join(", ")} point${bad.length === 1 ? "s" : ""} at the production project`);
}

/** True for addresses a test must never reach: any Supabase project but TEST's (which the mock answers), anything
 *  naming the production project, and the live GitHub Pages sites. */
export function isForbidden(url: string) {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (url.includes(PROD_REF)) return true;
  if (u.hostname.endsWith(".supabase.co") && u.hostname !== `${TEST_REF}.supabase.co`) return true;
  if (u.hostname.endsWith("supabase.com") || u.hostname.endsWith("github.io")) return true;
  return false;
}

/** Aborts forbidden requests for a whole browser context and records them for the suite to fail on. */
export async function guardContext(ctx: BrowserContext, blocked: string[]) {
  await ctx.route((u) => isForbidden(u.href), (route) => { blocked.push(`${route.request().method()} ${route.request().url()}`); return route.abort("blockedbyclient"); });
}
