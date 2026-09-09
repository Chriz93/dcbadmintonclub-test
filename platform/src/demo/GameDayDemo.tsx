import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Home,
  LayoutGrid,
  Mic,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Settings,
  Trophy,
} from "lucide-react";
import { rankings } from "../domain/courts";
import {
  courtMovements,
  movementText,
  roundStatus,
} from "../domain/round-status";
import {
  activeCourts,
  allMatches,
  courtFor,
  currentRatings,
  finishDemo,
  makeDemo,
  makeRound,
  movementRevision,
  nextCourts,
  playerName,
  players,
  publishMovement,
  recordScore,
  scoreCurrentRound,
  scored,
  statsFor,
  type DemoState,
  type Match,
} from "./model";
import { tour } from "./tour";
import "./game-day.css";

type Screen =
  | "home"
  | "register"
  | "courts"
  | "scores"
  | "standings"
  | "schedule"
  | "admin"
  | "movement"
  | "movements"
  | "sessions"
  | "profile";
type StandTab =
  "Leaders" | "Rankings" | "Stats" | "Sessions" | "History" | "RSVP";
const pct = (n: number) => `${Math.round(n * 100)}%`;
const ratingText = (n: number) => n.toFixed(1);
const deltaText = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
const dateText = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
const nav = [
  ["home", "Home", Home],
  ["register", "Register", ClipboardList],
  ["courts", "Courts", LayoutGrid],
  ["scores", "Scores", Pencil],
  ["standings", "Standings", Trophy],
  ["schedule", "Schedule", CalendarDays],
  ["admin", "Admin", Settings],
] as const;

