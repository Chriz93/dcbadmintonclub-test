import { useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
const schema = z.object({
  user_id: z.string(),
  season_id: z.string(),
  legal_name: z.string(),
  birth_date: z.string(),
  guardian_email: z.string().nullable(),
  revision: z.number(),
  reviewed_at: z.string().nullable(),
  reviewed_guardian: z.string().nullable(),
  review_current: z.boolean().nullable(),
  signed: z.boolean(),
  registration_status: z.string(),
});
type Entry = z.infer<typeof schema> & { name: string };
const reviewLabel = (r: z.infer<typeof schema>) =>
  r.review_current
    ? "reviewed"
    : r.reviewed_at
      ? "details changed since review"
      : "needs review";
export function EligibilityReview({ club }: { club: string }) {
  const [rows, setRows] = useState<Entry[]>([]),
    [selected, setSelected] = useState(""),
    [guardian, setGuardian] = useState(""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const row = rows.find((r) => `${r.season_id}/${r.user_id}` === selected);
  async function load() {
    if (!supabase) return;
    setBusy(true);
    try {
      const e = await supabase.rpc("eligibility_review_queue", { c: club });
      if (e.error) throw new Error();
      setRows(
        z
          .array(schema)
          .parse(e.data)
          .map((r) => ({ ...r, name: r.legal_name })),
      );
      setSelected("");
      setConfirmed(false);
      setMessage(
        "Details loaded. Verify identity directly with the participant and guardian before recording your review.",
      );
    } catch {
      setMessage(
        "Unable to load private eligibility details. Refresh administrator verification and retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="panel">
      <summary>Participant and guardian identity review</summary>
      <p>
        Check each participant’s date of birth directly. For anyone under 18,
        independently confirm the parent or legal guardian’s identity,
        relationship and email. A second mailbox alone is not verification. Do
        not upload identity documents here.
      </p>
      <button disabled={busy} onClick={load}>
        Load eligibility details
      </button>
      <label>
        Participant
        <select
          disabled={busy}
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setGuardian("");
            setReason("");
            setConfirmed(false);
          }}
        >
          <option value="">Choose participant</option>
          {rows.map((r) => (
            <option
              key={`${r.season_id}/${r.user_id}`}
              value={`${r.season_id}/${r.user_id}`}
            >
              {r.name} · {r.birth_date} · {reviewLabel(r)}
            </option>
          ))}
        </select>
      </label>
      {row && (
        <>
          <p>
            Date of birth: {row.birth_date}. Guardian email:{" "}
            {row.guardian_email ?? "Adult self-signing declared"}.
          </p>
          <p className="quiet">
            Status: {reviewLabel(row)}
            {row.reviewed_at
              ? ` (${new Date(row.reviewed_at).toLocaleDateString("en-CA")}${row.reviewed_guardian ? `, guardian ${row.reviewed_guardian}` : ""})`
              : ""}{" "}
            · agreement {row.signed ? "signed" : "not signed"} · registration{" "}
            {row.registration_status}
          </p>
          {row.guardian_email && (
            <label>
              Verified guardian legal name
              <input
                value={guardian}
                onChange={(e) => setGuardian(e.target.value)}
                maxLength={150}
              />
            </label>
          )}
          <label>
            How you verified these details
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I independently checked the participant’s age and, where required,
            the guardian’s identity and relationship.
          </label>
          <button
            disabled={
              busy ||
              !confirmed ||
              reason.trim().length < 10 ||
              (!!row.guardian_email && guardian.trim().length < 2)
            }
            onClick={async () => {
              if (!supabase) return;
              setBusy(true);
              try {
                const { error } = await supabase.rpc("review_eligibility", {
                  c: club,
                  s: row.season_id,
                  u: row.user_id,
                  expected_revision: row.revision,
                  guardian_name: row.guardian_email ? guardian.trim() : null,
                  reason: reason.trim(),
                  confirmed,
                });
                if (error) throw error;
                setMessage(
                  "Identity review recorded. The reviewed guardian may now sign; registration approval remains a separate step.",
                );
                setConfirmed(false);
              } catch {
                setMessage(
                  "Review not saved. Reload details to check for changes and confirm administrator MFA.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Record identity review
          </button>
        </>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
