import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
const match = z.object({
  id: z.string(),
  club_id: z.string(),
  season_name: z.string(),
  starts_at: z.string(),
  court_number: z.number(),
  round: z.number(),
  game: z.number(),
  partner: z.string(),
  opponents: z.string().nullable(),
  my_score: z.number(),
  opponent_score: z.number(),
  result: z.enum(["Won", "Lost"]),
});
export function MyMatches() {
  const [rows, setRows] = useState<z.infer<typeof match>[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function load(p = 0) {
    if (!supabase) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("my_match_history", {
        page_number: p,
      });
      if (error) throw error;
      const next = z.array(match).parse(data);
      setRows((old) =>
        p === 0
          ? next
          : [...old, ...next.filter((r) => !old.some((o) => o.id === r.id))],
      );
      setPage(p);
      setMore(next.length === 50);
      setMessage(
        next.length
          ? "Results refreshed."
          : p > 0
            ? "All older matches have been loaded."
            : "No scored matches yet. Your first games will appear here.",
      );
    } catch {
      setMessage("Could not load your matches. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const dates = [
    ...new Set(rows.map((r) => `${r.club_id}/${r.season_name}/${r.starts_at}`)),
  ];
  return (
    <section aria-label="My previous matches">
      <h3>My previous matches</h3>
      <button
        className="button"
        disabled={busy || !navigator.onLine}
        onClick={() => void load()}
      >
        Refresh my matches
      </button>
      {dates.map((key) => {
        const games = rows.filter(
            (r) => `${r.club_id}/${r.season_name}/${r.starts_at}` === key,
          ),
          first = games[0];
        return (
          <details key={key} open={key === dates[0]}>
            <summary>
              {new Date(first.starts_at).toLocaleDateString("en-CA", {
                timeZone: "America/Toronto",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}{" "}
              · {games.filter((g) => g.result === "Won").length} wins /{" "}
              {games.length} games
            </summary>
            <p>{first.season_name}</p>
            {games.map((g) => (
              <article key={g.id} className="admin-record">
                <strong>
                  {g.result} {g.my_score}–{g.opponent_score}
                </strong>
                <span>
                  Court {g.court_number} · Round {g.round} · Game {g.game}
                </span>
                <span>
                  Partner: {g.partner} · Opponents:{" "}
                  {g.opponents ?? "Former players"}
                </span>
              </article>
            ))}
          </details>
        );
      })}
      {more && (
        <button
          className="button"
          disabled={busy || !navigator.onLine}
          onClick={() => void load(page + 1)}
        >
          Load older matches
        </button>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
