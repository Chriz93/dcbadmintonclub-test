// The waiver part of the in-memory TEST stand-in, mirroring migration L20: versions read from legacy/waiver/*.txt
// with their SHA-256, and acceptance records checked the same way record_waiver_acceptance checks them.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type WaiverVersion = { version: string; title: string; body: string; sha256: string; published_at: string; is_current: boolean; note: string };
export type Acceptance = {
  id: number; player_id: number | null; user_id: string | null; email: string; participant_name: string; typed_signature: string;
  waiver_version: string; waiver_sha256: string; accepted_at: string; client_timezone: string; client_utc_offset_minutes: number | null;
  action: "registration" | "updated-version"; age_declaration: "adult" | "guardian"; minor_name: string; media_consent: boolean | null; registration_ref: string; user_agent: string;
};
export const TITLES: Record<string, string> = { "2026-09-v1": "Liability Waiver, Activity Release and Payment Policy", "2026-09-v2": "Release of Liability, Waiver of Claims, Assumption of Risk and Consent" };
const DIR = resolve(__dirname, "../../waiver");
export const sha256 = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
export const wording = (v: string) => readFileSync(`${DIR}/${v}.txt`, "utf8").replace(/\n+$/, "");
/** Both versions as the database holds them; TEST publishes v2 (T02). */
export function waiverVersions(current = "2026-09-v2"): WaiverVersion[] {
  return Object.entries(TITLES).map(([version, title]) => { const body = wording(version); return { version, title, body, sha256: sha256(body), published_at: "2026-09-12T12:00:00.000Z", is_current: version === current, note: "" }; });
}
export type AcceptArgs = { player_id: number | null; user_id: string | null; email: string; name: string; version?: string; sha?: string; sig?: string; tz?: string; offset?: number | null; action: Acceptance["action"]; age?: string; minor?: string; media?: boolean | null; ua?: string };
/** The checks of record_waiver_acceptance: an error message, or null when the acceptance may be recorded. */
export function acceptanceProblem(vs: WaiverVersion[], a: AcceptArgs): string | null {
  const wv = vs.find((v) => v.version === (a.version || ""));
  if (!wv) return "The waiver on your screen is out of date — reload the page and read the current version";
  if (!wv.is_current) return "The waiver was updated while you were registering — reload the page and read the current version";
  if (String(a.sha || "").toLowerCase() !== wv.sha256) return `The waiver text on your screen does not match version ${wv.version} — reload the page and try again`;
  const sig = String(a.sig ?? "").trim(); if (sig.length < 2 || sig.length > 80) return "Type your full name to sign the waiver";
  const age = a.age ?? "adult"; if (age !== "adult" && age !== "guardian") return "Choose whether you are 18 or older or a parent or guardian";
  const minor = String(a.minor ?? "").trim(); if (age === "guardian" && (minor.length < 2 || minor.length > 80)) return "Enter the name of the participant under 18";
  return null;
}
/** Records an acceptance (call acceptanceProblem first). The reference is REG-<player>-<UTC time>, as in L20. */
export function recordAcceptance(vs: WaiverVersion[], acc: Acceptance[], a: AcceptArgs, nowIso: string): Acceptance {
  const wv = vs.find((v) => v.version === a.version)!, age = (a.age ?? "adult") as Acceptance["age_declaration"];
  const rec: Acceptance = {
    id: Math.max(0, ...acc.map((x) => x.id)) + 1, player_id: a.player_id, user_id: a.user_id, email: a.email, participant_name: String(a.name).trim(), typed_signature: String(a.sig).trim(),
    waiver_version: wv.version, waiver_sha256: wv.sha256, accepted_at: nowIso, client_timezone: String(a.tz ?? "").slice(0, 64),
    client_utc_offset_minutes: typeof a.offset === "number" && a.offset >= -840 && a.offset <= 840 ? a.offset : null, action: a.action, age_declaration: age,
    minor_name: age === "guardian" ? String(a.minor).trim().slice(0, 80) : "", media_consent: a.media ?? null,
    registration_ref: `REG-${a.player_id ?? "?"}-${nowIso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`, user_agent: String(a.ua ?? "").slice(0, 300),
  };
  acc.push(rec);
  return rec;
}
