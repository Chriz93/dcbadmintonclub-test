// Test-only network guard, loaded before any unit test (node --import ./legacy/tests/unit/fetch-guard.mjs --test …).
// Tests make no network requests: fetch to a Supabase project (production above all), the live sites or any other
// non-local address is refused and recorded, so a test can never reach production even by mistake. The production
// jobs' own code (legacy/automation) is not changed by this.
export const PROD_REF = "bwepvxelvwgwxrnaglrx";
export const blocked = [];
const real = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input?.url ?? input);
  let host = "";
  try { host = new URL(url).hostname; } catch { /* relative or malformed: not a network address */ }
  if (url.includes(PROD_REF) || /\.supabase\.(co|com)$/.test(host) || /github\.io$/.test(host) || (host && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host))) {
    blocked.push(url);
    throw new Error(`Refusing: unit tests make no network requests (${host || url})`);
  }
  return real(input, init);
};
