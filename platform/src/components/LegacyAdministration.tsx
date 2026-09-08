import { useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
export function LegacyAdministration({ club }: { club: string }) {
  const [oldPlayers, setOldPlayers] = useState<
    { legacy_id: string | null; display_name: string; linked: boolean }[]
  >([]);
  const [archives, setArchives] = useState<{ id: string; label: string }[]>([]),
    [archive, setArchive] = useState(""),
    [seasons, setSeasons] = useState<{ id: string; name: string }[]>([]),
    [season, setSeason] = useState(""),
    [users, setUsers] = useState<{ user_id: string; display_name: string }[]>(
      [],
    ),
    [user, setUser] = useState(""),
    [legacy, setLegacy] = useState(""),
    [reason, setReason] = useState(""),
    [label, setLabel] = useState(""),
    [source, setSource] = useState(""),
    [preview, setPreview] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    if (!supabase) return;
    setBusy(true);
    try {
      const [a, s] = await Promise.all([
        supabase.from("legacy_archives").select("id,label").eq("club_id", club),
        supabase.from("seasons").select("id,name").eq("club_id", club),
      ]);
      if (a.error || s.error) throw new Error();
      setArchives(
        z.array(z.object({ id: z.string(), label: z.string() })).parse(a.data),
      );
      setSeasons(
        z.array(z.object({ id: z.string(), name: z.string() })).parse(s.data),
      );
      setMessage(
        "Archives loaded. Link only after checking the original identity.",
      );
    } catch {
      setMessage(
        "Unable to load legacy archives. Verify administrator access.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function oldCandidates(a: string) {
    setArchive(a);
    setLegacy("");
    setOldPlayers([]);
    if (!supabase || !a) return;
    try {
      const { data, error } = await supabase.rpc("legacy_archive_players", {
        c: club,
        archive: a,
      });
      if (error) throw error;
      setOldPlayers(
        z
          .array(
            z.object({
              legacy_id: z.string().nullable(),
              display_name: z.string(),
              linked: z.boolean(),
            }),
          )
          .parse(data),
      );
    } catch {
      setMessage("Could not load original player names.");
    }
  }
  async function candidates(se: string) {
    setSeason(se);
    setUsers([]);
    setUser("");
    if (!supabase || !se) return;
    try {
      const { data, error } = await supabase.rpc("seed_candidates", {
        c: club,
        se,
      });
      if (error) {
        setMessage("Could not load signed, approved players.");
        return;
      }
      setUsers(
        z
          .array(z.object({ user_id: z.string(), display_name: z.string() }))
          .parse(data),
      );
    } catch {
      setMessage("Could not load signed, approved players.");
    }
  }
  return (
    <details>
      <summary>Previous-season archive and identity links</summary>
      <p>
        Historical data stays separate from current payments, waivers and
        ratings. Linking requires a unique matching verified email and signed,
        approved registration.
      </p>
      <button className="button" disabled={busy} onClick={() => void load()}>
        Load historical archives
      </button>
      <details>
        <summary>Archive a legacy JSON backup</summary>
        <label>
          Archive label
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={150}
          />
        </label>
        <label>
          Legacy JSON backup
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              setSource("");
              setPreview("");
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 20000000) {
                setMessage("Backup must be no larger than 20 MB.");
                return;
              }
              try {
                const text = await f.text();
                const data = JSON.parse(text);
                if (!data || !Array.isArray(data.players)) throw new Error();
                const sessions =
                  data.kv?.completed_sessions ?? data.sessions ?? [];
                if (!Array.isArray(sessions)) throw new Error();
                setSource(text);
                setPreview(
                  `${data.players.length} legacy players; ${sessions.length} completed sessions. No new membership or waiver approval will be created.`,
                );
              } catch {
                setMessage("Invalid legacy backup. No upload occurred.");
              }
            }}
          />
        </label>
        <p>{preview}</p>
        <button
          className="button"
          disabled={
            busy || !source || label.trim().length < 5 || !navigator.onLine
          }
          onClick={async () => {
            if (!supabase) return;
            setBusy(true);
            try {
              const digest = Array.from(
                new Uint8Array(
                  await crypto.subtle.digest(
                    "SHA-256",
                    new TextEncoder().encode(source),
                  ),
                ),
              )
                .map((n) => n.toString(16).padStart(2, "0"))
                .join("");
              const { error } = await supabase.rpc("archive_legacy_history", {
                c: club,
                label,
                source_text: source,
                expected_hash: digest,
              });
              if (error) throw error;
              setSource("");
              setPreview("");
              await load();
              setMessage(
                "Historical archive saved. Identity links still need review.",
              );
            } catch {
              setMessage(
                "Archive not saved. Verify format, checksum and administrator access.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Save reviewed historical archive
        </button>
      </details>
      <label>
        Historical archive
        <select
          value={archive}
          onChange={(e) => void oldCandidates(e.target.value)}
        >
          <option value="">Choose archive</option>
          {archives.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Current signed season
        <select
          value={season}
          onChange={(e) => void candidates(e.target.value)}
        >
          <option value="">Choose season</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Original legacy player
        <select value={legacy} onChange={(e) => setLegacy(e.target.value)}>
          <option value="">Choose original player</option>
          {oldPlayers.map((p, i) => (
            <option
              key={i}
              disabled={p.linked || !p.legacy_id}
              value={p.legacy_id ?? ""}
            >
              {p.display_name}
              {p.linked ? " · already linked" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Verified player
        <select value={user} onChange={(e) => setUser(e.target.value)}>
          <option value="">Choose signed, approved player</option>
          {users.map((u) => (
            <option key={u.user_id} value={u.user_id}>
              {u.display_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Identity verification reason
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
        />
      </label>
      <button
        className="button"
        disabled={
          busy ||
          !archive ||
          !season ||
          !legacy ||
          !user ||
          reason.trim().length < 5 ||
          !navigator.onLine
        }
        onClick={async () => {
          if (!supabase) return;
          setBusy(true);
          const { error } = await supabase.rpc("link_legacy_identity", {
            c: club,
            se: season,
            archive,
            legacy_id: legacy,
            u: user,
            reason,
          });
          setMessage(
            error
              ? "Link not saved. Check the original ID, matching email, current signature and existing links."
              : "Historical identity linked. The player can view previous-season games.",
          );
          setBusy(false);
        }}
      >
        Link reviewed historical identity
      </button>
      <p role="status">{message}</p>
    </details>
  );
}
