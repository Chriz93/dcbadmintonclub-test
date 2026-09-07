import { useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
const row = z.object({
  user_id: z.string(),
  display_name: z.string(),
  requested_at: z.string(),
  review_note: z.string().nullable(),
  revision: z.number(),
});
export function PrivacyReview({ club }: { club: string }) {
  const [rows, setRows] = useState<z.infer<typeof row>[]>([]),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(""),
    [message, setMessage] = useState("");
  return (
    <details>
      <summary>Privacy and deletion review</summary>
      <p>
        Record each request’s retention decision and next action. This does not
        erase data or mark the request completed. Signed records and records
        belonging to other clubs require a separate reviewed erasure plan.
      </p>
      <button
        className="button"
        disabled={busy || !navigator.onLine}
        onClick={async () => {
          if (!supabase) return;
          setBusy(true);
          setLoaded("");
          try {
            const { data, error } = await supabase.rpc("privacy_review_queue", {
              c: club,
            });
            if (error) throw error;
            setRows(z.array(row).parse(data));
            setLoaded(club);
            setMessage("Review queue refreshed.");
          } catch {
            setMessage("Unable to load privacy reviews.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Load privacy requests
      </button>
      {loaded === club &&
        (rows.length ? (
          rows.map((r) => (
            <form
              key={`${r.user_id}/${r.revision}`}
              onSubmit={async (e) => {
                e.preventDefault();
                if (!supabase) return;
                const note = new FormData(e.currentTarget).get("note");
                setBusy(true);
                try {
                  const { error } = await supabase.rpc(
                    "record_privacy_review",
                    {
                      c: club,
                      u: r.user_id,
                      expected_revision: r.revision,
                      note,
                    },
                  );
                  if (error) throw error;
                  setLoaded("");
                  setMessage("Review recorded. No data was erased.");
                } catch {
                  setMessage("Review not saved. Refresh before retrying.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h4>{r.display_name}</h4>
              <p>Requested {new Date(r.requested_at).toLocaleDateString()}</p>
              <label>
                Retention decision and next action
                <textarea
                  name="note"
                  required
                  minLength={10}
                  maxLength={2000}
                  defaultValue={r.review_note ?? ""}
                />
              </label>
              <button className="button" disabled={busy || !navigator.onLine}>
                Save privacy review
              </button>
            </form>
          ))
        ) : (
          <p>No pending requests in this club.</p>
        ))}
      <p role="status">{message}</p>
    </details>
  );
}
