import { useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
const season = z.object({ id: z.string(), name: z.string() });
const invitation = z.object({
  email: z.string(),
  kind: z.string(),
  created_at: z.string(),
});
/** Registration is closed: only these confirmed sign-in emails can complete onboarding. */
export function Invitations({ club }: { club: string }) {
  const [seasons, setSeasons] = useState<z.infer<typeof season>[]>([]),
    [selected, setSelected] = useState(""),
    [rows, setRows] = useState<z.infer<typeof invitation>[]>([]),
    [text, setText] = useState(""),
    [kind, setKind] = useState("regular"),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(""),
    [message, setMessage] = useState("");
  async function load(seasonId = selected) {
    if (!supabase) return;
    setBusy(true);
    try {
      const s = await supabase
        .from("seasons")
        .select("id,name")
        .eq("club_id", club);
      if (s.error) throw s.error;
      const list = z.array(season).parse(s.data);
      setSeasons(list);
      const chosen =
        list.find((x) => x.id === seasonId)?.id ?? list[0]?.id ?? "";
      setSelected(chosen);
      if (chosen) {
        const i = await supabase
          .from("season_invitations")
          .select("email,kind,created_at")
          .eq("club_id", club)
          .eq("season_id", chosen)
          .order("email");
        if (i.error) throw i.error;
        setRows(z.array(invitation).parse(i.data));
      } else setRows([]);
      setLoaded(`${club}/${chosen}`);
      setMessage("Confirmed-player list loaded.");
    } catch {
      setMessage(
        "Could not load the confirmed-player list. Check administrator verification.",
      );
    } finally {
      setBusy(false);
    }
  }
  const emails = [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const invalid = emails.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  return (
    <details>
      <summary>Confirmed players (closed registration)</summary>
      <p>
        Only sign-in emails on this list can complete league details for the
        season. Adding someone here does not approve, pay or seed them; it only
        lets them onboard. Guardians do not need to be listed.
      </p>
      <button
        className="button"
        disabled={busy || !navigator.onLine}
        onClick={() => void load()}
      >
        Load confirmed players
      </button>
      {loaded === `${club}/${selected}` && (
        <>
          <label>
            Season
            <select
              value={selected}
              disabled={busy}
              onChange={(e) => void load(e.target.value)}
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Emails to confirm (one per line or comma separated)
            <textarea
              rows={5}
              value={text}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <label>
            Player type for these emails
            <select
              value={kind}
              disabled={busy}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="regular">
                Accepted regular player — $400 season
              </option>
              <option value="spare">Approved spare — $20 per session</option>
            </select>
          </label>
          <label>
            Reason (for the audit log)
            <input
              value={reason}
              minLength={5}
              maxLength={500}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {invalid.length > 0 && (
            <p role="alert">Fix these addresses first: {invalid.join(", ")}</p>
          )}
          <button
            className="button primary"
            disabled={
              busy ||
              !emails.length ||
              invalid.length > 0 ||
              reason.trim().length < 5 ||
              !navigator.onLine
            }
            onClick={async () => {
              if (!supabase) return;
              setBusy(true);
              try {
                const { data, error } = await supabase.rpc(
                  "invite_participants",
                  {
                    c: club,
                    s: selected,
                    emails,
                    kind,
                    reason: reason.trim(),
                  },
                );
                if (error) throw error;
                setText("");
                setMessage(
                  `${z.number().parse(data)} confirmed address(es) saved.`,
                );
                await load();
              } catch {
                setMessage(
                  "Not saved. Check the addresses, reason and administrator MFA.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirm these players
          </button>
          <h4>
            {rows.length} confirmed address{rows.length === 1 ? "" : "es"}
          </h4>
          {rows.map((r) => (
            <div className="admin-record" key={r.email}>
              <span>
                {r.email} · {r.kind}
              </span>
              <button
                className="button"
                disabled={busy || reason.trim().length < 5}
                onClick={async () => {
                  if (
                    !supabase ||
                    !window.confirm(
                      `Remove ${r.email} from the confirmed list?`,
                    )
                  )
                    return;
                  setBusy(true);
                  try {
                    const { error } = await supabase.rpc("revoke_invitation", {
                      c: club,
                      s: selected,
                      email: r.email,
                      reason: reason.trim(),
                    });
                    if (error) throw error;
                    await load();
                  } catch {
                    setMessage("Not removed. Enter a reason and retry.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
