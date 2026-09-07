import { ClubNews } from "./ClubNews";
import { SmsPreferences } from "./SmsPreferences";
import { SessionAccounts } from "./SessionAccounts";
import { SeasonIntake } from "./SeasonIntake";
import { PersonalRecords } from "./PersonalRecords";
import { AgreementSigning } from "./AgreementSigning";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
import { Card } from "./ui";
const membershipSchema = z.object({
  club_id: z.string(),
  role: z.string(),
  kind: z.string().optional(),
  status: z.string(),
  club: z.object({ name: z.string() }).nullable().optional(),
});
const sessionSchema = z.object({
  id: z.string(),
  club_id: z.string(),
  starts_at: z.string(),
  rsvp_deadline: z.string(),
  capacity: z.number(),
  status: z.string(),
});
const rsvpSchema = z.object({
  response: z.string(),
  note: z.string(),
  revision: z.number(),
  placement: z.string(),
});
type Club = z.infer<typeof membershipSchema>;
type Session = z.infer<typeof sessionSchema>;
export function MemberDashboard() {
  const [readySession, setReadySession] = useState("");
  const [clubs, setClubs] = useState<Club[]>([]),
    [club, setClub] = useState(""),
    [sessions, setSessions] = useState<Session[]>([]),
    [selected, setSelected] = useState(""),
    [user, setUser] = useState(""),
    [response, setResponse] = useState("attending"),
    [note, setNote] = useState(""),
    [revision, setRevision] = useState(0),
    [placement, setPlacement] = useState(""),
    [consent, setConsent] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [request, setRequest] = useState<{ id: string; payload: string } | null>(
      null,
    );
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    (async () => {
      const {
        data: { user },
      } = await supabase!.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase!
        .from("memberships")
        .select("club_id,role,status,kind,club:clubs(name)")
        .eq("user_id", user.id);
      if (error) throw error;
      const rows = z.array(membershipSchema).parse(data);
      if (alive) {
        setUser(user.id);
        setClubs(rows);
        setClub(rows[0]?.club_id ?? "");
      }
    })().catch(() =>
      setMessage(
        "Membership could not be loaded. Check test configuration and try again.",
      ),
    );
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!supabase || !club) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase!
        .from("sessions")
        .select("id,club_id,starts_at,rsvp_deadline,capacity,status")
        .eq("club_id", club)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at");
      if (error) throw error;
      const rows = z.array(sessionSchema).parse(data);
      const pref = await supabase!
        .from("notification_preferences")
        .select("enabled")
        .eq("club_id", club)
        .eq("user_id", user)
        .eq("channel", "email")
        .maybeSingle();
      if (alive) {
        setSessions(rows);
        setSelected(rows[0]?.id ?? "");
        setConsent(pref.data?.enabled === true);
      }
    })().catch(() => setMessage("Sessions could not be loaded."));
    return () => {
      alive = false;
    };
  }, [club, user]);
  useEffect(() => {
    if (!supabase || !selected) return;
    let alive = true;
    setBusy(true);
    setReadySession("");
    (async () => {
      const { data, error } = await supabase!
        .from("rsvps")
        .select("response,note,revision,placement")
        .eq("club_id", club)
        .eq("session_id", selected)
        .eq("user_id", user)
        .maybeSingle();
      if (error) throw error;
      const r = data ? rsvpSchema.parse(data) : null;
      if (alive) {
        setResponse(r?.response ?? "attending");
        setNote(r?.note ?? "");
        setRevision(r?.revision ?? 0);
        setPlacement(r?.placement ?? "Not submitted");
        setRequest(null);
        setReadySession(selected);
      }
    })()
      .catch(() =>
        setMessage("Your RSVP could not be loaded. Refresh before editing."),
      )
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [selected, club, user]);
  const isSpare = clubs.find((c) => c.club_id === club)?.kind === "spare";
  const session = sessions.find((s) => s.id === selected);
  return (
    <Card>
      <h2>Your upcoming sessions</h2>
      {club && <ClubNews club={club} />}
      {clubs.length === 0 ? (
        <p>
          No memberships available. An administrator must review your
          registration.
        </p>
      ) : (
        <>
          <label>
            Club
            <select
              value={club}
              disabled={busy}
              onChange={(e) => setClub(e.target.value)}
            >
              {clubs.map((c) => (
                <option key={c.club_id} value={c.club_id}>
                  {c.club?.name ?? "Club membership"} · {c.status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Session
            <select
              value={selected}
              disabled={busy}
              onChange={(e) => setSelected(e.target.value)}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(s.starts_at).toLocaleString("en-CA", {
                    timeZone: "America/Toronto",
                  })}{" "}
                  · {s.status}
                </option>
              ))}
            </select>
          </label>
          {session ? (
            <>
              <p>
                Capacity: {session.capacity} · RSVP deadline:{" "}
                {new Date(session.rsvp_deadline).toLocaleString()} · Your place:{" "}
                {placement}
              </p>
              {isSpare ? (
                <p>
                  Use spare booking below to vote and submit your payment
                  reference. Your place is confirmed after payment verification.
                </p>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!supabase) return;
                    setBusy(true);
                    const payload = JSON.stringify({
                      club,
                      selected,
                      response,
                      note,
                      revision,
                    });
                    const id =
                      request?.payload === payload
                        ? request.id
                        : crypto.randomUUID();
                    setRequest({ id, payload });
                    try {
                      const { data, error } = await supabase.rpc(
                        "submit_rsvp",
                        {
                          c: club,
                          s: selected,
                          u: user,
                          response,
                          note,
                          expected_revision: revision,
                          request_id: id,
                        },
                      );
                      if (error) throw error;
                      const saved = rsvpSchema.parse(data);
                      setRevision(saved.revision);
                      setPlacement(saved.placement);
                      setRequest(null);
                      setMessage(
                        "RSVP saved. If opted in, your email is queued separately.",
                      );
                    } catch {
                      setMessage(
                        "RSVP not confirmed. Retry safely; if another device changed it, reload the session first.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    Your response
                    <select
                      value={response}
                      onChange={(e) => setResponse(e.target.value)}
                    >
                      {[
                        ["attending", "Attending"],
                        ["not_attending", "Not attending"],
                        ["maybe", "Maybe"],
                        ["late", "Late"],
                        ["need_spare", "Need a spare"],
                      ].map(([v, t]) => (
                        <option key={v} value={v}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Optional note
                    <textarea
                      maxLength={500}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                  <button
                    className="button primary"
                    disabled={
                      readySession !== selected ||
                      busy ||
                      !navigator.onLine ||
                      session.status === "cancelled"
                    }
                  >
                    {busy ? "Saving…" : "Save RSVP"}
                  </button>
                </form>
              )}
            </>
          ) : (
            <p>No upcoming sessions.</p>
          )}
          <h3>Email preferences</h3>
          <label className="check-label">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I opt in to transactional club email. I can unsubscribe here
            anytime.
          </label>
          <button
            className="button"
            disabled={busy || !navigator.onLine}
            onClick={async () => {
              if (!supabase) return;
              const { error } = await supabase.rpc("set_preference", {
                c: club,
                enabled: consent,
              });
              setMessage(
                error
                  ? "Preference not saved. Please retry."
                  : "Email preference saved.",
              );
            }}
          >
            Save email preference
          </button>
        </>
      )}
      {club && <SmsPreferences club={club} />}
      {club && selected && (
        <SessionAccounts club={club} session={selected} isSpare={isSpare} />
      )}
      <p>
        Signing for a child?{" "}
        <a href="#participant-signing">Go to guardian signing</a>; you do not
        need to register yourself as a player.
      </p>
      <SeasonIntake />
      <AgreementSigning />
      <PersonalRecords />
      <h3>Your personal data</h3>
      <button
        className="button"
        disabled={busy || !navigator.onLine}
        onClick={async () => {
          if (!supabase) return;
          const { data, error } = await supabase.rpc("export_my_data");
          if (error) {
            setMessage("Export failed. Please retry.");
            return;
          }
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(data, null, 2)], {
              type: "application/json",
            }),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = "my-club-data.json";
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        Download my data
      </button>
      <button
        className="button"
        disabled={busy || !navigator.onLine}
        onClick={async () => {
          if (
            !supabase ||
            !window.confirm(
              "Request data deletion and turn off your club email and SMS notices? An administrator will review retained records before erasure.",
            )
          )
            return;
          const { error } = await supabase.rpc("request_my_deletion");
          setMessage(
            error
              ? "Request failed. Please retry."
              : "Deletion review requested; email and SMS notices disabled.",
          );
        }}
      >
        Request data deletion
      </button>
      <p role="status">{message}</p>
      <button
        className="text-button"
        onClick={async () => {
          await supabase?.auth.signOut();
          window.location.reload();
        }}
      >
        Sign out and clear this session
      </button>
    </Card>
  );
}
