import { useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
const row = z.object({
  id: z.string(),
  archive_label: z.string(),
  session_label: z.string(),
  court: z.number().nullable(),
  round: z.number().nullable(),
  game: z.number().nullable(),
  score_a: z.number().nullable(),
  score_b: z.number().nullable(),
  on_a: z.boolean(),
  partner: z.string(),
  opponents: z.string().nullable(),
  needs_review: z.boolean(),
});
export function LegacyHistory() {
  const [rows, setRows] = useState<z.infer<typeof row>[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function load(p = 0) {
    if (!supabase) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("my_legacy_matches", {
        page_number: p,
      });
      if (error) throw error;
      const next = z.array(row).parse(data);
      setRows((old) =>
        p === 0
          ? next
          : [...old, ...next.filter((r) => !old.some((o) => o.id === r.id))],
      );
      setPage(p);
      setMore(next.length === 50);
      setMessage(
        next.length
          ? "Historical records loaded."
          : "No more linked historical games. Christy can link your old record after registration.",
      );
    } catch {
      setMessage("Historical records could not be loaded. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>Previous seasons</summary>
      <section aria-label="Archived match history">
        <p>
          Original historical scores. These do not change this season’s ELO or
          registration.
        </p>
        <button
          className="button"
          disabled={busy || !navigator.onLine}
          onClick={() => void load()}
        >
          Load previous seasons
        </button>
        {rows.map((r) => (
          <article className="admin-record" key={r.id}>
            <strong>
              {r.session_label} ·{" "}
              {r.on_a ? (r.score_a ?? "—") : (r.score_b ?? "—")}–
              {r.on_a ? (r.score_b ?? "—") : (r.score_a ?? "—")}
            </strong>
            <span>
              {r.archive_label} · Court {r.court ?? "—"} · Round{" "}
              {r.round ?? "—"} · Game {r.game ?? "—"}
            </span>
            <span>
              Partner: {r.partner} · Opponents: {r.opponents ?? "Former player"}
            </span>
            {r.needs_review && (
              <span>
                Original score needs review; it has not been rewritten.
              </span>
            )}
          </article>
        ))}
        {more && (
          <button
            className="button"
            disabled={busy || !navigator.onLine}
            onClick={() => void load(page + 1)}
          >
            Load older archived games
          </button>
        )}
        <p role="status">{message}</p>
      </section>
    </details>
  );
}
