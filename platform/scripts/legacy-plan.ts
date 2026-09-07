/** Read-only legacy migration planning. Never creates Auth identities or grants membership. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
type RecordValue = Record<string, unknown>;
const object = (v: unknown): v is RecordValue =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): string | null =>
  typeof v === "string" && v.trim()
    ? v
    : typeof v === "number" && Number.isSafeInteger(v)
      ? String(v)
      : null;
const known = new Set([
  "current_session",
  "completed_sessions",
  "player_approvals",
  "membership_overrides",
  "pre_session_attendance",
  "round_snapshots",
  "qa_questions",
  "admin_pin",
  "pin",
  "invite_code",
]);
export function planLegacy(text: string) {
  const parsed: unknown = JSON.parse(text);
  if (!object(parsed) || !Array.isArray(parsed.players))
    throw new Error(
      "Expected a legacy snapshot or downloaded backup with players",
    );
  const issues: { code: string; path: string }[] = [];
  const add = (code: string, path: string) => issues.push({ code, path });
  const kv: RecordValue = Object.assign(
    Object.create(null),
    object(parsed.kv) ? parsed.kv : {},
  );
  if (parsed.kv !== undefined && !object(parsed.kv)) add("INVALID_KV", "kv");
  // Supabase table exports contain JSON text in app_state.value. Do not overwrite duplicates.
  if (Array.isArray(parsed.app_state))
    for (const [i, row] of parsed.app_state.entries()) {
      if (!object(row) || typeof row.key !== "string") {
        add("INVALID_STATE_ROW", `app_state[${i}]`);
        continue;
      }
      if (Object.hasOwn(kv, row.key)) {
        add("DUPLICATE_STATE_KEY", `app_state[${i}]`);
        continue;
      }
      try {
        kv[row.key] =
          typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      } catch {
        add("INVALID_STATE_JSON", `app_state[${i}]`);
      }
    }
  const canonical = new Map<string, number>(),
    emails = new Map<string, number>();
  for (const [i, p] of parsed.players.entries()) {
    if (!object(p)) {
      add("INVALID_PLAYER", `players[${i}]`);
      continue;
    }
    const key = id(p.id);
    if (key === null) add("MISSING_PLAYER_ID", `players[${i}]`);
    else if (canonical.has(key)) add("DUPLICATE_PLAYER_ID", `players[${i}]`);
    else canonical.set(key, i);
    if (typeof p.email === "string" && p.email.trim()) {
      const email = p.email.trim().toLowerCase();
      if (emails.has(email)) add("AMBIGUOUS_EMAIL", `players[${i}]`);
      else emails.set(email, i);
    }
  }
  const completed = kv.completed_sessions ?? parsed.sessions ?? [];
  if (!Array.isArray(completed))
    add("INVALID_SESSION_LIST", "completed_sessions");
  const sourceSessions = Array.isArray(completed) ? completed : [];
  const current = kv.current_session ?? parsed.current;
  const sessionIds = new Set<string>();
  let sessions = 0,
    games = 0,
    reviewGames = 0,
    playerAppearances = 0;
  const inspectSession = (s: unknown, path: string) => {
    if (!object(s)) {
      add("INVALID_SESSION", path);
      return;
    }
    const key = id(s.id);
    if (key === null) add("MISSING_SESSION_ID", path);
    if (key !== null && sessionIds.has(key)) {
      add("DUPLICATE_SESSION_ID", path);
      return;
    }
    if (key !== null) sessionIds.add(key);
    sessions++;
    // Preserve the original date label: old browser-timezone dates must not be guessed.
    if (
      typeof s.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(s.date) ||
      Number.isNaN(Date.parse(s.date + "T12:00:00Z")) ||
      new Date(s.date + "T12:00:00Z").toISOString().slice(0, 10) !== s.date
    )
      add("DATE_REQUIRES_REVIEW", path + ".date");
    if (!object(s.scores)) {
      add("INVALID_SCORES", path + ".scores");
      return;
    }
    for (const [scoreKey, score] of Object.entries(s.scores)) {
      games++;
      const where = path + `.scores[${games}]`;
      let review = false;
      const mark = (code: string) => {
        add(code, where);
        review = true;
      };
      if (!/^c[1-9]\d*_y[1-9]\d*_g[1-9]\d*$/.test(scoreKey))
        mark("INVALID_SCORE_KEY");
      if (!object(score)) {
        mark("INVALID_SCORE");
        reviewGames++;
        continue;
      }
      const a = [score.a1, score.a2]
          .filter((x) => x !== null && x !== undefined)
          .map(id),
        b = [score.b1, score.b2]
          .filter((x) => x !== null && x !== undefined)
          .map(id);
      const ids = [...a, ...b];
      playerAppearances += ids.length;
      if (
        a.length < 1 ||
        a.length > 2 ||
        a.length !== b.length ||
        ids.some((x) => x === null) ||
        new Set(ids).size !== ids.length
      )
        mark("INVALID_TEAMS");
      if (ids.some((x) => x !== null && !canonical.has(x)))
        mark("UNRESOLVED_PLAYER");
      if (
        !Number.isInteger(score.sA) ||
        !Number.isInteger(score.sB) ||
        Number(score.sA) < 0 ||
        Number(score.sB) < 0 ||
        Math.max(Number(score.sA), Number(score.sB)) !== 21 ||
        score.sA === score.sB
      )
        mark("LEGACY_SCORE_REQUIRES_REVIEW");
      else if (score.w !== (Number(score.sA) > Number(score.sB) ? "A" : "B"))
        mark("WINNER_MISMATCH");
      if (review) reviewGames++;
    }
  };
  sourceSessions.forEach((s, i) =>
    inspectSession(s, `completed_sessions[${i}]`),
  );
  // A completed current session can also be present in completed_sessions. Never silently double count it.
  if (current !== null && current !== undefined)
    inspectSession(current, "current_session");
  const unknownKeys = Object.keys(kv).filter(
    (k) =>
      !known.has(k) &&
      !k.startsWith("votes_session_") &&
      !k.startsWith("rsvp_session_") &&
      !k.startsWith("snapshot_"),
  );
  return {
    sourceSha256: createHash("sha256").update(text).digest("hex"),
    playerCount: parsed.players.length,
    uniquePlayerCount: canonical.size,
    sessionCount: sessions,
    gameCount: games,
    playerAppearances,
    gamesRequiringReview: reviewGames,
    announcementCount: Array.isArray(parsed.announcements)
      ? parsed.announcements.length
      : 0,
    stateKeyCount: Object.keys(kv).length,
    unknownStateKeyCount: unknownKeys.length,
    requiresVerifiedIdentityMapping: true,
    carryForwardPayments: false,
    carryForwardSignatures: false,
    carryForwardSeeding: false,
    importPerformed: false,
    preserveOriginalExport: true,
    issues,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (process.argv.length !== 3)
      throw new Error("Usage: legacy-plan.ts /private/path/legacy-backup.json");
    console.log(
      JSON.stringify(
        planLegacy(readFileSync(process.argv[2], "utf8")),
        null,
        2,
      ),
    );
  } catch {
    console.error(
      "Unable to inspect backup. Check format and file access; no import was performed.",
    );
    process.exitCode = 1;
  }
}
