import { useState } from "react";
import { supabase } from "../services/auth";
import { zonedUTC, type Session } from "../domain/schedule";
import type { PermitText } from "../services/pdf";
export function PermitCommit({
  rows,
  source,
  active,
  hours,
}: {
  rows: Session[];
  source: PermitText | null;
  active: number;
  hours: number;
}) {
  const [club, setClub] = useState(""),
    [season, setSeason] = useState(""),
    [venue, setVenue] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!supabase || !source || !confirmed) return;
        setBusy(true);
        try {
          const { error } = await supabase.rpc("import_permit", {
            c: club,
            season,
            venue,
            permit_number: rows[0].permit,
            source_name: source.filename,
            sha256: source.sha256,
            rows: rows.map((s) => ({
              starts_at: zonedUTC(s.date, s.start),
              ends_at: zonedUTC(s.date, s.end),
              status: s.status,
            })),
            expected_active: active,
            expected_hours: hours,
            confirmed: true,
          });
          if (error) throw error;
          setMessage(
            "Reviewed permit imported into the approved test project.",
          );
        } catch {
          setMessage(
            "Import rejected. Verify administrator MFA, tenant IDs and preview; no partial import was saved.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Confirm import to the test database</h3>
      <p>
        Verify administrator MFA below before importing. Existing sessions are
        retained; conflicting or active bookings are rejected.
      </p>
      <label>
        Club ID
        <input
          required
          value={club}
          onChange={(e) => setClub(e.target.value)}
        />
      </label>
      <label>
        Season ID
        <input
          required
          value={season}
          onChange={(e) => setSeason(e.target.value)}
        />
      </label>
      <label>
        Venue ID
        <input
          required
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I reviewed all {rows.length} dates, venue, rooms and times against the
        original PDF, including {active} active sessions and {hours} hours.
      </label>
      <button
        className="button primary"
        disabled={!supabase || !source || !confirmed || busy}
      >
        Confirm reviewed import
      </button>
      {!source && (
        <p>Select the source PDF to record its provenance before import.</p>
      )}
      <p role="status">{message}</p>
    </form>
  );
}