function Name({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  return (
    <button className="gd-name" onClick={() => onOpen(id)}>
      {playerName(id)}
    </button>
  );
}
function Metrics({ items }: { items: [string, string | number][] }) {
  return (
    <div className="gd-metrics">
      {items.map(([label, value]) => (
        <div key={label}>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
function History({
  matches,
  player,
  onOpen,
}: {
  matches: Match[];
  player?: string;
  onOpen: (id: string) => void;
}) {
  const [limit, setLimit] = useState(12);
  const rows = matches
    .filter((m) => scored(m) && (!player || [...m.a, ...m.b].includes(player)))
    .slice()
    .reverse();
  return (
    <div className="gd-history">
      <p className="gd-muted">
        {rows.length} recorded games{player ? ` for ${playerName(player)}` : ""}
      </p>
      {rows.slice(0, limit).map((m) => {
        const won = player
          ? m.a.includes(player)
            ? m.scoreA! > m.scoreB!
            : m.scoreB! > m.scoreA!
          : null;
        return (
          <article className="gd-match" key={m.id}>
            <div className="gd-row gd-muted">
              <span>
                Session {m.session} · Round {m.round} · Court {m.court}
              </span>
              {won !== null && (
                <b className={won ? "gd-up" : "gd-down"}>
                  {won ? "WIN" : "LOSS"}
                </b>
              )}
            </div>
            <div className="gd-teams">
              <div>
                {m.a.map((id) => (
                  <Name key={id} id={id} onOpen={onOpen} />
                ))}
              </div>
              <strong>
                {m.scoreA} <span>–</span> {m.scoreB}
              </strong>
              <div>
                {m.b.map((id) => (
                  <Name key={id} id={id} onOpen={onOpen} />
                ))}
              </div>
            </div>
          </article>
        );
      })}
      {!rows.length && <p>No completed games yet.</p>}
      {limit < rows.length && (
        <button className="gd-button" onClick={() => setLimit(limit + 24)}>
          Show more matches
        </button>
      )}
    </div>
  );
}
function ScoreCard({
  match: m,
  allowed,
  correction,
  onSave,
  onOpen,
}: {
  match: Match;
  allowed: boolean;
  correction: boolean;
  onSave: (a: number, b: number, reason: string) => void;
  onOpen: (id: string) => void;
}) {
  const [a, setA] = useState(m.scoreA?.toString() ?? ""),
    [b, setB] = useState(m.scoreB?.toString() ?? ""),
    [reason, setReason] = useState("");
  return (
    <article className="gd-match">
      <div className="gd-row">
        <span className="gd-kicker">
          Court {m.court} · Game {m.id.split("-g")[1]}
        </span>
        <span className={scored(m) ? "gd-up" : "gd-muted"}>
          {scored(m) ? "✓ Saved in demo" : `First to ${m.target}`}
        </span>
      </div>
      <div className="gd-teams">
        <div>
          {m.a.map((id) => (
            <Name key={id} id={id} onOpen={onOpen} />
          ))}
        </div>
        <span className="gd-muted">vs</span>
        <div>
          {m.b.map((id) => (
            <Name key={id} id={id} onOpen={onOpen} />
          ))}
        </div>
      </div>
      {m.rest.length > 0 && (
        <p className="gd-rest">Resting: {m.rest.map(playerName).join(", ")}</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(Number(a), Number(b), reason);
        }}
      >
        <div className="gd-score-entry">
          <label>
            Team A
            <input
              aria-label={`${m.id} Team A score`}
              type="number"
              min="0"
              max={m.target}
              value={a}
              onChange={(e) => setA(e.target.value)}
              required
              disabled={!allowed}
            />
          </label>
          <span>–</span>
          <label>
            Team B
            <input
              aria-label={`${m.id} Team B score`}
              type="number"
              min="0"
              max={m.target}
              value={b}
              onChange={(e) => setB(e.target.value)}
              required
              disabled={!allowed}
            />
          </label>
          <button className="gd-button gd-primary" disabled={!allowed}>
            {scored(m) ? "Correct result" : "Save result"}
          </button>
        </div>
        {correction && scored(m) && (
          <label className="gd-label">
            Correction reason
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={5}
              required
              placeholder="Explain what was wrong"
            />
          </label>
        )}
        {!allowed && (
          <small className="gd-muted">
            {scored(m)
              ? "Christy can correct this result."
              : "Only participants or an authorized scorekeeper can score this match."}
          </small>
        )}
      </form>
    </article>
  );
}

export default function GameDayDemo() {
  const [state, setState] = useState(makeDemo),
    [screen, setScreen] = useState<Screen>("home"),
    [step, setStep] = useState(0),
    [guideOpen, setGuideOpen] = useState(true);
  const [role, setRole] = useState<"player" | "admin">("player"),
    [viewer, setViewer] = useState("demo-13"),
    [profile, setProfile] = useState("demo-13");
  const [sessionNumber, setSessionNumber] = useState(4),
    [roundNumber, setRoundNumber] = useState(1),
    [court, setCourt] = useState(6),
    [gym, setGym] = useState(true);
  const [standTab, setStandTab] = useState<StandTab>("Rankings"),
    [adminTab, setAdminTab] = useState("Players"),
    [search, setSearch] = useState("");
  const [signed, setSigned] = useState(false),
    [agreement, setAgreement] = useState(false),
    [approved, setApproved] = useState(false),
    [rsvp, setRsvp] = useState("Not responded");
  const [ageGroup, setAgeGroup] = useState("adult"),
    [scoreCourt, setScoreCourt] = useState("mine"),
    [notice, setNotice] = useState("");
  const [swapA, setSwapA] = useState("demo-01"),
    [swapB, setSwapB] = useState("demo-05"),
    [swapReason, setSwapReason] = useState("");
  const [autoTour, setAutoTour] = useState(false),
    [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const active = state.sessions[3],
    session = state.sessions[sessionNumber - 1],
    round = session.rounds[Math.min(roundNumber, session.rounds.length) - 1];
  const current = active.rounds.at(-1)!,
    ratings = currentRatings(state),
    matches = allMatches(state),
    official = allMatches(state, true),
    courts = activeCourts(state);
  const myStats = statsFor(matches, viewer),
    myCourt = courtFor(courts, viewer),
    myLast = matches
      .filter((m) => scored(m) && [...m.a, ...m.b].includes(viewer))
      .at(-1);
  const progress = roundStatus(round.courts, round.matches);
  const incoming =
    round.number > 1
      ? courtMovements(session.rounds[round.number - 2].courts, round.courts)
      : [];
  const published = round.publishedNext
    ? courtMovements(round.courts, round.publishedNext)
    : [];
  const myProgress = progress.courts.find(
    (c) => c.court === courtFor(round.courts, viewer),
  );
  const myNext = !active.complete
    ? current.matches.find((m) => !scored(m) && m.court === myCourt)
    : undefined;
  const lastPublished = [...active.rounds]
    .reverse()
    .find((r) => r.publishedNext);
  const myMovement = lastPublished
    ? courtMovements(lastPublished.courts, lastPublished.publishedNext!).find(
        (m) => m.id === viewer,
      )
    : undefined;
  const showMovements = () => {
    const latest = round.publishedNext
      ? round
      : [...session.rounds]
          .reverse()
          .find((r) => r.number < round.number && r.publishedNext);
    setRoundNumber(latest?.number ?? round.number);
    setScreen("movements");
  };
  const progressCard = (
    <section className="gd-note gd-round-status" aria-label="Round progress">
      <strong>
        Round {round.number} · {progress.completed} / {progress.expected} games
        complete
      </strong>
      <p>
        {round.publishedNext
          ? "Movement published. View the saved movements below."
          : progress.state === "invalid"
            ? `Christy needs to repair this round: ${progress.error}`
            : progress.state === "ready"
              ? "All courts finished. Stay on your court until Christy publishes the next assignments."
              : myProgress?.completed === myProgress?.expected &&
                  myProgress?.expected
                ? "Your court is finished. Waiting for the other courts—no movement yet."
                : "Finish every scheduled game. Courts move together after Christy reviews and publishes."}
      </p>
      <div className="gd-round-counters">
        {progress.courts
          .filter((c) => c.expected)
          .map((c) => (
            <span key={c.court}>
              C{c.court}: {c.completed}/{c.expected}
              {c.completed === c.expected ? " ✓" : ""}
            </span>
          ))}
      </div>
      <button className="gd-button" onClick={showMovements}>
        Court movements
      </button>
    </section>
  );
  const selectedPlayers = players.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    document.title = "Maplewood · Game-day demo";
    return () => {
      audio.current?.pause();
    };
  }, []);
  useEffect(() => {
    if (autoTour)
      void audio.current
        ?.play()
        .then(() => setPlaying(true))
        .catch(() => {
          setAutoTour(false);
          setPlaying(false);
          setNotice(
            "Press Play full tour to enable narration in this browser.",
          );
        });
  }, [step, autoTour]);

  function open(id: string) {
    setProfile(id);
    setScreen("profile");
    setNotice("");
  }
  function run(action: () => DemoState, message: string) {
    try {
      setState(action());
      setNotice(message);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  function stop() {
    audio.current?.pause();
    setPlaying(false);
    setAutoTour(false);
  }
  function go(n: number, keepPlaying = false) {
    if (!keepPlaying) stop();
    setStep(n);
    setNotice("");
    setRole(tour[n].role === "Admin" ? "admin" : "player");
    setScreen(tour[n].screen as Screen);
    setSessionNumber(4);
    setRoundNumber(1);
    setViewer("demo-13");
    setProfile("demo-13");
    setCourt(6);
    setSearch("");
    if (n >= 1) setSigned(true);
    if (n >= 2) setAgreement(true);
    if (n >= 3) setApproved(true);
    if (n >= 4) setRsvp("Attending");
    if (n === 2) setAdminTab("Registered");
    if (n === 4) setAdminTab("Attendance");
    if (n === 6) {
      setRoundNumber(current.number);
      setScoreCourt("mine");
    }
    if (n === 7) {
      setState((s) => scoreCurrentRound(s));
      setRoundNumber(current.number);
    }
    if (n >= 8) {
      setState((s) => finishDemo(s));
      setRoundNumber(4);
    }
    if (n === 10)
      setScoreCourt(String(courtFor(active.rounds.at(-1)!.courts, "demo-13")));
    if (n === 11) setAdminTab("Tools");
    heading.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  async function speak(full: boolean) {
    if (!audio.current) return;
    if (playing) {
      stop();
      return;
    }
    setAutoTour(full);
    audio.current.currentTime = 0;
    try {
      await audio.current.play();
      setPlaying(true);
    } catch {
      setAutoTour(false);
      setNotice(
        "Audio could not start. The full narration is available in the transcript below.",
      );
    }
  }
  function reset() {
    stop();
    setState(makeDemo());
    setSigned(false);
    setAgreement(false);
    setApproved(false);
    setRsvp("Not responded");
    setScoreCourt("mine");
    setStandTab("Rankings");
    go(0);
  }
  function move() {
    run(
      () => publishMovement(state, movementRevision(current)),
      current.number === 4
        ? "Demo session closed. Final placements and official ELO are published."
        : "Movement published. The next round is ready.",
    );
    setRoundNumber(Math.min(4, current.number + 1));
    setScreen(current.number === 4 ? "sessions" : "courts");
    setSessionNumber(4);
  }
  function swap() {
    run(() => {
      if (active.complete || current.matches.some(scored))
        throw new Error(
          "Swap before this round starts. Scored rounds need a reviewed restart in the connected app.",
        );
      if (swapA === swapB || swapReason.trim().length < 5)
        throw new Error("Choose two different players and enter a reason.");
      const copy = structuredClone(state),
        lineups = copy.sessions[3].rounds.at(-1)!.courts;
      const a = courtFor(lineups, swapA) - 1,
        b = courtFor(lineups, swapB) - 1,
        ai = lineups[a].indexOf(swapA),
        bi = lineups[b].indexOf(swapB);
      lineups[a][ai] = swapB;
      lineups[b][bi] = swapA;
      copy.sessions[3].rounds[copy.sessions[3].rounds.length - 1] = makeRound(
        4,
        current.number,
        lineups,
      );
      copy.audit.unshift(
        `Christy (demo): swapped ${playerName(swapA)} and ${playerName(swapB)}. ${swapReason}`,
      );
      return copy;
    }, "Demo assignments updated; all 25 players retained.");
  }
  const table = (mode: "Leaders" | "Rankings" | "Stats" | "Players") => {
    const rows = selectedPlayers.map((p) => ({
      ...p,
      stats: statsFor(matches, p.id),
      court: courtFor(courts, p.id),
      rating: ratings[p.id],
    }));
    rows.sort((a, b) =>
      mode === "Leaders"
        ? a.court - b.court ||
          b.stats.wins - a.stats.wins ||
          b.stats.winRate - a.stats.winRate ||
          a.seed - b.seed
        : b.rating - a.rating || a.seed - b.seed,
    );
    return (
      <>
        <label className="gd-search">
          Find a player
          <input
            type="search"
            placeholder="Search all 25 players"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="gd-table-scroll">
          <table>
            <caption>
              {rows.length} fictional players ·{" "}
              {mode === "Rankings"
                ? "Official ELO from completed sessions"
                : "Results include scored live games"}
            </caption>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Court</th>
                <th>ELO</th>
                <th>W–L</th>
                <th>Win %</th>
                {mode === "Stats" && (
                  <>
                    <th>Points</th>
                    <th>Point %</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={p.id} className={p.id === viewer ? "gd-you-row" : ""}>
                  <td>{i + 1}</td>
                  <td>
                    <Name id={p.id} onOpen={open} />
                    {p.id === viewer && <small className="gd-you"> YOU</small>}
                  </td>
                  <td>C{p.court}</td>
                  <td>
                    <strong className="gd-cyan">{ratingText(p.rating)}</strong>
                  </td>
                  <td>
                    {p.stats.wins}–{p.stats.losses}
                  </td>
                  <td>{pct(p.stats.winRate)}</td>
                  {mode === "Stats" && (
                    <>
                      <td>
                        {p.stats.points}–{p.stats.against}
                      </td>
                      <td>{pct(p.stats.pointRate)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  };
  const selectors = (
    <div className="gd-selectors">
      <label>
        Session
        <select
          value={sessionNumber}
          onChange={(e) => {
            setSessionNumber(Number(e.target.value));
            setRoundNumber(1);
          }}
        >
          {state.sessions.map((s) => (
            <option key={s.number} value={s.number}>
              Session {s.number} · {dateText(s.date)}
              {s.complete ? " · Completed" : " · Live demo"}
            </option>
          ))}
        </select>
      </label>
      <label>
        Round
        <select
          value={round.number}
          onChange={(e) => setRoundNumber(Number(e.target.value))}
        >
          {session.rounds.map((r) => (
            <option key={r.number} value={r.number}>
              Round {r.number}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
  const sessionSummary = () => (
    <>
      <label className="gd-label">
        View session
        <select
          value={sessionNumber}
          onChange={(e) => setSessionNumber(Number(e.target.value))}
        >
          {state.sessions.map((s) => (
            <option value={s.number} key={s.number}>
              Session {s.number} · {dateText(s.date)}
              {s.complete ? " · Final" : " · In progress"}
            </option>
          ))}
        </select>
      </label>
      <p>
        {session.complete
          ? "Final placements after the last movement. Arrows compare the last played court with the final court."
          : "Session in progress. These are the current playing courts; final placements are not published yet."}
      </p>
      <div className="gd-summary-courts">
        {(session.finalCourts ?? session.rounds.at(-1)!.courts).map(
          (ids, i) => (
            <section className="gd-card" key={i}>
              <h3>Court {i + 1}</h3>
              {ids.map((id) => {
                const s = statsFor(
                    session.rounds.flatMap((r) => r.matches),
                    id,
                  ),
                  from = courtFor(session.rounds.at(-1)!.courts, id),
                  to = i + 1;
                return (
                  <div className="gd-final-row" key={id}>
                    <div>
                      <Name id={id} onOpen={open} />
                      <small
                        className={
                          to < from
                            ? "gd-up"
                            : to > from
                              ? "gd-down"
                              : "gd-muted"
                        }
                      >
                        {session.complete
                          ? to === from
                            ? `Stayed C${to}`
                            : `${to < from ? "↑" : "↓"} C${from} → C${to}`
                          : "Playing now"}
                      </small>
                    </div>
                    <span>
                      {s.wins}W {s.losses}L · {pct(s.winRate)}
                    </span>
                  </div>
                );
              })}
            </section>
          ),
        )}
      </div>
    </>
  );

  return (
    <div className="gd-app">
      <header className="gd-header">
        <div className="gd-brand">
          <span>ML</span>
          <div>
            Maplewood Badminton<small>ADVANCED LEAGUE · 2026–27</small>
          </div>
        </div>
        <span className="gd-pill">FICTIONAL DEMO</span>
      </header>
      <div className="gd-demo-bar">
        <span>
          25 fictional players · Local simulation · Changes reset on reload
        </span>
        <button
          aria-expanded={guideOpen}
          aria-controls="game-day-guide"
          onClick={() => {
            stop();
            setGuideOpen(!guideOpen);
          }}
        >
          {guideOpen ? "Hide walkthrough" : "Show walkthrough"}
        </button>
        <button onClick={reset}>
          <RotateCcw size={14} /> Reset demo
        </button>
      </div>
      <div className={`gd-layout ${guideOpen ? "" : "gd-guide-closed"}`}>
        <aside
          id="game-day-guide"
          hidden={!guideOpen}
          className="gd-guide"
          aria-label="Game-day walkthrough"
        >
          <span className="gd-kicker">YOUR GAME-DAY WALKTHROUGH</span>
          <div className="gd-row">
            <span>
              Step {step + 1} of {tour.length}
            </span>
            <span className="gd-pill">{tour[step].role}</span>
          </div>
          <h2>{tour[step].title}</h2>
          <p className="gd-cue">{tour[step].cue}</p>
          <div className="gd-guide-buttons">
            <button
              className="gd-button gd-primary"
              onClick={() => void speak(true)}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
              {playing ? "Pause narration" : "Play full tour"}
            </button>
            <button
              className="gd-icon"
              aria-label="Read this step only"
              onClick={() => void speak(false)}
            >
              <Mic size={18} />
            </button>
          </div>
          <audio
            ref={audio}
            src={`${import.meta.env.BASE_URL}demo-narration/step-${step + 1}.wav`}
            preload="none"
            onEnded={() => {
              setPlaying(false);
              if (autoTour && step < tour.length - 1) go(step + 1, true);
              else setAutoTour(false);
            }}
            onError={() => {
              setPlaying(false);
              setAutoTour(false);
              setNotice(
                "Narration unavailable. You can still follow every step using the transcript.",
              );
            }}
          />
          <details className="gd-transcript">
            <summary>Read the explanation</summary>
            <p>{tour[step].narration}</p>
          </details>
          <div className="gd-guide-controls">
            <button
              aria-label="Previous tour step"
              disabled={step === 0}
              onClick={() => go(step - 1)}
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              aria-label="Next tour step"
              disabled={step === tour.length - 1}
              onClick={() => go(step + 1)}
            >
              Next <ArrowRight size={16} />
            </button>
          </div>
          <label className="gd-label">
            Jump to a step
            <select value={step} onChange={(e) => go(Number(e.target.value))}>
              {tour.map((t, i) => (
                <option key={t.title} value={i}>
                  {i + 1}. {t.title}
                </option>
              ))}
            </select>
          </label>
          <details className="gd-explore">
            <summary>Explore as another player or as Christy</summary>
            <label className="gd-label">
              Demo viewpoint
              <select
                value={role}
                onChange={(e) => {
                  stop();
                  setRole(e.target.value as "player" | "admin");
                  setScreen(e.target.value === "admin" ? "admin" : "home");
                  setSigned(true);
                }}
              >
                <option value="player">Player view</option>
                <option value="admin">Christy · Admin view</option>
              </select>
            </label>
            <label className="gd-label">
              Follow a fictional player
              <select
                value={viewer}
                onChange={(e) => {
                  stop();
                  setViewer(e.target.value);
                  setProfile(e.target.value);
                  setSigned(true);
                }}
              >
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="gd-fine">
              This preview demonstrates the planned interface. Switching
              viewpoint does not sign in as a real person. Connected-app
              permissions still require real authentication.
            </p>
          </details>
        </aside>
        <main className="gd-main" id="demo-main">
          <div className="gd-page-heading">
            <div>
              <p className="gd-kicker">
                {role === "admin"
                  ? "CHRISTY · ADMIN DEMONSTRATION"
                  : `${playerName(viewer).toUpperCase()} · PLAYER DEMONSTRATION`}
              </p>
              <h1 ref={heading}>
                {screen === "profile"
                  ? playerName(profile)
                  : screen === "movements"
                    ? "Court movements"
                    : screen === "movement"
                      ? "Review movement"
                      : screen === "sessions"
                        ? "Session results"
                        : nav.find(([s]) => s === screen)?.[1]}
              </h1>
            </div>
            <span className="gd-live">
              <i />
              {active.complete ? "Demo complete" : "Game night"}
            </span>
          </div>
          {notice && (
            <div className="gd-notice" role="status">
              {notice}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}

          {screen === "home" && (
            <>
              {!signed ? (
                <section className="gd-card gd-welcome">
                  <span className="gd-kicker">WELCOME TO MAPLEWOOD</span>
                  <h2>
                    Your league.
                    <br />
                    Your Tuesday night.
                  </h2>
                  <p>
                    Real players sign in with an email code, then complete
                    registration. Start here as fictional player Maya Chen.
                  </p>
                  <label className="gd-label">
                    Demo email
                    <input readOnly value="maya.chen@example.invalid" />
                  </label>
                  <button
                    className="gd-button gd-primary"
                    onClick={() => {
                      setSigned(true);
                      go(1);
                    }}
                  >
                    Continue as Maya Chen <ArrowRight size={17} />
                  </button>
                  <p className="gd-fine">
                    Simulated sign-in. No email is sent.
                  </p>
                </section>
              ) : (
                <>
                  <section className="gd-card gd-home-hero">
                    <span className="gd-kicker">
                      {active.complete
                        ? "SESSION 4 · COMPLETED"
                        : "SESSION 4 · YOUR NEXT GAME"}
                    </span>
                    <h2>Tuesday, October 6</h2>
                    <p>
                      8:15–10:15 PM · Maplewood Secondary School
                      <br />
                      Synthetic season timeline · finish play by 10:05 PM
                    </p>
                    <Metrics
                      items={[
                        ["Your court", `C${myCourt}`],
                        ["Official ELO", ratingText(ratings[viewer])],
                        [
                          "Season record",
                          `${myStats.wins}W ${myStats.losses}L`,
                        ],
                      ]}
                    />
                    {myMovement && (
                      <p className="gd-personal-movement">
                        <strong>{movementText(myMovement)}</strong> · After
                        round {lastPublished!.number}
                        {active.complete ? " · Final placement" : ""}
                      </p>
                    )}
                    {myNext ? (
                      <div className="gd-next-game" aria-label="My next game">
                        <h3>
                          Round {current.number} · Game{" "}
                          {myNext.id.split("-g")[1]} · C{myCourt}
                        </h3>
                        {myNext.rest.includes(viewer) ? (
                          <p>
                            <strong>You rest this game.</strong> Your court has
                            five players; everyone rests once.
                          </p>
                        ) : (
                          <>
                            <p>
                              Partner:{" "}
                              <strong>
                                {(myNext.a.includes(viewer)
                                  ? myNext.a
                                  : myNext.b
                                )
                                  .filter((id) => id !== viewer)
                                  .map(playerName)
                                  .join(", ") || "Singles game"}
                              </strong>
                            </p>
                            <p>
                              Opponents:{" "}
                              {(myNext.a.includes(viewer) ? myNext.b : myNext.a)
                                .map(playerName)
                                .join(" + ")}
                            </p>
                          </>
                        )}
                        <p>
                          First to {myNext.target}.{" "}
                          {myNext.rest.length > 0 &&
                          !myNext.rest.includes(viewer)
                            ? `Resting: ${myNext.rest.map(playerName).join(", ")}.`
                            : ""}
                        </p>
                        <button
                          className="gd-button gd-primary"
                          onClick={() => {
                            setSessionNumber(4);
                            setRoundNumber(current.number);
                            setScoreCourt("mine");
                            setScreen("scores");
                          }}
                        >
                          My scores
                        </button>
                      </div>
                    ) : !active.complete ? (
                      <p>
                        Your court has finished. Wait for Christy to publish
                        movement.
                      </p>
                    ) : (
                      <p>
                        Session complete. Your official ELO and full match
                        history are ready.
                      </p>
                    )}
                    <div className="gd-actions">
                      <button
                        className="gd-button gd-primary"
                        onClick={() => {
                          setScreen("courts");
                          setCourt(myCourt);
                          setRoundNumber(current.number);
                          setSessionNumber(4);
                        }}
                      >
                        See my court <ArrowRight size={16} />
                      </button>
                      <button
                        className="gd-button"
                        onClick={() => open(viewer)}
                      >
                        My player profile
                      </button>
                    </div>
                  </section>
                  <section className="gd-card">
                    <h2>Are you coming?</h2>
                    <p>
                      Your response: <strong>{rsvp}</strong>
                    </p>
                    <div className="gd-actions">
                      <button
                        className="gd-button gd-primary"
                        onClick={() => {
                          setRsvp("Attending");
                          setNotice(
                            "Demo attendance response saved. No reminder is sent.",
                          );
                        }}
                      >
                        I’m coming
                      </button>
                      <button
                        className="gd-button"
                        onClick={() => {
                          setRsvp("Absent");
                          setNotice(
                            "Demo absence recorded. The real app checks the exact 72-hour deadline before creating a $14 refund record.",
                          );
                        }}
                      >
                        Can’t attend
                      </button>
                    </div>
                    <p className="gd-fine">
                      At least 72 hours’ notice: $14 absence refund. A missed
                      response is not a no-show.
                    </p>
                  </section>
                  <section className="gd-card">
                    <div className="gd-row">
                      <h2>Your previous match</h2>
                      <button className="gd-name" onClick={() => open(viewer)}>
                        All history <ChevronRight size={14} />
                      </button>
                    </div>
                    {myLast && (
                      <History
                        key={myLast.id}
                        matches={[myLast]}
                        player={viewer}
                        onOpen={open}
                      />
                    )}
                  </section>
                </>
              )}
            </>
          )}

          {screen === "register" && (
            <section className="gd-card">
              <span className="gd-kicker">
                RETURNING ACCOUNT · NEW AGREEMENT EACH SEASON
              </span>
              <h2>Your registration</h2>
              <p>
                Accepted players finish their details here. Regular recruitment
                is closed. This demonstration does not collect or sign a real
                agreement.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setAgreement(true);
                  setNotice(
                    "Demo checklist completed. Christy must verify payment and eligibility before approval and seeding.",
                  );
                }}
              >
                <label className="gd-label">
                  Full name
                  <input readOnly value={playerName(viewer)} />
                </label>
                <div className="gd-selectors">
                  <label>
                    Membership
                    <select>
                      <option>Regular · $400 / season</option>
                      <option>Spare · $20 / session</option>
                    </select>
                  </label>
                  <label>
                    Age group
                    <select
                      value={ageGroup}
                      onChange={(e) => setAgeGroup(e.target.value)}
                    >
                      <option value="adult">18 or older</option>
                      <option value="minor">Under 18</option>
                    </select>
                  </label>
                </div>
                {ageGroup === "minor" && (
                  <div className="gd-note">
                    A separately signed-in guardian must complete consent.
                    Christy reviews their identity and authority before
                    approving participation.
                  </div>
                )}
                <label className="gd-label">
                  Payment reference
                  <input placeholder="DEMO PAYMENT — no money transferred" />
                </label>
                <div className="gd-note">
                  Season rules: 72 hours’ notice for a $14 absence refund;
                  verified no-show means one court down; school cancellation
                  credits two physical shuttlecocks. Fresh agreement every
                  season. Final agreement review is still pending.
                </div>
                <label className="gd-check">
                  <input
                    type="checkbox"
                    checked={agreement}
                    onChange={(e) => setAgreement(e.target.checked)}
                    required
                  />
                  Mark the fictional season agreement checklist complete
                </label>
                <button className="gd-button gd-primary">
                  Save demo registration
                </button>
              </form>
              <p className="gd-fine">
                {approved
                  ? "Demo status: approved and seeded."
                  : agreement
                    ? "Demo status: awaiting organizer approval."
                    : "Complete details and review the season agreement."}
              </p>
            </section>
          )}

          {screen === "courts" && (
            <>
              {selectors}
              {progressCard}
              <div className="gd-tabs">
                <button
                  className={gym ? "active" : ""}
                  onClick={() => setGym(true)}
                >
                  Gym view
                </button>
                <button
                  className={!gym ? "active" : ""}
                  onClick={() => setGym(false)}
                >
                  List view
                </button>
              </div>
              <div className="gd-note gd-success">
                ✓ {round.courts.flat().length} players assigned · 6 courts ·
                Court 6 rotates 5
              </div>
              <div className={gym ? "gd-gym" : "gd-court-list"}>
                <div className="gd-entrance">← ENTRANCE SIDE →</div>
                {(gym ? [0, 1, 2, 5, 4, 3] : [0, 1, 2, 3, 4, 5]).map((c) => (
                  <section
                    key={c}
                    className={`gd-court ${court === c + 1 ? "selected" : ""}`}
                  >
                    <button
                      className="gd-court-title"
                      onClick={() => setCourt(c + 1)}
                      aria-label={`Open Court ${c + 1}`}
                    >
                      <strong>C{c + 1}</strong>
                      <span>{round.courts[c].length} players</span>
                    </button>
                    <div className="gd-net">NET</div>
                    <div className="gd-court-players">
                      {round.courts[c].map((id) => (
                        <div
                          key={id}
                          className={id === viewer ? "gd-current-player" : ""}
                        >
                          <Name id={id} onOpen={open} />
                          {incoming.find((m) => m.id === id) &&
                            (() => {
                              const m = incoming.find((m) => m.id === id)!;
                              return (
                                <small
                                  className={`gd-movement-label gd-${m.direction}`}
                                >
                                  {movementText(m)}
                                </small>
                              );
                            })()}
                        </div>
                      ))}
                    </div>
                    {c === 5 && (
                      <small className="gd-rest">
                        One rests each game · first to 15
                      </small>
                    )}
                  </section>
                ))}
                <div className="gd-entrance">← BACK WALL →</div>
              </div>
              <p className="gd-fine gd-center">
                Tap a player for their full profile. Tap a court number for its
                games.
              </p>
              <section className="gd-card">
                <h2>
                  Court {court} · Round {round.number}
                </h2>
                <p>
                  {round.courts[court - 1].length === 5
                    ? "Five games. Each pair partners once; each player rests once."
                    : "Three games. Everyone partners with every other player."}
                </p>
                {round.matches
                  .filter((m) => m.court === court)
                  .map((m, i) => (
                    <div className="gd-court-game" key={m.id}>
                      <b>Game {i + 1}</b>
                      <span>
                        {m.a.map(playerName).join(" + ")}
                        <br />
                        <small>vs</small> {m.b.map(playerName).join(" + ")}
                      </span>
                      <strong>
                        {scored(m)
                          ? `${m.scoreA}–${m.scoreB}`
                          : `To ${m.target}`}
                      </strong>
                      {m.rest.length > 0 && (
                        <small className="gd-rest">
                          Rest: {m.rest.map(playerName).join(", ")}
                        </small>
                      )}
                    </div>
                  ))}
                <button
                  className="gd-button gd-primary"
                  onClick={() => {
                    setScoreCourt(String(court));
                    setScreen("scores");
                  }}
                >
                  Open scores for Court {court}
                </button>
              </section>
            </>
          )}

          {screen === "scores" && (
            <>
              {selectors}
              {progressCard}
              <div className="gd-row gd-score-progress">
                <strong>
                  {round.matches.filter(scored).length} / {round.matches.length}{" "}
                  games scored
                </strong>
                <span>
                  {session.complete ? "Completed session" : "Current round"}
                </span>
              </div>
              <progress
                value={round.matches.filter(scored).length}
                max={round.matches.length}
              />
              <label className="gd-label">
                Show games
                <select
                  value={scoreCourt}
                  onChange={(e) => setScoreCourt(e.target.value)}
                >
                  <option value="mine">My games · {playerName(viewer)}</option>
                  {role === "admin" && <option value="all">All courts</option>}
                  {[1, 2, 3, 4, 5, 6].map((c) => (
                    <option key={c} value={c}>
                      Court {c}
                    </option>
                  ))}
                </select>
              </label>
              <p className="gd-muted">
                {role === "admin"
                  ? "Christy can correct any result with a reason. Official ELO rebuilds from completed sessions."
                  : "Players submit their own games. Christy handles corrections to saved results."}
              </p>
              {round.matches
                .filter(
                  (m) =>
                    scoreCourt === "all" ||
                    (scoreCourt === "mine"
                      ? [...m.a, ...m.b].includes(viewer)
                      : m.court === Number(scoreCourt)),
                )
                .map((m) => (
                  <ScoreCard
                    key={`${m.id}-${m.revision}-${role}`}
                    match={m}
                    correction={role === "admin"}
                    allowed={
                      role === "admin" ||
                      (!scored(m) && [...m.a, ...m.b].includes(viewer))
                    }
                    onOpen={open}
                    onSave={(a, b, reason) =>
                      run(
                        () =>
                          recordScore(
                            state,
                            m.id,
                            a,
                            b,
                            role,
                            viewer,
                            reason,
                            m.revision,
                          ),
                        "Result saved in the demo. Statistics updated; official ELO uses completed sessions.",
                      )
                    }
                  />
                ))}
              {!active.complete && role === "admin" && (
                <div className="gd-actions">
                  <button
                    className="gd-button"
                    onClick={() =>
                      run(
                        () => scoreCurrentRound(state),
                        "Filled the current round with synthetic results.",
                      )
                    }
                  >
                    Fill current round with demo scores
                  </button>
                  <button
                    className="gd-button gd-primary"
                    onClick={() => setScreen("movement")}
                  >
                    Review movement
                  </button>
                </div>
              )}
            </>
          )}

          {screen === "movement" && (
            <>
              <p className="gd-note">
                {current.publishedNext
                  ? "Already published. These saved assignments remain unchanged by later score corrections."
                  : "Preview only. Players stay on their current courts until Christy publishes."}
              </p>
              <p>
                Round {current.number}: {current.matches.filter(scored).length}{" "}
                / 20 games complete. Movement uses win %, points %, then stable
                ID for an exact tie.
              </p>
              {current.matches.every(scored) ? (
                <>
                  <div className="gd-summary-courts">
                    {current.courts.map((ids, c) => {
                      const ordered = rankings(
                          ids,
                          current.matches
                            .filter((m) => m.court === c + 1)
                            .map((m) => ({
                              game: m,
                              a: m.scoreA!,
                              b: m.scoreB!,
                            })),
                        ),
                        next = current.publishedNext ?? nextCourts(current);
                      return (
                        <section className="gd-card" key={c}>
                          <h3>Court {c + 1}</h3>
                          {ordered.map((p) => {
                            const to = courtFor(next, p.id);
                            return (
                              <div className="gd-final-row" key={p.id}>
                                <div>
                                  <Name id={p.id} onOpen={open} />
                                  <small>
                                    {p.wins}W · {pct(p.winRate)} wins ·{" "}
                                    {pct(p.pointRate)} points
                                  </small>
                                </div>
                                <b
                                  className={
                                    to < c + 1
                                      ? "gd-up"
                                      : to > c + 1
                                        ? "gd-down"
                                        : "gd-muted"
                                  }
                                >
                                  {to === c + 1
                                    ? "Stay"
                                    : `${to < c + 1 ? "↑" : "↓"} C${to}`}
                                </b>
                              </div>
                            );
                          })}
                        </section>
                      );
                    })}
                  </div>
                  <div className="gd-actions">
                    <button
                      className="gd-button gd-primary"
                      disabled={active.complete || role !== "admin"}
                      onClick={move}
                    >
                      {current.number === 4
                        ? "Publish final placements & close"
                        : `Publish round ${current.number + 1}`}
                    </button>
                    {!active.complete && (
                      <button
                        className="gd-button"
                        onClick={() => {
                          run(
                            () => finishDemo(state),
                            "Four rounds and 80 games completed. Final placements and ratings published in the demo.",
                          );
                          setScreen("sessions");
                          setSessionNumber(4);
                        }}
                      >
                        Simulate remaining rounds & close
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <section className="gd-card">
                  <h2>Finish the round first</h2>
                  <p>
                    The app will not calculate movement from missing scores.
                  </p>
                  <button
                    className="gd-button gd-primary"
                    disabled={role !== "admin"}
                    onClick={() =>
                      run(
                        () => scoreCurrentRound(state),
                        "Demo scores filled; movement is ready to review.",
                      )
                    }
                  >
                    Fill missing demo scores
                  </button>
                </section>
              )}
            </>
          )}

          {screen === "movements" && (
            <>
              {selectors}
              <p className="gd-note">
                {round.publishedNext
                  ? `Published after round ${round.number}${session.complete && round.number === session.rounds.length ? " · Final placement, no additional round" : ` · Assignments for round ${round.number + 1}`}.`
                  : "No movements published for this round. Finish every game, then Christy reviews and publishes."}
              </p>
              {published.length > 0 ? (
                <>
                  <p>
                    Saved assignments for all {published.length} players. Later
                    score corrections update results and ELO; they do not
                    rewrite where people played.
                  </p>
                  <div className="gd-movement-history">
                    {["up", "down", "stayed", "joined", "sat_out"].map(
                      (direction) => {
                        const rows = published.filter(
                          (m) => m.direction === direction,
                        );
                        if (!rows.length) return null;
                        return (
                          <section className="gd-card" key={direction}>
                            <h2>
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
                            </h2>
                            {rows.map((m) => (
                              <div
                                className={`gd-final-row ${m.id === viewer ? "gd-you-row" : ""}`}
                                key={m.id}
                              >
                                <span>
                                  <Name id={m.id} onOpen={open} />
                                  {m.id === viewer && <small> YOU</small>}
                                </span>
                                <strong className={`gd-${m.direction}`}>
                                  {movementText(m)}
                                </strong>
                              </div>
                            ))}
                          </section>
                        );
                      },
                    )}
                  </div>
                </>
              ) : (
                progressCard
              )}
              <details className="gd-card">
                <summary>How court movement works</summary>
                <p>
                  Every active court finishes its full rotation. Four players
                  play three games to 21; five players play five games to 15,
                  with one rest each. Highest win percentage ranks first, then
                  points earned divided by maximum possible points. An exact tie
                  uses the same stable player identifier each time.
                </p>
                <p>
                  The top player moves up one court and the bottom player moves
                  down one court. Court 1’s top player and the lowest active
                  court’s bottom player stay. All adjacent swaps happen
                  together, preserving each court’s size. ELO is separate and
                  updates officially when Christy closes the session.
                </p>
              </details>
              <button
                className="gd-button"
                onClick={() => {
                  setRoundNumber(
                    Math.min(round.number + 1, session.rounds.length),
                  );
                  setScreen("courts");
                }}
              >
                {session.complete && round.number === session.rounds.length
                  ? "See last played courts"
                  : "See court assignments"}
              </button>
            </>
          )}

          {screen === "standings" && (
            <>
              <div className="gd-tabs" aria-label="Standings sections">
                {(
                  [
                    "Leaders",
                    "Rankings",
                    "Stats",
                    "Sessions",
                    "History",
                    "RSVP",
                  ] as StandTab[]
                ).map((t) => (
                  <button
                    key={t}
                    className={standTab === t ? "active" : ""}
                    onClick={() => {
                      setStandTab(t);
                      setSearch("");
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {(["Leaders", "Rankings", "Stats"] as StandTab[]).includes(
                standTab,
              ) && (
                <section className="gd-card">
                  <h2>
                    {standTab === "Rankings"
                      ? "ELO rankings"
                      : standTab === "Leaders"
                        ? "Court leaders"
                        : "Season statistics"}
                  </h2>
                  <p>
                    {standTab === "Rankings"
                      ? "Opponent-based ELO · seeded by Christy · official after session completion"
                      : standTab === "Leaders"
                        ? "Current court first, then wins and win percentage. ELO rank is shown separately in Rankings."
                        : "Wins, losses and points from the recorded games. Points percentage is points won / maximum possible points."}
                  </p>
                  {table(standTab as "Leaders" | "Rankings" | "Stats")}
                </section>
              )}
              {standTab === "Sessions" && sessionSummary()}
              {standTab === "History" && (
                <section className="gd-card">
                  <label className="gd-label">
                    Session
                    <select
                      value={sessionNumber}
                      onChange={(e) => setSessionNumber(Number(e.target.value))}
                    >
                      {state.sessions.map((s) => (
                        <option key={s.number} value={s.number}>
                          Session {s.number} · {dateText(s.date)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <History
                    key={sessionNumber}
                    matches={session.rounds.flatMap((r) => r.matches)}
                    onOpen={open}
                  />
                </section>
              )}
              {standTab === "RSVP" && (
                <section className="gd-card">
                  <h2>Session 4 attendance</h2>
                  <p>
                    24 demo players marked attending. Your selected player's
                    response can be changed on Home; check-in remains an
                    organizer decision.
                  </p>
                  {players.map((p) => (
                    <div className="gd-final-row" key={p.id}>
                      <Name id={p.id} onOpen={open} />
                      <span
                        className={
                          p.id === viewer && rsvp !== "Attending"
                            ? "gd-muted"
                            : "gd-up"
                        }
                      >
                        {p.id === viewer ? rsvp : "Attending"}
                      </span>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
          {screen === "sessions" && sessionSummary()}

          {screen === "profile" &&
            (() => {
              const p = players.find((p) => p.id === profile)!,
                s = statsFor(matches, p.id),
                values = [
                  p.initialRating,
                  ...state.sessions
                    .filter((s) => s.complete)
                    .map((s) => s.after[p.id]),
                ],
                lo = Math.min(...values) - 12,
                hi = Math.max(...values) + 12;
              const xy = values.map((v, i) => [
                30 + (i * 440) / Math.max(1, values.length - 1),
                145 - ((v - lo) * 105) / (hi - lo),
              ]);
              const best = Math.min(
                ...state.sessions.flatMap((s) =>
                  s.rounds.map((r) => courtFor(r.courts, p.id)),
                ),
              );
              return (
                <>
                  <button
                    className="gd-name gd-back"
                    onClick={() => {
                      setScreen("standings");
                      setStandTab("Rankings");
                    }}
                  >
                    ← All players
                  </button>
                  <section className="gd-card">
                    <div className="gd-row">
                      <span className="gd-pill">
                        Regular player · Seed {p.seed}
                      </span>
                      <span className="gd-muted">Fictional player</span>
                    </div>
                    <Metrics
                      items={[
                        ["Official ELO", ratingText(ratings[p.id])],
                        [
                          "Since seeding",
                          deltaText(ratings[p.id] - p.initialRating),
                        ],
                        ["Current court", `C${courtFor(courts, p.id)}`],
                        ["Best played court", `C${best}`],
                      ]}
                    />
                    <Metrics
                      items={[
                        ["Games", s.games],
                        ["Wins", s.wins],
                        ["Losses", s.losses],
                        ["Win rate", pct(s.winRate)],
                      ]}
                    />
                    <p className="gd-fine">
                      Game totals include saved live results. Official ELO
                      changes when a session is completed.
                    </p>
                  </section>
                  <section className="gd-card">
                    <h2>ELO progress</h2>
                    <svg
                      className="gd-chart"
                      viewBox="0 0 500 185"
                      role="img"
                      aria-label={`${p.name} ELO: ${values.map(ratingText).join(", ")}`}
                    >
                      <path d="M30 150 H470" stroke="#32495f" />
                      <polyline
                        points={xy.map((pt) => pt.join(",")).join(" ")}
                        fill="none"
                        stroke="#19c5ee"
                        strokeWidth="3"
                      />
                      {xy.map(([x, y], i) => (
                        <g key={i}>
                          <circle cx={x} cy={y} r="5" fill="#29d594" />
                          <text x={x} y={y - 12} textAnchor="middle">
                            {ratingText(values[i])}
                          </text>
                          <text
                            className="gd-chart-label"
                            x={x}
                            y="177"
                            textAnchor="middle"
                          >
                            {i === 0 ? "Seed" : `Session ${i}`}
                          </text>
                        </g>
                      ))}
                    </svg>
                    <p className="gd-fine">
                      K = 32 · team average opponent rating · average change per
                      round. Resting does not create a result.
                    </p>
                  </section>
                  <section className="gd-card">
                    <h2>Court and session history</h2>
                    {state.sessions.map((ss) => (
                      <div className="gd-final-row" key={ss.number}>
                        <div>
                          <strong>
                            Session {ss.number} · {dateText(ss.date)}
                          </strong>
                          <small>
                            {ss.rounds
                              .map(
                                (r) =>
                                  `R${r.number}: C${courtFor(r.courts, p.id)}`,
                              )
                              .join(" → ")}
                            {ss.finalCourts &&
                              ` → Final C${courtFor(ss.finalCourts, p.id)}`}
                          </small>
                        </div>
                        <b
                          className={
                            ss.after[p.id] >= ss.before[p.id]
                              ? "gd-up"
                              : "gd-down"
                          }
                        >
                          {ss.complete
                            ? deltaText(ss.after[p.id] - ss.before[p.id])
                            : "In progress"}
                        </b>
                      </div>
                    ))}
                  </section>
                  <section className="gd-card">
                    <h2>Match history</h2>
                    <History
                      key={p.id}
                      matches={matches}
                      player={p.id}
                      onOpen={open}
                    />
                  </section>
                </>
              );
            })()}

          {screen === "schedule" && (
            <section className="gd-card">
              <h2>Demo season timeline</h2>
              <p>
                These four fictional sessions demonstrate a season in progress.
                Your approved permit calendar remains in the connected app.
              </p>
              {state.sessions.map((s) => (
                <button
                  className="gd-schedule-item"
                  key={s.number}
                  onClick={() => {
                    setSessionNumber(s.number);
                    setScreen("sessions");
                  }}
                >
                  <span>
                    <strong>Tuesday, {dateText(s.date)}</strong>
                    <small>8:15–10:15 PM · Session {s.number}</small>
                  </span>
                  <span className={s.complete ? "gd-up" : "gd-cyan"}>
                    {s.complete ? "Completed" : "Ready to play"} →
                  </span>
                </button>
              ))}
            </section>
          )}

          {screen === "admin" && (
            <>
              <div className="gd-note gd-admin-note">
                Christy · All controls below affect fictional demo data only.
              </div>
              <div className="gd-tabs">
                {[
                  "Players",
                  "Registered",
                  "Session",
                  "Attendance",
                  "Assign",
                  "Payments",
                  "Tools",
                ].map((t) => (
                  <button
                    key={t}
                    className={adminTab === t ? "active" : ""}
                    onClick={() => setAdminTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {adminTab === "Players" && (
                <section className="gd-card">
                  <h2>All 25 players</h2>
                  <div className="gd-distribution">
                    {courts.map((ids, i) => (
                      <div key={i}>
                        <small>C{i + 1}</small>
                        <strong>{ids.length}</strong>
                      </div>
                    ))}
                  </div>
                  {table("Players")}
                </section>
              )}
              {adminTab === "Registered" && (
                <section className="gd-card">
                  <h2>Maya Chen · Review registration</h2>
                  <p>
                    Step through a fictional organizer approval. The three
                    historical sessions already contain simulated approvals for
                    all participants.
                  </p>
                  <div className="gd-checklist">
                    <span>
                      <CheckCircle2 /> Email verified (simulated)
                    </span>
                    <span>
                      <CheckCircle2 /> Details completed (simulated)
                    </span>
                    <span>
                      <CheckCircle2 /> Season agreement:{" "}
                      {agreement
                        ? "demo checklist complete"
                        : "pending in the tour"}
                    </span>
                    <span>
                      <CheckCircle2 /> $400 bank verification (simulated)
                    </span>
                  </div>
                  <Metrics
                    items={[
                      ["Initial seed", 13],
                      ["Starting ELO", 1180],
                      ["Status", approved ? "Approved" : "Review"],
                    ]}
                  />
                  <button
                    className="gd-button gd-primary"
                    disabled={!agreement || approved}
                    onClick={() => {
                      setApproved(true);
                      setNotice(
                        "Maya's fictional approval is complete. Seed 13 starts at 1180 ELO.",
                      );
                    }}
                  >
                    Approve demo player & seed
                  </button>
                  <p className="gd-fine">
                    In the real app, missing participant/guardian approval
                    blocks seeding. A payment claim alone does not verify
                    payment.
                  </p>
                </section>
              )}
              {adminTab === "Attendance" && (
                <section className="gd-card">
                  <h2>Check-in · 25 present</h2>
                  <p>
                    This rehearsal uses all 25 approved players. A real no-show
                    is reviewed against their attendance commitment before a
                    one-court penalty is applied.
                  </p>
                  {players.map((p) => (
                    <div className="gd-final-row" key={p.id}>
                      <Name id={p.id} onOpen={open} />
                      <span className="gd-up">✓ Present · demo</span>
                    </div>
                  ))}
                  <button
                    className="gd-button gd-primary"
                    onClick={() => {
                      setAdminTab("Assign");
                    }}
                  >
                    Review court assignments
                  </button>
                </section>
              )}
              {adminTab === "Assign" && (
                <section className="gd-card">
                  <h2>Review starting courts</h2>
                  <p>
                    Initial order uses ELO, seed and stable identity. You can
                    swap two players before scoring begins. This keeps every
                    participant exactly once.
                  </p>
                  <div className="gd-distribution">
                    {current.courts.map((ids, i) => (
                      <div key={i}>
                        <small>C{i + 1}</small>
                        <strong>{ids.length}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="gd-selectors">
                    <label>
                      First player
                      <select
                        value={swapA}
                        onChange={(e) => setSwapA(e.target.value)}
                      >
                        {players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Second player
                      <select
                        value={swapB}
                        onChange={(e) => setSwapB(e.target.value)}
                      >
                        {players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="gd-label">
                    Reason
                    <input
                      value={swapReason}
                      onChange={(e) => setSwapReason(e.target.value)}
                      placeholder="Why this assignment needs a change"
                    />
                  </label>
                  <div className="gd-actions">
                    <button
                      className="gd-button"
                      disabled={active.complete || current.matches.some(scored)}
                      onClick={swap}
                    >
                      Swap demo players
                    </button>
                    <button
                      className="gd-button gd-primary"
                      onClick={() => {
                        setScreen("courts");
                        setSessionNumber(4);
                        setRoundNumber(current.number);
                      }}
                    >
                      View published courts
                    </button>
                  </div>
                </section>
              )}
              {adminTab === "Session" && (
                <section className="gd-card">
                  <h2>Session 4 control desk</h2>
                  <Metrics
                    items={[
                      ["Players", 25],
                      ["Round", current.number],
                      [
                        "Games scored",
                        active.rounds.flatMap((r) => r.matches).filter(scored)
                          .length,
                      ],
                      ["Status", active.complete ? "Complete" : "Active"],
                    ]}
                  />
                  <div className="gd-actions">
                    <button
                      className="gd-button"
                      onClick={() => {
                        setScreen("scores");
                        setScoreCourt("all");
                        setSessionNumber(4);
                        setRoundNumber(current.number);
                      }}
                    >
                      Review all scores
                    </button>
                    <button
                      className="gd-button"
                      onClick={() => setScreen("movement")}
                    >
                      Review movement
                    </button>
                    <button
                      className="gd-button gd-primary"
                      disabled={active.complete}
                      onClick={() => {
                        run(
                          () => finishDemo(state),
                          "80 games completed in the demo. Official results and final placements are ready.",
                        );
                        setSessionNumber(4);
                        setScreen("sessions");
                      }}
                    >
                      Simulate full session
                    </button>
                  </div>
                </section>
              )}
              {adminTab === "Payments" && (
                <section className="gd-card">
                  <h2>Payments and the spare queue</h2>
                  <p>
                    All 25 regular payments in this rehearsal are fictional. No
                    bank transfer is performed.
                  </p>
                  <Metrics
                    items={[
                      ["Regular fee", "$400"],
                      ["Spare session", "$20"],
                      ["Available tonight", 0],
                    ]}
                  />
                  <h3>Example spare queue · separate from the 25 players</h3>
                  <div className="gd-final-row">
                    <span>Jordan Ellis</span>
                    <span className="gd-up">
                      Responded + verified · waiting
                    </span>
                  </div>
                  <div className="gd-final-row">
                    <span>Riley Adams</span>
                    <span>Responded · payment unverified</span>
                  </div>
                  <p>
                    Only a response plus verified payment qualifies a spare, and
                    there must be a free place. A text saying “paid” cannot
                    confirm a booking.
                  </p>
                  <div className="gd-note">
                    At least 72 hours’ absence notice: $14. School cancellation:
                    two physical shuttlecocks under your stated policy. The
                    existing paid-spare cancellation exception must be resolved
                    before agreement publication.
                  </div>
                </section>
              )}
              {adminTab === "Tools" && (
                <>
                  <section className="gd-card">
                    <h2>What still needs to ship</h2>
                    <ul>
                      <li>
                        Connect the familiar gym, profiles and history views to
                        the hosted database.
                      </li>
                      <li>
                        Enable and verify participant scoring on the server.
                      </li>
                      <li>
                        Finish free-email reminders and unsubscribe delivery.
                      </li>
                      <li>
                        Publish the reviewed agreement and complete independent
                        member/guardian tests.
                      </li>
                      <li>
                        Restore an actual remote backup in isolation and finish
                        release configuration.
                      </li>
                    </ul>
                    <p>
                      This demo calculates results locally using the existing
                      rotation and movement functions, plus the database ELO
                      method. It does not prove the connected workflow is
                      complete.
                    </p>
                  </section>
                  <section className="gd-card">
                    <h2>Demo audit trail</h2>
                    <ol className="gd-audit">
                      {state.audit.map((entry, i) => (
                        <li key={`${i}-${entry}`}>{entry}</li>
                      ))}
                    </ol>
                    <button className="gd-button" onClick={reset}>
                      <RotateCcw size={16} /> Reset fictional league
                    </button>
                  </section>
                </>
              )}
            </>
          )}
          <footer className="gd-footer">
            Maplewood Advanced Badminton League · Christy
            <br />
            <span>
              Demo preview · {official.length} official fictional games · No
              live account changes
            </span>
          </footer>
        </main>
      </div>
      {playing && (
        <div className="gd-playing-bar">
          <span>
            Speaking · {step + 1}/{tour.length} · {tour[step].title}
          </span>
          <button onClick={stop} aria-label="Pause spoken tour">
            <Pause size={16} /> Pause
          </button>
        </div>
      )}
      <nav className="gd-bottom-nav" aria-label="League navigation">
        {nav
          .filter(([key]) => role === "admin" || key !== "admin")
          .map(([key, label, Icon]) => (
            <button
              key={key}
              aria-current={
                screen === key ||
                (key === "standings" &&
                  ["profile", "sessions"].includes(screen))
                  ? "page"
                  : undefined
              }
              onClick={() => {
                stop();
                setScreen(key);
                if (key === "courts" || key === "scores") {
                  setSessionNumber(4);
                  setRoundNumber(current.number);
                }
                setNotice("");
              }}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
      </nav>
    </div>
  );
}
