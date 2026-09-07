import { useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
import { Card } from "./ui";
const seasonSchema = z.object({
  id: z.string(),
  club_id: z.string(),
  name: z.string(),
});
const standingSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  played: z.number(),
  wins: z.number(),
  points: z.number(),
  possible_points: z.number(),
  position: z.number(),
});
export function Standings() {
  const [elo, setElo] = useState<
    { user_id: string; rating: number; played: number; name: string }[]
  >([]);
  const [seasons, setSeasons] = useState<z.infer<typeof seasonSchema>[]>([]),
    [selected, setSelected] = useState(""),
    [rows, setRows] = useState<z.infer<typeof standingSchema>[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      "Sign in through Member hub to view your league standings.",
    );
  async function load(id?: string) {
    if (!supabase) return;
    setBusy(true);
    setRows([]);
    try {
      const { data, error } = await supabase
        .from("seasons")
        .select("id,club_id,name");
      if (error) throw error;
      const choices = z.array(seasonSchema).parse(data);
      setSeasons(choices);
      const chosen = choices.find((s) => s.id === id) ?? choices[0];
      if (!chosen) {
        setMessage("No active league membership found.");
        return;
      }
      setSelected(chosen.id);
      const result = await supabase.rpc("league_standings", {
        c: chosen.club_id,
        se: chosen.id,
      });
      if (result.error) throw result.error;
      const standings = z.array(standingSchema).parse(result.data);
      setRows(standings);
      const ratingReads = await Promise.all([
        supabase
          .from("elo_ratings")
          .select("user_id,rating,played")
          .eq("club_id", chosen.club_id)
          .eq("season_id", chosen.id),
        supabase.rpc("club_roster", { c: chosen.club_id }),
      ]);
      if (ratingReads.some((r) => r.error)) throw new Error();
      const roster = z
        .array(z.object({ user_id: z.string(), display_name: z.string() }))
        .parse(ratingReads[1].data);
      setElo(
        z
          .array(
            z.object({
              user_id: z.string(),
              rating: z.coerce.number(),
              played: z.number(),
            }),
          )
          .parse(ratingReads[0].data)
          .map((r) => ({
            ...r,
            name:
              roster.find((p) => p.user_id === r.user_id)?.display_name ??
              "Former player",
          }))
          .sort(
            (a, b) => b.rating - a.rating || a.user_id.localeCompare(b.user_id),
          ),
      );
      setMessage(
        standings.length
          ? "Standings updated from completed sessions."
          : "No completed-session results yet. Initial ladder seeding is set by Christy.",
      );
    } catch {
      setMessage(
        "Standings could not be loaded. Check your sign-in and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h1>League standings</h1>
      <p>
        Season performance uses win percentage, then percentage of available
        points, so players with different game counts can be compared. Exact
        ties share a rank. Court assignment and initial seeding are separate
        from season statistics.
      </p>
      {supabase ? (
        <>
          <button
            className="button primary"
            disabled={busy || !navigator.onLine}
            onClick={() => void load(selected)}
          >
            Refresh standings
          </button>
          {seasons.length > 0 && (
            <label>
              Season
              <select
                disabled={busy}
                value={selected}
                onChange={(e) => void load(e.target.value)}
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      ) : (
        <p>
          Official standings are available in the connected test app after
          sign-in.
        </p>
      )}
      {rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table>
            <caption>Completed-session statistics</caption>
            <thead>
              <tr>
                {["Rank", "Player", "Games", "Wins", "Win %", "Points %"].map(
                  (h) => (
                    <th scope="col" key={h}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id}>
                  <td>{r.position}</td>
                  <th scope="row">{r.display_name}</th>
                  <td>{r.played}</td>
                  <td>{r.wins}</td>
                  <td>
                    {r.played ? ((100 * r.wins) / r.played).toFixed(1) : "0.0"}%
                  </td>
                  <td>
                    {r.possible_points
                      ? ((100 * r.points) / r.possible_points).toFixed(1)
                      : "0.0"}
                    %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2>ELO skill ratings</h2>
      <p>
        Initial seeding is set by Christy. Completed rounds update team-based
        ELO with equal round weighting. New players are provisional until they
        have recorded games. No-show penalties affect court placement
        separately.
      </p>
      {elo.map((r) => (
        <p key={r.user_id}>
          {r.name} · {Math.round(r.rating)} ELO · {r.played} games
          {r.played === 0 ? " · provisional" : ""}
        </p>
      ))}
      <p role="status">{message}</p>
    </Card>
  );
}
