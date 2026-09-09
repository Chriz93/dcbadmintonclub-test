import { useEffect, useState } from "react";
import { supabase } from "../services/auth";
import { validateScore } from "../domain/courts";
import { movementText } from "../domain/round-status";
import { useLeague } from "./useLeague";
import {
  completed,
  dateLabel,
  gameDetails,
  initialSession,
  lineups,
  nameOf,
  participant,
  partners,
  roundsFor,
  savedMovements,
  sessionCourts,
  snapshotSchema,
  stats,
  summaryText,
  seasonHighlights,
  type LeagueData,
  type LeagueMatch,
} from "./data";
import {
  CourtBoard,
  CourtRoster,
  RoundOverview,
} from "../components/MatchDayViews";
import "./league.css";
export type LeaguePage = "home" | "courts" | "scores" | "standings" | "help";
const pct = (v: number) => `${(100 * v).toFixed(0)}%`;
const rating = (v: number) => v.toFixed(1);

function ScoreEditor({
  m,
  data,
  viewer,
  admin,
  disabled,
  onDirty,
  onSave,
  onReview,
}: {
  m: LeagueMatch;
  data: LeagueData;
  viewer: string;
  admin: boolean;
  disabled: boolean;
  onDirty: (id: string, value: boolean) => void;
  onSave: (a: number, b: number, reason: string) => Promise<void>;
  onReview: (a: number, b: number, reason: string) => Promise<void>;
}) {
  const [a, setA] = useState(m.scoreA?.toString() ?? ""),
    [b, setB] = useState(m.scoreB?.toString() ?? ""),
    [reason, setReason] = useState(""),
    [request, setRequest] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const mine = participant(m, viewer),
    canSave = admin || (!completed(m) && mine),
    canReview = completed(m) && mine && !admin;
  const active =
    data.sessions.find((s) => s.id === m.session_id)?.status === "active" ||
    data.sessions.find((s) => s.id === m.session_id)?.status === "scheduled";
  const editable =
    !disabled &&
    !busy &&
    ((canSave && (active || (admin && completed(m)))) ||
      (canReview && request));
  useEffect(() => () => onDirty(m.id, false), [m.id, onDirty]);
  const input = (side: "a" | "b", value: string) => {
    (side === "a" ? setA : setB)(value);
    onDirty(m.id, true);
  };
  return (
    <article className="lp-match">
      <header>
        <strong>
          Court {data.courts.find((c) => c.id === m.court_id)?.number} · Game{" "}
          {m.game}
        </strong>
        <span>
          {completed(m)
            ? `Saved ${m.scoreA}–${m.scoreB}`
            : `First to ${m.target}`}
        </span>
      </header>
      <p>
        {m.a.map((id) => nameOf(data, id)).join(" + ")}{" "}
        <span className="lp-muted">vs</span>{" "}
        {m.b.map((id) => nameOf(data, id)).join(" + ")}
      </p>
      {gameDetails(data, m).rest.length > 0 && (
        <p className="lp-muted">
          Resting:{" "}
          {gameDetails(data, m)
            .rest.map((id) => nameOf(data, id))
            .join(", ")}
        </p>
      )}
      {canReview && !request && (
        <button
          className="button"
          disabled={disabled}
          onClick={() => setRequest(true)}
        >
          Request a correction
        </button>
      )}
      {(canSave || request) && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editable) return;
            setError("");
            try {
              if (a.trim() === "" || b.trim() === "")
                throw new Error("Enter both scores.");
              validateScore(Number(a), Number(b), m.target);
              if ((completed(m) || request) && reason.trim().length < 5)
                throw new Error("Please explain the correction.");
              setBusy(true);
              if (request) await onReview(Number(a), Number(b), reason.trim());
              else await onSave(Number(a), Number(b), reason.trim());
              onDirty(m.id, false);
              setRequest(false);
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="lp-score-inputs">
            <label>
              Team A
              <input
                aria-label={`${m.id} Team A score`}
                type="number"
                min={0}
                max={m.target}
                required
                value={a}
                disabled={!editable}
                onChange={(e) => input("a", e.target.value)}
              />
            </label>
            <span>–</span>
            <label>
              Team B
              <input
                aria-label={`${m.id} Team B score`}
                type="number"
                min={0}
                max={m.target}
                required
                value={b}
                disabled={!editable}
                onChange={(e) => input("b", e.target.value)}
              />
            </label>
          </div>
          {(completed(m) || request) && (
            <label>
              Reason
              <input
                value={reason}
                minLength={5}
                maxLength={500}
                required
                disabled={!editable}
                onChange={(e) => {
                  setReason(e.target.value);
                  onDirty(m.id, true);
                }}
              />
            </label>
          )}
          <button className="button primary" disabled={!editable}>
            {busy
              ? "Saving…"
              : request
                ? "Send correction request"
                : completed(m)
                  ? "Correct saved result"
                  : "Save result"}
          </button>
          {request && (
            <button
              type="button"
              className="button"
              onClick={() => {
                onDirty(m.id, false);
                setRequest(false);
                setA(m.scoreA?.toString() ?? "");
                setB(m.scoreB?.toString() ?? "");
              }}
            >
              Cancel request
            </button>
          )}
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
function History({
  data,
  id,
  session,
  onOpen,
}: {
  data: LeagueData;
  id?: string;
  session?: string;
  onOpen: (id: string) => void;
}) {
  const [limit, setLimit] = useState(20);
  const rows = [...data.matches]
    .reverse()
    .filter(
      (m) =>
        completed(m) &&
        (!id || participant(m, id)) &&
        (!session || m.session_id === session),
    );
  return (
    <section>
      <h2>{id ? "Match history" : "Game history"}</h2>
      <p>{rows.length} recorded games</p>
      {rows.slice(0, limit).map((m) => (
        <article key={m.id} className="lp-match">
          <header>
            <span>
              {dateLabel(
                data.sessions.find((s) => s.id === m.session_id)!.starts_at,
              )}{" "}
              · C{data.courts.find((c) => c.id === m.court_id)?.number} · R
              {m.round} · Game {m.game}
            </span>
            <strong>
              {id
                ? (
                    m.a.includes(id)
                      ? m.scoreA! > m.scoreB!
                      : m.scoreB! > m.scoreA!
                  )
                  ? "Won"
                  : "Lost"
                : ""}
            </strong>
          </header>
          <div className="lp-result">
            <div>
              {m.a.map((p) => (
                <button className="lp-name" onClick={() => onOpen(p)} key={p}>
                  {nameOf(data, p)}
                </button>
              ))}
            </div>
            <strong>
              {m.scoreA}–{m.scoreB}
            </strong>
            <div>
              {m.b.map((p) => (
                <button className="lp-name" onClick={() => onOpen(p)} key={p}>
                  {nameOf(data, p)}
                </button>
              ))}
            </div>
          </div>
        </article>
      ))}
      {!rows.length && <p>Your results will appear after a game is scored.</p>}
      {rows.length > limit && (
        <button className="button" onClick={() => setLimit((n) => n + 40)}>
          Show older games
        </button>
      )}
    </section>
  );
}
function Profile({
  data,
  id,
  onOpen,
  onClose,
}: {
  data: LeagueData;
  id: string;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const player = data.players.find((p) => p.id === id);
  if (!player) return <p>That player is no longer in this season’s roster.</p>;
  const record = stats(data, id),
    history = data.history.filter((h) => h.id === id),
    values = [player.initialRating, ...history.map((h) => h.after)];
  const min = Math.min(...values) - 20,
    max = Math.max(...values) + 20,
    points = values
      .map(
        (v, i) =>
          `${20 + (i * 460) / Math.max(1, values.length - 1)},${150 - ((v - min) * 120) / (max - min)}`,
      )
      .join(" ");
  const teammates = partners(data, id);
  return (
    <>
      <button className="button" onClick={onClose}>
        ← Back to league
      </button>
      <h1>{player.name}</h1>
      <p>
        {data.season.name} ·{" "}
        {player.seed
          ? `Initial seed ${player.seed}`
          : "Awaiting Christy’s seeding"}
      </p>
      <div className="lp-metrics">
        <div>
          <strong>{rating(player.rating)}</strong>Official ELO
        </div>
        <div>
          <strong>
            {record.wins}–{record.losses}
          </strong>
          Wins–losses
        </div>
        <div>
          <strong>{pct(record.winRate)}</strong>Win rate
        </div>
        <div>
          <strong>{record.bestStreak}</strong>Best game streak
        </div>
      </div>
      <section className="lp-card">
        <h2>ELO progress</h2>
        <p>
          {player.played
            ? `${player.played} games in completed sessions`
            : "Provisional · no completed-session games yet"}
          . Live scores become official when Christy closes the session.
        </p>
        <svg
          role="img"
          aria-label={`${player.name} ELO from ${rating(values[0])} to ${rating(values.at(-1)!)}`}
          viewBox="0 0 500 185"
        >
          <line
            x1="20"
            y1="150"
            x2="480"
            y2="150"
            stroke="currentColor"
            opacity=".2"
          />
          <polyline
            points={points}
            fill="none"
            stroke="var(--lp-accent)"
            strokeWidth="3"
          />
          <text x="20" y="178" fill="currentColor" fontSize="12">
            Seed {rating(values[0])}
          </text>
          <text
            x="480"
            y="178"
            textAnchor="end"
            fill="currentColor"
            fontSize="12"
          >
            Now {rating(values.at(-1)!)}
          </text>
        </svg>
        <details>
          <summary>Every rating change</summary>
          {history.map((h) => (
            <p key={h.session_id + "/" + h.round}>
              {dateLabel(
                data.sessions.find((s) => s.id === h.session_id)!.starts_at,
              )}{" "}
              · R{h.round}: {rating(h.before)} → {rating(h.after)} (
              {h.after >= h.before ? "+" : ""}
              {rating(h.after - h.before)}) · {h.games} games
            </p>
          ))}
        </details>
      </section>
      <section className="lp-card">
        <h2>Court journey</h2>
        <div className="lp-journey">
          {data.sessions
            .filter((s) => s.status === "completed")
            .map((s) => {
              const last = roundsFor(data, s.id).at(-1) ?? 1,
                hasFinal = data.finals.some((f) => f.session_id === s.id),
                ct = sessionCourts(data, s.id),
                pos = lineups(data, s.id, last, hasFinal).findIndex((c) =>
                  c.includes(id),
                );
              return pos >= 0 ? (
                <span key={s.id}>
                  {dateLabel(s.starts_at)}
                  <strong>C{ct[pos].number}</strong>
                  <small>
                    {hasFinal ? "Final placement" : "Last played court"}
                  </small>
                </span>
              ) : null;
            })}
        </div>
      </section>
      <details className="lp-card">
        <summary>Partner statistics</summary>
        {teammates.map((p) => (
          <p key={p.id}>
            <button className="lp-name" onClick={() => onOpen(p.id)}>
              {nameOf(data, p.id)}
            </button>{" "}
            · {p.wins} wins / {p.played} games together (
            {pct(p.wins / p.played)})
          </p>
        ))}
      </details>
      <History key={id} data={data} id={id} onOpen={onOpen} />
    </>
  );
}
export function LeagueExperience({
  page,
  userId,
  onNavigate,
  onAdmin,
  registerLeaveGuard,
}: {
  page: LeaguePage;
  userId: string;
  onNavigate: (page: LeaguePage) => void;
  onAdmin: () => void;
  registerLeaveGuard: (guard: () => boolean) => void;
}) {
  const league = useLeague(userId),
    { data } = league;
  const [selected, setSelected] = useState(""),
    [round, setRound] = useState(0),
    [profile, setProfile] = useState<string | null>(null),
    [courtMode, setCourtMode] = useState("gym"),
    [detailCourt, setDetailCourt] = useState<string | null>(null),
    [scoreFilter, setScoreFilter] = useState("mine"),
    [tab, setTab] = useState("Rankings"),
    [search, setSearch] = useState(""),
    [projector, setProjector] = useState(false),
    [message, setMessage] = useState(""),
    [copy, setCopy] = useState(""),
    [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState<Record<string, string>>({}),
    [resolution, setResolution] = useState<Record<string, string>>({}),
    [mutating, setMutating] = useState(false);
  useEffect(() => {
    registerLeaveGuard(() => !mutating && league.canLeave());
    return () => registerLeaveGuard(() => true);
  }, [registerLeaveGuard, league.canLeave, mutating]);
  useEffect(() => {
    setProfile(null);
    setMessage("");
    setProjector(false);
  }, [page]);
  useEffect(() => {
    if (
      data &&
      (page === "home" || !data.sessions.some((s) => s.id === selected))
    ) {
      setSelected(initialSession(data));
      setRound(0);
    }
  }, [data, selected, page]);
  const session = data?.sessions.find((s) => s.id === selected),
    rounds = data ? roundsFor(data, selected) : [],
    r = round || rounds.at(-1) || 1;
  const disabled = !league.fresh || !navigator.onLine || mutating;
  async function mutate(
    rpc: string,
    args: Record<string, unknown>,
    notice: string,
  ) {
    if (disabled) throw new Error("Refresh the live connection before saving.");
    setMutating(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const result = await supabase!
        .rpc(rpc, args)
        .abortSignal(controller.signal);
      if (result.error)
        throw new Error(
          result.error.code === "40001"
            ? "This record changed. Refresh and review it again."
            : result.error.message || "The change could not be saved.",
        );
      setMessage(notice);
      return true;
    } finally {
      window.clearTimeout(timeout);
      setMutating(false);
    }
  }
  async function action(
    rpc: string,
    args: Record<string, unknown>,
    notice: string,
  ) {
    try {
      await mutate(rpc, args, notice);
      await league.refresh(true);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  const pageTitle = {
    home: "Your league night.",
    courts: "Courts",
    scores: "Scores",
    standings: "Standings",
    help: "League questions",
  }[page];
  if (league.loaded && !league.choices.length)
    return (
      <section className="lp">
        <h1>{pageTitle}</h1>
        <p>
          No season has been published yet. Christy can create it in
          Administration.
        </p>
        <button className="button" onClick={() => void league.refresh(true)}>
          Refresh seasons
        </button>
      </section>
    );
  if (!data)
    return (
      <section className="lp">
        <h1>{pageTitle}</h1>
        <p role="status">{league.error || "Loading your league…"}</p>
        <button className="button" onClick={() => void league.refresh(true)}>
          Refresh league
        </button>
      </section>
    );
  const courts = sessionCourts(data, selected),
    assigned = lineups(data, selected, r),
    roundMatches = data.matches.filter(
      (m) => m.session_id === selected && m.round === r,
    ),
    movements = savedMovements(data, selected, r),
    incoming = r > 1 ? savedMovements(data, selected, r - 1) : [],
    my = data.players.find((p) => p.id === userId),
    myCourt = assigned.findIndex((c) => c.includes(userId)),
    nextGame = roundMatches.find(
      (m) => !completed(m) && m.court_id === courts[myCourt]?.id,
    ),
    myMovement = (movements.length ? movements : incoming).find(
      (m) => m.id === userId,
    );
  const open = (id: string) => {
    if (!league.canLeave()) return;
    setProfile(id);
    window.scrollTo({ top: 0 });
  };
  const person = (id: string) => (
    <button className="lp-name" key={id} onClick={() => open(id)}>
      {nameOf(data, id)}
      {id === userId ? " · You" : ""}
    </button>
  );
  const selectors = (
    <div className="lp-selectors">
      <label>
        Session
        <select
          value={selected}
          onChange={(e) => {
            if (!league.canLeave()) return;
            setSelected(e.target.value);
            setRound(0);
          }}
        >
          {data.sessions.map((s) => (
            <option value={s.id} key={s.id}>
              {dateLabel(s.starts_at)} · {s.status}
            </option>
          ))}
        </select>
      </label>
      <label>
        Round
        <select
          value={round}
          onChange={(e) => {
            if (league.canLeave()) setRound(Number(e.target.value));
          }}
        >
          <option value={0}>Latest round {rounds.at(-1) ?? "—"}</option>
          {rounds.map((n) => (
            <option value={n} key={n}>
              Round {n}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
  const dayCourts = courts.map((c, i) => ({ ...c, players: assigned[i] }));
  const dayGames = roundMatches.map((m) => ({
    ...m,
    ...gameDetails(data, m),
    court: courts.findIndex((c) => c.id === m.court_id) + 1,
    number: m.game,
  }));
  const selectedScoreCourt =
    scoreFilter === "mine" ? (courts[myCourt]?.id ?? "") : scoreFilter;
  const chooseScoreCourt = (id: string) => {
    if (league.canLeave()) setScoreFilter(id);
  };
  const progressPanel = (
    <RoundOverview
      courts={dayCourts}
      games={dayGames}
      round={r}
      rules={data.season.rules}
      published={movements}
      name={(id) => nameOf(data, id)}
      onPlayer={open}
      viewer={userId}
    />
  );
  const movementList = (
    <section className="lp-card">
      <h2>Movements after round {r}</h2>
      {movements.length ? (
        <>
          <p>
            Published{!rounds.includes(r + 1) ? " final placements" : ""}. Later
            score corrections preserve played assignments.
          </p>
          {myMovement && (
            <p className="lp-you">
              <strong>You: {movementText(myMovement)}</strong>
            </p>
          )}
          {["up", "down", "stayed", "joined", "sat_out"].map((direction) => {
            const rows = movements.filter((m) => m.direction === direction);
            return rows.length ? (
              <section key={direction}>
                <h3>
                  {
                    {
                      up: "↑ Moved up",
                      down: "↓ Moved down",
                      stayed: "Stayed on court",
                      joined: "Joined",
                      sat_out: "Sitting out",
                    }[direction]
                  }{" "}
                  · {rows.length}
                </h3>
                {rows.map((m) => (
                  <div className="lp-person-row" key={m.id}>
                    {person(m.id)}
                    <strong className={`lp-${m.direction}`}>
                      {movementText(m)}
                    </strong>
                  </div>
                ))}
              </section>
            ) : null;
          })}
        </>
      ) : (
        <p>No movements published for this round yet.</p>
      )}
    </section>
  );
  return (
    <div
      className={`lp ${!profile && (page === "courts" || page === "scores") ? "md-layout lp-match-day" : ""} ${projector ? "lp-projector" : ""}`}
    >
      <div className="lp-toolbar">
        <label>
          Season
          <select
            value={league.season}
            disabled={mutating}
            onChange={(e) => {
              if (!league.canLeave()) return;
              setProfile(null);
              setSelected("");
              setRound(0);
              league.setSeason(e.target.value);
            }}
          >
            {league.choices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <span className={league.fresh ? "lp-fresh" : "lp-stale"}>
          {league.fresh ? "● Live" : "● Reconnect"}
          {league.checkedAt
            ? ` · checked ${league.checkedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : ""}
        </span>
        <button
          className="button"
          disabled={league.busy}
          onClick={() => void league.refresh(true)}
        >
          Refresh league
        </button>
      </div>
      {league.error && <p role="alert">{league.error}</p>}
      {league.changed && (
        <div className="lp-status">
          <p>
            New results are available. Your typed score is still here. Save it,
            or discard your edits to load the update.
          </p>
          <button
            className="button"
            onClick={() => {
              if (
                window.confirm(
                  "Discard unsaved scores and load the latest results?",
                )
              )
                league.acceptUpdates();
            }}
          >
            Discard edits and update
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {profile ? (
        <Profile
          key={profile}
          data={data}
          id={profile}
          onOpen={open}
          onClose={() => setProfile(null)}
        />
      ) : (
        <>
          {page === "home" && (
            <section className="lp-card lp-home">
              <h1>Your league night.</h1>
              <p className="eyebrow">
                {session?.status === "active" ? "GAME NIGHT" : "YOUR LEAGUE"}
              </p>
              <h2>
                {session
                  ? dateLabel(session.starts_at)
                  : "Welcome to the season"}
              </h2>
              {my ? (
                <>
                  <div className="lp-metrics">
                    <div>
                      <strong>
                        {myCourt >= 0
                          ? `C${courts[myCourt].number}`
                          : "Coming soon"}
                      </strong>
                      Your court
                    </div>
                    <div>
                      <strong>
                        {my.seed || my.played
                          ? rating(my.rating)
                          : "Not seeded"}
                      </strong>
                      Official ELO
                    </div>
                    <div>
                      <strong>
                        {stats(data, userId).wins}–{stats(data, userId).losses}
                      </strong>
                      Season wins–losses
                    </div>
                  </div>
                  {myMovement && (
                    <p className="lp-you">{movementText(myMovement)}</p>
                  )}
                  {nextGame ? (
                    <>
                      <h3>
                        Round {r} · Game {nextGame.game}
                      </h3>
                      {gameDetails(data, nextGame).rest.includes(userId) ? (
                        <p>
                          You rest this game. Your turn comes in the rotation
                          below.
                        </p>
                      ) : (
                        <>
                          <p>
                            Partner:{" "}
                            {(nextGame.a.includes(userId)
                              ? nextGame.a
                              : nextGame.b
                            )
                              .filter((id) => id !== userId)
                              .map((id) => nameOf(data, id))
                              .join(", ") || "Singles game"}
                          </p>
                          <p>
                            Opponents:{" "}
                            {(nextGame.a.includes(userId)
                              ? nextGame.b
                              : nextGame.a
                            )
                              .map((id) => nameOf(data, id))
                              .join(" + ")}
                          </p>
                        </>
                      )}
                      <p>First to {nextGame.target}</p>
                    </>
                  ) : (
                    <p>
                      {myCourt >= 0
                        ? "Your results and court history are ready below."
                        : "Christy will publish assignments after check-in and seeding."}
                    </p>
                  )}
                  <div className="lp-actions">
                    <button
                      className="button primary"
                      onClick={() => onNavigate("courts")}
                    >
                      My court
                    </button>
                    <button
                      className="button"
                      onClick={() => onNavigate("scores")}
                    >
                      My scores
                    </button>
                    <button className="button" onClick={() => open(userId)}>
                      My profile & history
                    </button>
                  </div>
                </>
              ) : (
                <p>
                  {league.admin
                    ? "You are signed in as the organizer. Run the session from Administration."
                    : "Complete this season’s registration and agreement to join the player roster."}
                </p>
              )}
              {league.admin && (
                <button className="button" onClick={onAdmin}>
                  Run match day
                </button>
              )}
            </section>
          )}
          {(page === "courts" || page === "scores") && (
            <>
              <div className="lp-day-heading">
                <div>
                  <h1>{page === "courts" ? "Courts" : "Enter Scores"}</h1>
                  <p>
                    {page === "courts"
                      ? `${session ? dateLabel(session.starts_at) : "Session"} · Round ${r}`
                      : "Enter your result after each game."}
                  </p>
                </div>
                {league.admin && (
                  <button className="button" onClick={onAdmin}>
                    ⚙ Admin
                  </button>
                )}
              </div>
              <details className="lp-session-picker">
                <summary>Session &amp; round</summary>
                {selectors}
              </details>
            </>
          )}
          {page === "courts" && (
            <>
              <div className="lp-view-tabs">
                {["gym", "list"].map((mode) => (
                  <button
                    className={`button ${courtMode === mode ? "primary" : ""}`}
                    aria-pressed={courtMode === mode}
                    key={mode}
                    onClick={() => setCourtMode(mode)}
                  >
                    {mode === "gym" ? "🏟 Gym View" : "📋 List View"}
                  </button>
                ))}
              </div>
              {courtMode === "movements" ? (
                movementList
              ) : (
                <>
                  <CourtBoard
                    courts={dayCourts}
                    games={dayGames}
                    mode={courtMode === "list" ? "list" : "gym"}
                    selected={detailCourt ?? undefined}
                    incoming={incoming}
                    viewer={userId}
                    name={(id) => nameOf(data, id)}
                    onPlayer={open}
                    onCourt={(id) => {
                      setDetailCourt(id);
                      requestAnimationFrame(() =>
                        document
                          .getElementById("court-details")
                          ?.scrollIntoView({
                            block: "start",
                            behavior: "smooth",
                          }),
                      );
                    }}
                  />
                  {assigned.some((c) => c.length) && (
                    <a
                      className="md-share"
                      href={`https://wa.me/?text=${encodeURIComponent(summaryText(data, selected, r))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Share Court Assignments on WhatsApp
                    </a>
                  )}
                  {league.admin && (
                    <section className="md-panel">
                      <h2>⚙ Admin · Court assignments</h2>
                      <p className="md-hint">
                        Review eligible players, fix assignments and publish
                        changes.
                      </p>
                      <button className="button" onClick={onAdmin}>
                        Manage court assignments
                      </button>
                    </section>
                  )}
                  {detailCourt && courts.some((c) => c.id === detailCourt) && (
                    <section className="lp-card" id="court-details">
                      <h2>
                        Court {courts.find((c) => c.id === detailCourt)?.number}{" "}
                        · Round {r}
                      </h2>
                      <p>Games &amp; rest turns</p>
                      {roundMatches
                        .filter((m) => m.court_id === detailCourt)
                        .map((m) => (
                          <div className="lp-court-game" key={m.id}>
                            <strong>
                              Game {m.game} ·{" "}
                              {completed(m)
                                ? `${m.scoreA}–${m.scoreB}`
                                : `First to ${m.target}`}
                            </strong>
                            <p>
                              {m.a.map((id) => nameOf(data, id)).join(" + ")} vs{" "}
                              {m.b.map((id) => nameOf(data, id)).join(" + ")}
                            </p>
                            {gameDetails(data, m).rest.length > 0 && (
                              <small>
                                Rest:{" "}
                                {gameDetails(data, m)
                                  .rest.map((id) => nameOf(data, id))
                                  .join(", ")}
                              </small>
                            )}
                          </div>
                        ))}
                      {!roundMatches.some(
                        (m) => m.court_id === detailCourt,
                      ) && <p>No games published for this court yet.</p>}
                      <button
                        className="button primary"
                        onClick={() => {
                          setScoreFilter(detailCourt);
                          onNavigate("scores");
                        }}
                      >
                        Open scores for this court
                      </button>
                    </section>
                  )}
                </>
              )}
              <div className="lp-actions">
                <button
                  className="button"
                  onClick={() => {
                    setCourtMode("movements");
                    if (!movements.length) {
                      const published = [...rounds]
                        .reverse()
                        .find((n) => savedMovements(data, selected, n).length);
                      if (published) setRound(published);
                    }
                  }}
                >
                  Movements
                </button>
                <button
                  className="button"
                  onClick={() => setProjector(!projector)}
                >
                  {projector ? "Exit gym display" : "Gym display"}
                </button>
                <button
                  className="button"
                  onClick={async () => {
                    const text = summaryText(data, selected, r);
                    try {
                      await navigator.clipboard.writeText(text);
                      setMessage(
                        "Court summary copied. Paste it into your group when ready.",
                      );
                    } catch {
                      setCopy(text);
                    }
                  }}
                >
                  Copy summary
                </button>
              </div>
              {copy && (
                <label>
                  Summary to copy
                  <textarea readOnly value={copy} />
                </label>
              )}
              {courtMode !== "movements" && progressPanel}
            </>
          )}
          {page === "scores" && (
            <>
              <section className="md-panel lp-court-selector">
                <label>
                  Select Your Court
                  <select
                    value={selectedScoreCourt}
                    onChange={(e) => chooseScoreCourt(e.target.value)}
                  >
                    <option value="">— Choose Court —</option>
                    {courts.map((c, i) => (
                      <option value={c.id} key={c.id}>
                        Court {c.number}
                        {i === myCourt ? " · Your court" : ""}
                      </option>
                    ))}
                    <option value="all">All courts</option>
                  </select>
                </label>
              </section>
              <CourtRoster
                courts={dayCourts}
                round={r}
                selected={selectedScoreCourt}
                onCourt={chooseScoreCourt}
                name={(id) => nameOf(data, id)}
              />
              {progressPanel}
              <h2>
                {selectedScoreCourt === "all"
                  ? "All court scores"
                  : selectedScoreCourt
                    ? `Court ${courts.find((c) => c.id === selectedScoreCourt)?.number} scores`
                    : "Choose your court to enter scores"}
              </h2>
              <p className="md-hint">
                {league.admin
                  ? "Christy can correct any result with a reason."
                  : "You can submit results for games you played. Christy reviews corrections."}
              </p>
              {roundMatches
                .filter(
                  (m) =>
                    selectedScoreCourt === "all" ||
                    m.court_id === selectedScoreCourt,
                )
                .map((m) => (
                  <ScoreEditor
                    key={m.id + "/" + m.revision + "/" + league.editEpoch}
                    data={data}
                    m={m}
                    viewer={userId}
                    admin={league.admin}
                    disabled={disabled}
                    onDirty={league.markDirty}
                    onSave={async (a, b, reason) => {
                      await mutate(
                        completed(m) ? "correct_score" : "submit_score",
                        {
                          c: league.club,
                          m: m.id,
                          a,
                          b,
                          expected_revision: m.revision,
                          ...(completed(m) ? { reason } : {}),
                        },
                        "Result saved.",
                      );
                      league.markDirty(m.id, false);
                      await league.refresh(true);
                    }}
                    onReview={async (a, b, message) => {
                      await mutate(
                        "request_match_review",
                        {
                          c: league.club,
                          m: m.id,
                          a,
                          b,
                          expected_revision: m.revision,
                          message,
                        },
                        "Correction requested. Christy will review it.",
                      );
                      league.markDirty(m.id, false);
                      await league.refresh(true);
                    }}
                  />
                ))}
              {scoreFilter === "mine" &&
                !roundMatches.some((m) => participant(m, userId)) && (
                  <p>
                    You have no games in this round. Open Courts to see the
                    assignments.
                  </p>
                )}
              <details className="lp-card">
                <summary>Correction requests ({data.reviews.length})</summary>
                {data.reviews.map((q) => (
                  <article className="lp-match" key={q.id}>
                    <strong>
                      {q.status} · proposed {q.a}–{q.b}
                    </strong>
                    <p>{q.message}</p>
                    {q.resolution && <p>Christy: {q.resolution}</p>}
                    {league.admin && q.status === "open" && (
                      <>
                        <label>
                          Review decision
                          <input
                            value={resolution[q.id] ?? ""}
                            onChange={(e) =>
                              setResolution({
                                ...resolution,
                                [q.id]: e.target.value,
                              })
                            }
                          />
                        </label>
                        {[true, false].map((accept) => (
                          <button
                            key={String(accept)}
                            className="button"
                            disabled={
                              disabled ||
                              (resolution[q.id]?.trim().length ?? 0) < 5
                            }
                            onClick={() =>
                              void action(
                                "resolve_match_review",
                                {
                                  c: league.club,
                                  entry: q.id,
                                  expected_revision: q.revision,
                                  accept,
                                  reason: resolution[q.id],
                                },
                                accept
                                  ? "Correction accepted."
                                  : "Request declined with explanation.",
                              )
                            }
                          >
                            {accept
                              ? "Accept & correct score"
                              : "Decline request"}
                          </button>
                        ))}
                      </>
                    )}
                  </article>
                ))}
              </details>
            </>
          )}
          {page === "standings" && (
            <>
              <h1>Standings</h1>
              <div className="lp-tabs">
                {[
                  "Leaders",
                  "Rankings",
                  "Stats",
                  "Sessions",
                  "History",
                  "Court journey",
                ].map((t) => (
                  <button
                    key={t}
                    className={`button ${tab === t ? "primary" : ""}`}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {["Sessions", "History", "Court journey", "Leaders"].includes(
                tab,
              ) && selectors}
              {tab === "Sessions" ? (
                <>
                  {movementList}
                  <p>
                    {session?.status === "completed" &&
                    !data.finals.some((f) => f.session_id === selected)
                      ? "Final placements were not recorded for this older session. The court view shows where games were played."
                      : ""}
                  </p>
                  <History
                    key={selected}
                    data={data}
                    session={selected}
                    onOpen={open}
                  />
                </>
              ) : tab === "History" ? (
                <History
                  key={selected}
                  data={data}
                  session={selected}
                  onOpen={open}
                />
              ) : tab === "Court journey" ? (
                <div className="lp-table-scroll">
                  <table>
                    <caption>
                      Final court where recorded; otherwise last played court
                    </caption>
                    <thead>
                      <tr>
                        <th>Player</th>
                        {data.sessions
                          .filter((s) => s.status === "completed")
                          .map((s) => (
                            <th key={s.id}>{dateLabel(s.starts_at)}</th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.players.map((p) => (
                        <tr key={p.id}>
                          <th>{person(p.id)}</th>
                          {data.sessions
                            .filter((s) => s.status === "completed")
                            .map((s) => {
                              const all = lineups(
                                  data,
                                  s.id,
                                  roundsFor(data, s.id).at(-1) ?? 1,
                                  data.finals.some(
                                    (f) => f.session_id === s.id,
                                  ),
                                ),
                                i = all.findIndex((c) => c.includes(p.id));
                              return (
                                <td key={s.id}>
                                  {i >= 0
                                    ? `C${sessionCourts(data, s.id)[i].number}`
                                    : "—"}
                                </td>
                              );
                            })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <>
                  {tab === "Stats" && (
                    <details className="lp-card">
                      <summary>Season highlights</summary>
                      <h2>Most improved ELO</h2>
                      {seasonHighlights(data).improved.length ? (
                        seasonHighlights(data).improved.map((p) => (
                          <p key={p.id}>
                            {person(p.id)} · +{rating(p.change)} from initial
                            seeding
                          </p>
                        ))
                      ) : (
                        <p>
                          Improvement awards appear after completed sessions.
                        </p>
                      )}
                      <h2>Consistency</h2>
                      <p>
                        Consecutive completed league nights played. School
                        cancellations do not break a streak.
                      </p>
                      {seasonHighlights(data)
                        .players.filter((p) => p.attended)
                        .sort(
                          (a, b) => b.best - a.best || a.id.localeCompare(b.id),
                        )
                        .map((p) => (
                          <p key={p.id}>
                            {person(p.id)} · {p.attended}/
                            {seasonHighlights(data).sessions} nights · best
                            streak {p.best}
                          </p>
                        ))}
                    </details>
                  )}
                  <label>
                    Find a player
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search players"
                    />
                  </label>
                  <p>
                    {tab === "Rankings"
                      ? "Official ELO from completed sessions. New players are provisional."
                      : tab === "Leaders"
                        ? "Players grouped by their selected-session court, then season win percentage."
                        : "Completed-session statistics. Exact win and point percentage ties share a rank."}
                  </p>
                  <div className="lp-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Player</th>
                          <th>Court</th>
                          <th>ELO</th>
                          <th>W–L</th>
                          <th>Win %</th>
                          {tab === "Stats" && (
                            <>
                              <th>Points %</th>
                              <th>Best streak</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const rows = data.players
                            .map((p) => ({
                              ...p,
                              stats: stats(data, p.id),
                              court: (() => {
                                const i = lineups(
                                  data,
                                  selected,
                                  rounds.at(-1) ?? 1,
                                  session?.status === "completed" &&
                                    data.finals.some(
                                      (f) => f.session_id === selected,
                                    ),
                                ).findIndex((c) => c.includes(p.id));
                                return i < 0 ? null : courts[i].number;
                              })(),
                            }))
                            .sort((a, b) =>
                              tab === "Rankings"
                                ? b.rating - a.rating ||
                                  a.id.localeCompare(b.id)
                                : tab === "Leaders"
                                  ? (a.court ?? 999) - (b.court ?? 999) ||
                                    b.stats.winRate - a.stats.winRate ||
                                    a.id.localeCompare(b.id)
                                  : b.stats.winRate - a.stats.winRate ||
                                    b.stats.pointRate - a.stats.pointRate ||
                                    a.id.localeCompare(b.id),
                            );
                          let rank = 0;
                          return rows
                            .map((p, i) => {
                              const prior = rows[i - 1];
                              if (
                                !prior ||
                                (tab === "Rankings"
                                  ? prior.rating !== p.rating
                                  : tab === "Stats"
                                    ? prior.stats.winRate !== p.stats.winRate ||
                                      prior.stats.pointRate !==
                                        p.stats.pointRate
                                    : true)
                              )
                                rank = i + 1;
                              return { ...p, rank };
                            })
                            .filter((p) =>
                              p.name
                                .toLowerCase()
                                .includes(search.toLowerCase()),
                            )
                            .map((p) => (
                              <tr key={p.id}>
                                <td>{p.rank}</td>
                                <th>{person(p.id)}</th>
                                <td>{p.court ? `C${p.court}` : "—"}</td>
                                <td>
                                  {rating(p.rating)}
                                  {!p.played ? " *" : ""}
                                </td>
                                <td>
                                  {p.stats.wins}–{p.stats.losses}
                                </td>
                                <td>{pct(p.stats.winRate)}</td>
                                {tab === "Stats" && (
                                  <>
                                    <td>{pct(p.stats.pointRate)}</td>
                                    <td>{p.stats.bestStreak}</td>
                                  </>
                                )}
                              </tr>
                            ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                  <p className="lp-muted">
                    * Provisional. Select any name for ratings, partners and
                    every match.
                  </p>
                </>
              )}
            </>
          )}
          {page === "help" && (
            <>
              <h1>League questions</h1>
              <p>
                Answered questions are visible to league members. Keep questions
                about the league; use your account’s private controls for
                personal information.
              </p>
              {data.questions.map((q) => (
                <article className="lp-card" key={q.id}>
                  <h2>{q.question}</h2>
                  <p>{q.answer ?? "Waiting for Christy’s answer."}</p>
                  {league.admin && (
                    <>
                      <label>
                        Answer
                        <textarea
                          value={answer[q.id] ?? q.answer ?? ""}
                          onChange={(e) =>
                            setAnswer({ ...answer, [q.id]: e.target.value })
                          }
                        />
                      </label>
                      <button
                        className="button"
                        disabled={
                          disabled ||
                          ((answer[q.id] ?? q.answer)?.trim().length ?? 0) < 5
                        }
                        onClick={() =>
                          void action(
                            "answer_league_question",
                            {
                              c: league.club,
                              entry: q.id,
                              expected_revision: q.revision,
                              answer: answer[q.id] ?? q.answer,
                            },
                            "Answer published to league members.",
                          )
                        }
                      >
                        Publish answer
                      </button>
                    </>
                  )}
                </article>
              ))}
              <form
                className="lp-card"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await mutate(
                      "ask_league_question",
                      { c: league.club, question },
                      "Question sent to Christy.",
                    );
                    setQuestion("");
                    await league.refresh(true);
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              >
                <label>
                  Ask Christy
                  <textarea
                    minLength={10}
                    maxLength={1000}
                    required
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                  />
                </label>
                <button className="button primary" disabled={disabled}>
                  Submit question
                </button>
              </form>
            </>
          )}
        </>
      )}
    </div>
  );
}
// Export the validated response contract for integration fixtures and API review.
export { snapshotSchema };
