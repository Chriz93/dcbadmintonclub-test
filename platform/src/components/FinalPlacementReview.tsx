import { useState } from "react";
import { nextRoundPlacement } from "../domain/placement";
import { courtMovements, movementText } from "../domain/round-status";
import type { Result } from "../domain/courts";
import { supabase } from "../services/auth";
export function FinalPlacementReview({
  club,
  session,
  revision,
  expectedMatches,
  completed,
  courts,
  previous,
  results,
  targets,
  name,
  disabled,
  onSaved,
}: {
  club: string;
  session: string;
  revision: number;
  expectedMatches: Record<string, number>;
  completed: boolean;
  courts: { id: string; number: number }[];
  previous: string[][];
  results: Result[];
  targets: { normalTarget: number; fiveTarget: number };
  name: (id: string) => string;
  disabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const [plan, setPlan] = useState<string[][] | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const valid = plan && !plan.some((c) => c.length === 1 || c.length > 5);
  return (
    <section className="final-review">
      <h2>{completed ? "Review final placements" : "Finish the night"}</h2>
      <p>
        Close the session after the last round. Review the final ladder movement
        first; closing makes season statistics and ELO official.
      </p>
      <button
        className="button"
        disabled={disabled || busy}
        onClick={() => {
          try {
            setPlan(nextRoundPlacement(previous, results, targets));
            setError("");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {completed
          ? "Review / correct final placements"
          : "Review final placements"}
      </button>
      {plan && (
        <>
          <p>
            The suggested movement uses win percentage, then normalized points,
            then stable player ID for an exact tie. You can change any placement
            before publishing.
          </p>
          {courtMovements(previous, plan).map((m) => (
            <label key={m.id}>
              {name(m.id)} ·{" "}
              {movementText({
                ...m,
                from: m.from === null ? null : courts[m.from - 1].number,
                to: m.to === null ? null : courts[m.to - 1].number,
              })}
              <select
                aria-label={`Final court for ${name(m.id)}`}
                value={m.to === null ? "" : courts[m.to - 1].id}
                disabled={busy || disabled}
                onChange={(e) => {
                  const target = courts.findIndex(
                    (c) => c.id === e.target.value,
                  );
                  setPlan((current) =>
                    current!.map((ids, i) =>
                      i === target
                        ? [...ids.filter((id) => id !== m.id), m.id]
                        : ids.filter((id) => id !== m.id),
                    ),
                  );
                }}
              >
                {courts.map((c) => (
                  <option value={c.id} key={c.id}>
                    Court {c.number}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <p>
            {plan
              .map((ids, i) => `C${courts[i].number}: ${ids.length}`)
              .join(" · ")}
          </p>
          {!valid && (
            <p role="alert">
              Balance the courts: each used court needs 2–5 players.
            </p>
          )}
          <label>
            Final review reason
            <input
              minLength={5}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reviewed final round and placements"
              disabled={busy || disabled}
            />
          </label>
          <button
            className="button primary"
            disabled={busy || disabled || !valid || reason.trim().length < 5}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await supabase!.rpc("finalize_session", {
                  c: club,
                  s: session,
                  expected_revision: revision,
                  expected_matches: expectedMatches,
                  plan: plan.map((ids, i) => ({
                    court_id: courts[i].id,
                    players: ids,
                  })),
                  reason: reason.trim(),
                });
                if (result.error)
                  throw new Error(
                    result.error.code === "40001"
                      ? "Results changed. Refresh and review final placements again."
                      : "Final placements were not confirmed. Refresh before retrying.",
                  );
                setPlan(null);
                await onSaved();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "Publishing…"
              : completed
                ? "Publish corrected final placements"
                : "Complete session"}
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
