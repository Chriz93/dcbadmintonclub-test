import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
import { allocate, validateScore } from "../domain/courts";
import { Card } from "./ui";
const clubSchema = z.object({ id: z.string(), name: z.string() });
const sessionSchema = z.object({
  id: z.string(),
  venue_id: z.string(),
  starts_at: z.string(),
  status: z.string(),
  revision: z.number(),
});
const rosterSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  kind: z.string(),
});
const courtSchema = z.object({ id: z.string(), number: z.number() });
const matchSchema = z.object({
  id: z.string(),
  court_id: z.string(),
  round: z.number(),
  game: z.number(),
  target: z.number(),
  side_a: z.array(z.string()),
  side_b: z.array(z.string()),
  score_a: z.number().nullable(),
  score_b: z.number().nullable(),
  revision: z.number(),
});
type Match = z.infer<typeof matchSchema>;
type Plan = { court_id: string; players: string[] }[];
export function SessionWorkspace({ online }: { online: boolean }) {
  const [clubs, setClubs] = useState<z.infer<typeof clubSchema>[]>([]);
  const [club, setClub] = useState("");
  const [sessions, setSessions] = useState<z.infer<typeof sessionSchema>[]>([]);
  const [selected, setSelected] = useState("");
  const [roster, setRoster] = useState<z.infer<typeof rosterSchema>[]>([]);
  const [courts, setCourts] = useState<z.infer<typeof courtSchema>[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [present, setPresent] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan>([]);
  const [round, setRound] = useState(1);
  const [reason, setReason] = useState("");
  const [admin, setAdmin] = useState(false);
  const [scorekeeper, setScorekeeper] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState("");
  const [message, setMessage] = useState("");
  const session = sessions.find((s) => s.id === selected);
  const disabled = busy || !online || ready !== selected;
  const name = (id: string) =>
    roster.find((p) => p.user_id === id)?.display_name ?? "Club player";
  async function loadClubs() {
    if (!supabase) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from("clubs").select("id,name");
      if (error) throw error;
      const rows = z.array(clubSchema).parse(data);
      setClubs(rows);
      setClub(rows[0]?.id ?? "");
      setMessage(
        rows.length
          ? "Choose a club session."
          : "Sign in as an active member through Member hub first.",
      );
    } catch {
      setMessage("Club access could not be loaded. Sign in and retry.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!club || !supabase) return;
    let alive = true;
    setSelected("");
    setReady("");
    setPlan([]);
    setMatches([]);
    setRoster([]);
    (async () => {
      const results = await Promise.all([
        supabase!
          .from("sessions")
          .select("id,venue_id,starts_at,status,revision")
          .eq("club_id", club)
          .order("starts_at"),
        supabase!.rpc("club_roster", { c: club }),
        supabase!.rpc("is_admin", { c: club }),
        supabase!.rpc("is_scorekeeper", { c: club }),
      ]);
      if (results.some((r) => r.error)) throw new Error();
      if (alive) {
        const rows = z.array(sessionSchema).parse(results[0].data);
        setSessions(rows);
        setSelected(
          rows.find((s) => s.status === "active")?.id ??
            rows.find((s) => s.status === "scheduled")?.id ??
            rows[0]?.id ??
            "",
        );
        setRoster(z.array(rosterSchema).parse(results[1].data));
        setAdmin(results[2].data === true);
        setScorekeeper(results[3].data === true);
      }
    })().catch(() => {
      if (alive) setMessage("Unable to load this club's session access.");
    });
    return () => {
      alive = false;
    };
  }, [club]);
  async function refresh() {
    if (!supabase || !session) return;
    setBusy(true);
    setReady("");
    setPlan([]);
    try {
      const results = await Promise.all([
        supabase
          .from("courts")
          .select("id,number")
          .eq("club_id", club)
          .eq("venue_id", session.venue_id)
          .order("number"),
        supabase
          .from("matches")
          .select(
            "id,court_id,round,game,target,side_a,side_b,score_a,score_b,revision",
          )
          .eq("club_id", club)
          .eq("session_id", selected)
          .order("round")
          .order("game"),
        supabase
          .from("attendance")
          .select("user_id,status")
          .eq("club_id", club)
          .eq("session_id", selected),
        supabase
          .from("sessions")
          .select("id,venue_id,starts_at,status,revision")
          .eq("club_id", club)
          .eq("id", selected)
          .single(),
      ]);
      if (results.some((r) => r.error)) throw new Error();
      setCourts(z.array(courtSchema).parse(results[0].data));
      setMatches(z.array(matchSchema).parse(results[1].data));
      setPresent(
        z
          .array(z.object({ user_id: z.string(), status: z.string() }))
          .parse(results[2].data)
          .filter((p) => p.status === "present" || p.status === "late")
          .map((p) => p.user_id),
      );
      const updated = sessionSchema.parse(results[3].data);
      setSessions((rows) =>
        rows.map((s) => (s.id === updated.id ? updated : s)),
      );
      setReady(selected);
    } catch {
      setMessage(
        "Session could not be refreshed. Editing is locked until a successful refresh.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h1>Club session workspace</h1>
      <p>
        Sign in through Member hub. Administrators verify their authenticator in
        Administration before assigning courts or completing a session.
      </p>
      <button
        className="button"
        onClick={() => void loadClubs()}
        disabled={busy || !online}
      >
        Load my clubs
      </button>
      {clubs.length > 0 && (
        <>
          <label>
            Club
            <select
              value={club}
              disabled={busy}
              onChange={(e) => {
                setReady("");
                setClub(e.target.value);
              }}
            >
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Session
            <select
              value={selected}
              disabled={busy}
              onChange={(e) => {
                setReady("");
                setMatches([]);
                setPlan([]);
                setSelected(e.target.value);
              }}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(s.starts_at).toLocaleString()} · {s.status}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button"
            onClick={() => void refresh()}
            disabled={busy || !online || !selected}
          >
            Refresh session
          </button>
        </>
      )}
      {session && ready === selected && (
        <>
          <p>
            Session status: {session.status}.{" "}
            {matches.filter((m) => m.score_a !== null).length} of{" "}
            {matches.length} games recorded.
          </p>
          {scorekeeper && (
            <>
              <h3>Attendance</h3>
              {roster.map((p) => (
                <label className="check-label" key={p.user_id}>
                  <input
                    type="checkbox"
                    checked={present.includes(p.user_id)}
                    disabled={
                      disabled ||
                      !["scheduled", "active"].includes(session.status)
                    }
                    onChange={async (e) => {
                      const checked = e.target.checked;
                      setBusy(true);
                      const { error } = await supabase!.rpc("check_in", {
                        c: club,
                        s: selected,
                        u: p.user_id,
                        attendance_status: checked ? "present" : "absent",
                      });
                      if (error)
                        setMessage(
                          "Attendance not confirmed. Refresh before retrying.",
                        );
                      else {
                        setPresent((ids) =>
                          checked
                            ? [...new Set([...ids, p.user_id])]
                            : ids.filter((id) => id !== p.user_id),
                        );
                        setPlan([]);
                        setMessage("Attendance saved.");
                      }
                      setBusy(false);
                    }}
                  />
                  {p.display_name} · {p.kind}
                </label>
              ))}
            </>
          )}
          {admin && ["scheduled", "active"].includes(session.status) && (
            <>
              <h3>Assign checked-in players</h3>
              <label>
                Round
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={round}
                  disabled={disabled}
                  onChange={(e) => {
                    setPlan([]);
                    setRound(Number(e.target.value));
                  }}
                />
              </label>
              <button
                className="button"
                disabled={disabled || present.length < 2 || !courts.length}
                onClick={() => {
                  try {
                    const ids = allocate(present, courts.length);
                    if (ids.some((c) => c.length === 1)) throw new Error();
                    setPlan(
                      courts.map((c, i) => ({
                        court_id: c.id,
                        players: ids[i],
                      })),
                    );
                    setMessage("Review the assignments before saving.");
                  } catch {
                    setMessage(
                      "These players cannot fit playable courts. Check attendance and capacity.",
                    );
                  }
                }}
              >
                Preview court assignments
              </button>
              {plan.map((p, i) => (
                <p key={p.court_id}>
                  Court {courts[i].number}:{" "}
                  {p.players.map(name).join(", ") || "Empty"}
                  {p.players.length === 5 ? " · five-player rotation" : ""}
                </p>
              ))}
              {plan.length > 0 && (
                <>
                  <label>
                    Reason for this assignment
                    <textarea
                      value={reason}
                      minLength={5}
                      maxLength={500}
                      onChange={(e) => setReason(e.target.value)}
                      disabled={disabled}
                    />
                  </label>
                  <button
                    className="button primary"
                    disabled={disabled || reason.trim().length < 5}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          "Save the reviewed assignments and queue notices for opted-in players?",
                        )
                      )
                        return;
                      setBusy(true);
                      setReady("");
                      const { error } = await supabase!.rpc("assign_courts", {
                        c: club,
                        s: selected,
                        round_number: round,
                        plan,
                        expected_revision: session.revision,
                        reason: reason.trim(),
                      });
                      setMessage(
                        error
                          ? "Assignments not confirmed. Refresh to resolve any version conflict."
                          : "Assignments saved. Refresh to load games.",
                      );
                      setBusy(false);
                      setPlan([]);
                    }}
                  >
                    Confirm assignments
                  </button>
                </>
              )}
            </>
          )}
          <h3>Matches and rotations</h3>
          {matches.length === 0 ? (
            <p>No games assigned yet.</p>
          ) : (
            courts.map((court) => (
              <section key={court.id}>
                <h4>Court {court.number}</h4>
                {matches
                  .filter((m) => m.court_id === court.id)
                  .map((m) => (
                    <MatchScore
                      key={`${m.id}/${m.revision}`}
                      match={m}
                      names={name}
                      resting={[
                        ...new Set(
                          matches
                            .filter(
                              (x) =>
                                x.court_id === m.court_id &&
                                x.round === m.round,
                            )
                            .flatMap((x) => [...x.side_a, ...x.side_b]),
                        ),
                      ].filter(
                        (id) => ![...m.side_a, ...m.side_b].includes(id),
                      )}
                      disabled={
                        disabled || !scorekeeper || session.status !== "active"
                      }
                      onSave={async (a, b) => {
                        setBusy(true);
                        const { error } = await supabase!.rpc("submit_score", {
                          c: club,
                          m: m.id,
                          a,
                          b,
                          expected_revision: m.revision,
                        });
                        setBusy(false);
                        if (error) {
                          setReady("");
                          setMessage(
                            "Score not confirmed. Refresh to reconcile before retrying.",
                          );
                          throw new Error(
                            "Score not confirmed. Refresh to reconcile the current score before retrying.",
                          );
                        }
                        setMatches((rows) =>
                          rows.map((x) =>
                            x.id === m.id
                              ? {
                                  ...x,
                                  score_a: a,
                                  score_b: b,
                                  revision: x.revision + 1,
                                }
                              : x,
                          ),
                        );
                      }}
                    />
                  ))}
              </section>
            ))
          )}
          {admin && session.status === "active" && (
            <button
              className="button primary"
              disabled={
                disabled ||
                !matches.length ||
                matches.some((m) => m.score_a === null)
              }
              onClick={async () => {
                if (
                  !window.confirm(
                    "Complete this session and rebuild its season results?",
                  )
                )
                  return;
                setBusy(true);
                setReady("");
                const { error } = await supabase!.rpc("complete_session", {
                  c: club,
                  s: selected,
                  expected_revision: session.revision,
                });
                setMessage(
                  error
                    ? "Completion not confirmed. Refresh before retrying."
                    : "Session completed. Member results are updated.",
                );
                setBusy(false);
              }}
            >
              Complete session
            </button>
          )}
        </>
      )}
      <p role="status">{message}</p>
    </Card>
  );
}
function MatchScore({
  match: m,
  names,
  resting,
  disabled,
  onSave,
}: {
  match: Match;
  names: (id: string) => string;
  resting: string[];
  disabled: boolean;
  onSave: (a: number, b: number) => Promise<void>;
}) {
  const [a, setA] = useState(m.score_a?.toString() ?? "");
  const [b, setB] = useState(m.score_b?.toString() ?? "");
  const [message, setMessage] = useState("");
  return (
    <form
      className="admin-record"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          if (a === "" || b === "") throw new Error("Enter both scores.");
          validateScore(Number(a), Number(b), m.target);
          await onSave(Number(a), Number(b));
          setMessage("Score saved.");
        } catch (error) {
          setMessage((error as Error).message);
        }
      }}
    >
      <p>
        Round {m.round} · Game {m.game} · First to {m.target}
        <br />
        {m.side_a.map(names).join(" + ")} vs {m.side_b.map(names).join(" + ")}
      </p>
      {resting.length > 0 && <p>Resting: {resting.map(names).join(", ")}</p>}
      <label>
        Team A score
        <input
          aria-label={`Round ${m.round} game ${m.game} team A score`}
          type="number"
          min={0}
          max={m.target}
          required
          value={a}
          disabled={disabled}
          onChange={(e) => setA(e.target.value)}
        />
      </label>
      <label>
        Team B score
        <input
          aria-label={`Round ${m.round} game ${m.game} team B score`}
          type="number"
          min={0}
          max={m.target}
          required
          value={b}
          disabled={disabled}
          onChange={(e) => setB(e.target.value)}
        />
      </label>
      <button className="button" disabled={disabled}>
        Save official score
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
