import { useEffect, useState } from "react";
import { PermitCommit } from "./components/PermitCommit";
import type { PermitText } from "./services/pdf";
import { PermitUpload } from "./components/PermitUpload";
import { AdminTools } from "./components/AdminTools";
import { MemberDashboard } from "./components/MemberDashboard";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Download,
  House,
  LayoutGrid,
  MapPin,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  Activity,
} from "lucide-react";
import { Card, Badge, Heading } from "./components/ui";
import {
  allocate,
  rotation,
  rankings,
  validateScore,
  type Result,
} from "./domain/courts";
import {
  season,
  calendar,
  googleCalendar,
  parseScheduleText,
  validateSchedule,
  venue,
  type Session,
} from "./domain/schedule";
import { requestCode, verifyCode, supabase } from "./services/auth";
const players = Array.from(
  { length: 25 },
  (_, i) => `Player ${String(i + 1).padStart(2, "0")}`,
);
const links = [
  ["home", "Club home", House],
  ["schedule", "Season schedule", CalendarDays],
  ["courts", "Courtside", LayoutGrid],
  ["member", "Member hub", Users],
  ["admin", "Administration", Settings],
] as const;
type Route = (typeof links)[number][0];
function download(rows: Session[]) {
  const url = URL.createObjectURL(
    new Blob([calendar(rows)], { type: "text/calendar;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "badminton-2026-27.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function App() {
  const [route, setRoute] = useState<Route>("home"),
    [dark, setDark] = useState(
      () => localStorage.getItem("clubcourt-test-theme") === "dark",
    ),
    [online, setOnline] = useState(navigator.onLine),
    [message, setMessage] = useState("");
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("clubcourt-test-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  const next = season.find(
    (s) =>
      s.status === "active" && s.date >= new Date().toISOString().slice(0, 10),
  );
  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to main content
      </a>
      <aside className="sidebar">
        <a className="brand" href="#home" onClick={() => setRoute("home")}>
          <span className="brand-mark">
            DC<span>↗</span>
          </span>
          <span>
            DC Badminton<small>STITTSVILLE · TUESDAY NIGHTS</small>
          </span>
        </a>
        <div className="season-label">2026 / 2027 SEASON</div>
        <nav aria-label="Main navigation">
          {links.map(([key, label, Icon]) => (
            <button
              key={key}
              aria-current={route === key ? "page" : undefined}
              className={route === key ? "nav active" : "nav"}
              onClick={() => {
                setRoute(key);
                setMessage("");
              }}
            >
              <Icon size={20} />
              {label}
              {route === key && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="club-note">
            <span className="tiny-court" aria-hidden="true" />
            <strong>
              A good game.
              <br />A great community.
            </strong>
            <p>Tuesday nights at Maplewood.</p>
          </div>
          <button className="theme-toggle" onClick={() => setDark(!dark)}>
            {dark ? <Sun size={18} /> : <Moon size={18} />}{" "}
            {dark ? "Light appearance" : "Dark appearance"}
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            The club <ChevronRight size={14} />{" "}
            {links.find((l) => l[0] === route)?.[1]}
          </span>
          <Badge tone="test">ISOLATED TEST</Badge>
        </header>
        <div className="preview-banner">
          <ShieldCheck size={17} />
          <span>
            Local preview · Synthetic players ·{" "}
            {supabase
              ? "Test authentication configured"
              : "No database connected"}
          </span>
          <span className="online">
            {online ? "Online" : "Offline · Read only"}
          </span>
        </div>
        <main id="main" tabIndex={-1}>
          {route === "home" && (
            <>
              <Heading
                eyebrow="A NEW SEASON. MORE GOOD GAMES."
                title="See you on court."
              >
                <span className="season-pill">SEP 2026 — MAY 2027</span>
              </Heading>
              <div className="home-grid">
                <Card className="next-session">
                  <div className="card-top">
                    <Badge tone="lime">NEXT CLUB NIGHT</Badge>
                    <span>01 / 28</span>
                  </div>
                  <h2>
                    {next
                      ? new Date(next.date + "T12:00:00").toLocaleDateString(
                          "en-CA",
                          { weekday: "long", month: "long", day: "numeric" },
                        )
                      : "Season complete"}
                  </h2>
                  <p className="session-time">
                    <Clock size={20} /> 8:15 PM – 10:15 PM <span>ET</span>
                  </p>
                  <div
                    className="hero-court"
                    aria-label="Six badminton courts at Maplewood"
                  >
                    <div className="court-net" />
                    <span>LET’S PLAY</span>
                    <b>↗</b>
                  </div>
                  <div className="session-footer">
                    <span>
                      <MapPin size={18} /> Maplewood Secondary School
                    </span>
                    <button
                      className="button lime"
                      onClick={() => setRoute("member")}
                    >
                      Your RSVP <ArrowUpRight size={18} />
                    </button>
                  </div>
                </Card>
                <Card className="season-overview">
                  <p className="eyebrow">ROOM TO PLAY</p>
                  <h2>
                    One club.
                    <br />
                    All levels welcome.
                  </h2>
                  <div className="stat-grid">
                    <div>
                      <strong>28</strong>
                      <span>club nights</span>
                    </div>
                    <div>
                      <strong>6</strong>
                      <span>courts</span>
                    </div>
                    <div>
                      <strong>25</strong>
                      <span>regular places</span>
                    </div>
                    <div>
                      <strong>56</strong>
                      <span>hours of play</span>
                    </div>
                  </div>
                  <p>
                    Friendly competition, rotating partners and a place to make
                    Tuesday your favourite night.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setRoute("schedule")}
                  >
                    Explore the season <ChevronRight size={18} />
                  </button>
                </Card>
              </div>
              <div className="section-heading">
                <h2>Your Tuesday, sorted.</h2>
                <span>The essentials before you arrive</span>
              </div>
              <div className="three-grid">
                <Card>
                  <span className="icon-tile">
                    <MapPin />
                  </span>
                  <h3>Meet at Maplewood</h3>
                  <p>
                    700 Cope Drive, Stittsville, Ontario.
                    <br />
                    Gym rooms 127C &amp; 127D.
                  </p>
                  <span className="quiet">
                    Arrive ready for an 8:15 PM start.
                  </span>
                </Card>
                <Card>
                  <span className="icon-tile">
                    <Activity />
                  </span>
                  <h3>A fair turn for everyone</h3>
                  <p>
                    Four players per court. When all 25 attend, Court 6 rotates
                    five players in games to 15.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setRoute("courts")}
                  >
                    See the rotation <ChevronRight size={18} />
                  </button>
                </Card>
                <Card>
                  <span className="icon-tile">
                    <CalendarDays />
                  </span>
                  <h3>Keep Tuesdays clear</h3>
                  <p>
                    All 28 approved sessions, with cancelled dates clearly
                    marked.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => download(season)}
                  >
                    Download season calendar <Download size={17} />
                  </button>
                </Card>
              </div>
              <Card className="rules">
                <div>
                  <p className="eyebrow">CLUB ETIQUETTE</p>
                  <h2>Good games start with respect.</h2>
                </div>
                <p>
                  Bring indoor non-marking shoes. Warm up safely, call your own
                  lines fairly, and welcome every partner. Final season fees,
                  contact details and waiver text await administrator
                  confirmation.
                </p>
              </Card>
            </>
          )}
          {route === "schedule" && <Schedule />}
          {route === "courts" && <Courts online={online} />}
          {route === "member" && (
            <Member online={online} message={message} setMessage={setMessage} />
          )}
          {route === "admin" && <Admin />}
        </main>
        <footer>
          DC Badminton Club{" "}
          <span>
            Made for the love of the game. <span aria-hidden="true">↗</span>
          </span>
        </footer>
      </div>
    </div>
  );
}
function Schedule() {
  const [filter, setFilter] = useState("all");
  const rows = season.filter((s) => filter === "all" || s.status === filter);
  return (
    <>
      <Heading
        eyebrow="MAPLEWOOD · AMERICA/TORONTO"
        title="Your season, planned."
      >
        <button className="button primary" onClick={() => download(season)}>
          <Download size={18} /> Download ICS
        </button>
      </Heading>
      <div className="summary-strip">
        <strong>28 club nights</strong>
        <span>56 approved hours</span>
        <span>Tuesdays · 8:15–10:15 PM</span>
        <span>Permit #2026-07-21-0001</span>
      </div>
      <div className="filter-row">
        <label>
          Show{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All dates</option>
            <option value="active">Approved sessions</option>
            <option value="cancelled">Cancelled dates</option>
          </select>
        </label>
        <p>
          ICS imports into Apple Calendar. Live subscription requires a deployed
          feed.
        </p>
      </div>
      <Card className="schedule-list">
        {rows.map((s) => (
          <div className={`schedule-row ${s.status}`} key={s.date}>
            <div className="date-tile">
              <strong>{s.date.slice(8)}</strong>
              <span>
                {new Date(s.date + "T12:00:00").toLocaleDateString("en", {
                  month: "short",
                })}
              </span>
            </div>
            <div className="schedule-detail">
              <h3>
                {new Date(s.date + "T12:00:00").toLocaleDateString("en-CA", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </h3>
              <p>
                {s.status === "active"
                  ? "8:15–10:15 PM · Rooms 127C & 127D"
                  : "No play · Permit cancellation"}
              </p>
            </div>
            <Badge tone={s.status === "active" ? "green" : "muted"}>
              {s.status === "active" ? "Approved" : "Cancelled"}
            </Badge>
            {s.status === "active" && (
              <a
                className="calendar-link"
                href={googleCalendar(s)}
                target="_blank"
                rel="noreferrer"
              >
                Google Calendar <ArrowUpRight size={15} />
              </a>
            )}
          </div>
        ))}
      </Card>
    </>
  );
}
function Courts({ online }: { online: boolean }) {
  const [count, setCount] = useState(25),
    [courtCount, setCourtCount] = useState(6),
    [selected, setSelected] = useState(5),
    [step, setStep] = useState(0),
    [results, setResults] = useState<Record<string, Result>>({}),
    [error, setError] = useState("");
  const assigned = allocate(players.slice(0, count), courtCount),
    ids = assigned[Math.min(selected, courtCount - 1)] ?? [],
    games = ids.length >= 2 ? rotation(ids) : [],
    game = games[step % Math.max(1, games.length)];
  function reset() {
    setResults({});
    setStep(0);
    setError("");
  }
  return (
    <>
      <Heading eyebrow="COURTSIDE · SYNTHETIC SESSION" title="Find your court.">
        <Badge tone="green">Practice mode</Badge>
      </Heading>
      <div className="filter-row">
        <label>
          Players attending{" "}
          <input
            aria-label="Players attending"
            type="number"
            min={2}
            max={Math.min(25, courtCount * 5)}
            value={count}
            onChange={(e) => {
              setCount(
                Math.max(
                  2,
                  Math.min(25, courtCount * 5, Number(e.target.value)),
                ),
              );
              reset();
            }}
          />
        </label>
        <label>
          Courts{" "}
          <select
            value={courtCount}
            onChange={(e) => {
              const n = Number(e.target.value);
              setCourtCount(n);
              setCount(Math.min(count, n * 5));
              setSelected(Math.min(selected, n - 1));
              reset();
            }}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <p>Scores stay in memory and reset when you leave.</p>
      </div>
      <div className="court-grid">
        {assigned.map((group, i) => (
          <button
            key={i}
            className={`court-card ${selected === i ? "selected" : ""}`}
            onClick={() => {
              setSelected(i);
              setStep(0);
              setError("");
            }}
            aria-pressed={selected === i}
          >
            <span className="card-top">
              <strong>Court {i + 1}</strong>
              <Badge tone={group.length === 5 ? "lime" : "muted"}>
                {group.length} players
              </Badge>
            </span>
            <span className="mini-court">
              <span>{group.slice(0, 2).join(" · ") || "Open court"}</span>
              <span>{group.slice(2).join(" · ") || " "}</span>
            </span>
            <span className="court-caption">
              {group.length === 5
                ? "Five-player rotation · First to 15"
                : group.length < 2
                  ? "Waiting for players"
                  : "First to 21"}
              <ChevronRight size={16} />
            </span>
          </button>
        ))}
      </div>
      {game && (
        <Card className="rotation">
          <div className="section-heading">
            <h2>
              Court {selected + 1} · Game {step + 1} of {games.length}
            </h2>
            <Badge tone="green">First to {game.target}</Badge>
          </div>
          <div className="match-teams">
            <div>
              <p>TEAM A</p>
              <h3>{game.a.join(" & ")}</h3>
            </div>
            <span>vs</span>
            <div>
              <p>TEAM B</p>
              <h3>{game.b.join(" & ")}</h3>
            </div>
          </div>
          <p className="rest">
            {game.rest.length
              ? `Resting this game: ${game.rest.join(", ")}. Next rest: ${games[(step + 1) % games.length].rest.join(", ")}.`
              : "Everyone plays this game."}
          </p>
          <form
            className="score-form"
            key={`${selected}-${step}`}
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const data = new FormData(e.currentTarget);
                const a = Number(data.get("a")),
                  b = Number(data.get("b"));
                validateScore(a, b, game.target);
                setResults({
                  ...results,
                  [`${selected}/${step}`]: { game, a, b },
                });
                setError("Practice score saved.");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <label>
              Team A score
              <input
                name="a"
                type="number"
                min="0"
                max={game.target}
                required
                inputMode="numeric"
              />
            </label>
            <label>
              Team B score
              <input
                name="b"
                type="number"
                min="0"
                max={game.target}
                required
                inputMode="numeric"
              />
            </label>
            <button className="button primary" disabled={!online}>
              Save practice score
            </button>
          </form>
          <p role="status">{error}</p>
          <div className="rotation-nav">
            <button
              className="button"
              disabled={step === 0}
              onClick={() => {
                setStep(step - 1);
                setError("");
              }}
            >
              Previous game
            </button>
            <button
              className="button"
              disabled={step === games.length - 1}
              onClick={() => {
                setStep(step + 1);
                setError("");
              }}
            >
              Next game <ChevronRight size={17} />
            </button>
          </div>
          <details>
            <summary>Standings and movement rules</summary>
            <p>
              Compare win percentage, then points earned / possible points.
              Complete every scheduled game before movement; tied movement
              positions require a recorded administrator decision. Swap the
              bottom player with the adjacent court’s top player, preserving all
              court sizes. This preview does not persist movements.
            </p>
            {rankings(
              ids,
              Object.entries(results)
                .filter(([key]) => key.startsWith(`${selected}/`))
                .map(([, r]) => r),
            ).map((p) => (
              <p key={p.id}>
                {p.id} · {p.played} games · {Math.round(p.winRate * 100)}% wins
              </p>
            ))}
          </details>
        </Card>
      )}
    </>
  );
}
function Member({
  online,
  message,
  setMessage,
}: {
  online: boolean;
  message: string;
  setMessage: (s: string) => void;
}) {
  const [email, setEmail] = useState(""),
    [requested, setRequested] = useState(false),
    [signedIn, setSignedIn] = useState(false);
  return (
    <>
      <Heading eyebrow="YOUR CLUB, IN ONE PLACE" title="Member hub." />
      <div className="two-grid">
        <Card>
          <span className="icon-tile">
            <ShieldCheck />
          </span>
          <h2>Sign in securely</h2>
          <p>
            Use the email associated with your approved membership. We’ll send
            you a one-time code.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                if (requested) {
                  await verifyCode(
                    email,
                    String(new FormData(e.currentTarget).get("code")),
                  );
                  setSignedIn(true);
                  setMessage("Signed in to the isolated test project.");
                } else {
                  await requestCode(email);
                  setRequested(true);
                  setMessage(
                    "If your account is eligible, a code is on its way.",
                  );
                }
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            {requested && (
              <label>
                One-time code
                <input
                  name="code"
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                />
              </label>
            )}
            <button className="button primary" disabled={!online}>
              {requested ? "Verify code" : "Send sign-in code"}{" "}
              <ArrowUpRight size={17} />
            </button>
          </form>
          <p role="status">{message}</p>
          {signedIn && <MemberDashboard />}
        </Card>
        <Card>
          <p className="eyebrow">YOUR PRIVACY MATTERS</p>
          <h2>
            A place for your game.
            <br />
            Your information stays yours.
          </h2>
          <ul className="benefits">
            <li>
              <Check /> Personal RSVP and court assignment
            </li>
            <li>
              <Check /> Notification preferences you control
            </li>
            <li>
              <Check /> Private contact and waiver records
            </li>
          </ul>
          <p>
            The local preview contains no real member profiles. Connected
            membership workflows require the reviewed database migration and
            test accounts.
          </p>
        </Card>
      </div>
    </>
  );
}
function Admin() {
  const [source, setSource] = useState<PermitText | null>(null);
  const [text, setText] = useState(
      season.map((s) => `${s.date} ${s.start} ${s.end} ${s.status}`).join("\n"),
    ),
    [report, setReport] = useState<ReturnType<typeof validateSchedule> | null>(
      null,
    ),
    [error, setError] = useState("");
  return (
    <>
      <Heading
        eyebrow="SEASON PREPARATION"
        title="Build a better club night."
      />
      <Card>
        <Badge tone="test">LOCAL IMPORT PREVIEW</Badge>
        <h2>Review permit dates</h2>
        <p>
          Permit #2026-07-21-0001 · {venue} · Rooms 127C &amp; 127D. The
          supplied dates are transcribed from your request; the original PDF has
          not been provided. Nothing is written to a database here.
        </p>
        <PermitUpload
          onSource={setSource}
          onProposed={(value) => {
            setText(value);
            setReport(null);
          }}
        />
        <label>
          Bookings: YYYY-MM-DD HH:MM HH:MM active or cancelled
          <textarea
            rows={10}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setReport(null);
            }}
          />
        </label>
        <button
          className="button primary"
          onClick={() => {
            try {
              const result = validateSchedule(
                parseScheduleText(
                  text,
                  "2026-07-21-0001",
                  venue,
                  "127C & 127D",
                ),
              );
              setReport(result);
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Validate preview
        </button>
        <div role="status">
          {error}
          {report && (
            <>
              <h3>
                {report.active} active sessions · {report.hours} hours
              </h3>
              <p>
                {report.sessions.length} unique dates.{" "}
                {report.errors.length
                  ? report.errors.join(" · ")
                  : "No conflicting duplicates or invalid local times."}
              </p>
              <p>
                {report.active === 28 && report.hours === 56
                  ? "Matches the supplied permit totals."
                  : "Totals differ from the supplied 28 sessions / 56 hours. Review before import."}
              </p>
            </>
          )}
        </div>
      </Card>
      {report && report.errors.length === 0 && (
        <Card>
          <PermitCommit
            key={JSON.stringify(report.sessions)}
            rows={report.sessions}
            source={source}
            active={report.active}
            hours={report.hours}
          />
        </Card>
      )}
      <AdminTools />
      <div className="three-grid admin-notes">
        <Card>
          <h3>Member administration</h3>
          <p>
            Approval, payment and private exports require a verified club
            administrator with a second authentication factor.
          </p>
        </Card>
        <Card>
          <h3>Notification delivery</h3>
          <p>
            RSVP writes and queued email are separate. Provider delivery is
            disabled until test configuration and consent are verified.
          </p>
        </Card>
        <Card>
          <h3>Release readiness</h3>
          <p>
            Database policy tests, remote backup restoration and end-to-end
            acceptance must pass before launch.
          </p>
        </Card>
      </div>
    </>
  );
}
