import {
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  CalendarDays,
  House,
  LayoutGrid,
  Moon,
  Pencil,
  Settings,
  Sun,
  Trophy,
  UserRound,
} from "lucide-react";
import { z } from "zod";
import { supabase, requestCode, verifyCode } from "../services/auth";
import { MemberDashboard } from "./MemberDashboard";
import { RegistrationFlow } from "./RegistrationFlow";
import { LeagueExperience, type LeaguePage } from "../league/LeagueExperience";
import { Card } from "./ui";

const membership = z.object({
  club_id: z.string(),
  role: z.string(),
  status: z.string(),
});
const tabs = [
  ["home", "Home", House],
  ["courts", "Courts", LayoutGrid],
  ["scores", "Scores", Pencil],
  ["standings", "Standings", Trophy],
  ["schedule", "Schedule", CalendarDays],
  ["account", "My account", UserRound],
] as const;
type Route =
  (typeof tabs)[number][0] | "registration" | "admin" | "matchday" | "help";

/** Navigation is only a convenience; every read and write still uses Supabase RLS. */
export function LeagueApp({
  online,
  dark,
  onTheme,
  schedule,
  courts,
  admin,
}: {
  online: boolean;
  dark: boolean;
  onTheme: () => void;
  schedule: ReactNode;
  courts: ReactNode;
  admin: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let alive = true;
    // Subscribe before reading so a sign-out cannot leave a stale account on screen.
    const { data } = supabase!.auth.onAuthStateChange((_event, next) => {
      if (alive) {
        setSession(next);
        setChecking(false);
      }
    });
    void supabase!.auth.getSession().then(({ data }) => {
      if (alive) {
        setSession(data.session);
        setChecking(false);
      }
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return (
    <div className="league-app">
      <a className="skip" href="#main">
        Skip to main content
      </a>
      <header className="league-header">
        <div className="brand">
          <span className="brand-mark">
            ML<span>↗</span>
          </span>
          <span>
            Maplewood League<small>ADVANCED BADMINTON · 2026–27</small>
          </span>
        </div>
        <button
          className="theme-toggle"
          onClick={onTheme}
          aria-label={dark ? "Light appearance" : "Dark appearance"}
        >
          {dark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>
      <div
        className="league-environment"
        role="region"
        aria-label="Test environment status"
      >
        <span>TEST SITE</span>
        <span>
          {online
            ? "Maplewood Secondary School · Tuesdays"
            : "Offline · Changes unavailable"}
        </span>
      </div>
      {checking ? (
        <main id="main">
          <p role="status">Checking your sign-in…</p>
        </main>
      ) : session ? (
        <SignedInLeague
          key={session.user.id}
          email={session.user.email ?? ""}
          userId={session.user.id}
          schedule={schedule}
          courts={courts}
          admin={admin}
        />
      ) : (
        <main id="main" className="sign-in-main">
          <SignIn online={online} />
        </main>
      )}
      <footer className="league-footer">
        Maplewood Advanced Badminton League · Christy
      </footer>
    </div>
  );
}

function SignIn({ online }: { online: boolean }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <Card className="sign-in-card">
      <p className="eyebrow">YOUR TUESDAY NIGHT LEAGUE</p>
      <h1>Welcome to Maplewood.</h1>
      <p>
        Sign in first. Then complete your registration, sign the season
        agreement, or check your next game.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setMessage("");
          try {
            if (sentTo) await verifyCode(sentTo, code.trim());
            else {
              const address = email.trim();
              await requestCode(address);
              setSentTo(address);
              setMessage("Check your inbox for a one-time code.");
            }
          } catch (error) {
            setMessage((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {sentTo ? (
          <>
            <p>
              Code sent to <strong>{sentTo}</strong>.
            </p>
            <label>
              One-time code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoComplete="one-time-code"
                inputMode="numeric"
                disabled={busy}
              />
            </label>
          </>
        ) : (
          <label>
            Email address
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        <button className="button primary" disabled={busy || !online}>
          {busy ? "Please wait…" : sentTo ? "Verify code" : "Send sign-in code"}
        </button>
        {sentTo && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setSentTo("");
              setCode("");
              setMessage("");
            }}
          >
            Change email or request a new code
          </button>
        )}
      </form>
      <p role="status">{message}</p>
      <div className="sign-in-note">
        <strong>New player, returning player, or guardian?</strong>
        <p>
          Use your own email. Guardians sign in separately to sign for a child.
          New players complete a registration request after signing in. Christy
          reviews and approves every player before their place is confirmed.
        </p>
      </div>
    </Card>
  );
}

function SignedInLeague({
  email,
  userId,
  schedule,
  courts,
  admin,
}: {
  email: string;
  userId: string;
  schedule: ReactNode;
  courts: ReactNode;
  admin: ReactNode;
}) {
  const [route, setRoute] = useState<Route>("home");
  const leaveGuard = useRef<() => boolean>(() => true);
  const registerLeaveGuard = useCallback((guard: () => boolean) => {
    leaveGuard.current = guard;
  }, []);
  const [memberships, setMemberships] = useState<z.infer<typeof membership>[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void supabase!
      .from("memberships")
      .select("club_id,role,status")
      .eq("user_id", userId)
      .then(({ data, error }) => {
        if (!alive) return;
        try {
          if (error) throw error;
          setMemberships(z.array(membership).parse(data));
          setError("");
        } catch {
          setMemberships([]);
          setError("Your membership could not be loaded. Please retry.");
        }
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId, refreshKey]);
  const active = memberships.some((m) => m.status === "active");
  const isAdmin = memberships.some(
    (m) =>
      m.status === "active" && ["club_owner", "club_admin"].includes(m.role),
  );
  // Re-evaluate on each render: losing a role closes an already-open protected screen.
  const current =
    ["admin", "matchday"].includes(route) && !isAdmin
      ? "home"
      : ["courts", "scores", "standings", "schedule", "help"].includes(route) &&
          !active
        ? "home"
        : route;
  const go = (next: Route) => {
    if (!leaveGuard.current()) return;
    setRoute(next);
    window.scrollTo({ top: 0 });
    document.getElementById("main")?.focus();
  };
  return (
    <>
      <div className="account-bar" role="region" aria-label="Signed-in account">
        <span className="signed-in-email">{email}</span>
        {isAdmin && (
          <button
            className={`button ${current === "admin" ? "primary" : ""}`}
            onClick={() => go("admin")}
          >
            <Settings size={17} /> Administration
          </button>
        )}
        <button
          className="text-button"
          disabled={signingOut}
          onClick={async () => {
            if (!leaveGuard.current()) return;
            setSigningOut(true);
            const { error } = await supabase!.auth.signOut({ scope: "local" });
            if (error) {
              setError("Sign-out could not be confirmed. Please retry.");
              setSigningOut(false);
            }
          }}
        >
          Sign out
        </button>
      </div>
      {!loading && (
        <nav className="league-nav" aria-label="Main navigation">
          {tabs
            .filter(([key]) => active || key === "home" || key === "account")
            .map(([key, title, Icon]) => (
              <button
                key={key}
                aria-current={current === key ? "page" : undefined}
                onClick={() => go(key)}
              >
                <Icon size={21} />
                <span>{title}</span>
              </button>
            ))}
        </nav>
      )}
      <main
        id="main"
        tabIndex={-1}
        className={
          ["admin", "matchday", "courts", "scores", "standings"].includes(
            current,
          )
            ? "league-wide"
            : "league-main"
        }
      >
        {error && (
          <div role="alert">
            <p>{error}</p>
            <button
              className="button"
              onClick={() => setRefreshKey((k) => k + 1)}
            >
              Retry membership
            </button>
          </div>
        )}
        {loading ? (
          <p role="status">Loading your league…</p>
        ) : (
          !error && (
            <>
              {active &&
                [
                  "home",
                  "courts",
                  "scores",
                  "standings",
                  "help",
                  "schedule",
                ].includes(current) && (
                  <LeagueExperience
                    page={current as LeaguePage}
                    userId={userId}
                    onNavigate={go}
                    onAdmin={() => go("matchday")}
                    registerLeaveGuard={registerLeaveGuard}
                  />
                )}
              {current === "home" &&
                (active ? (
                  <MemberDashboard key={refreshKey} view="home" />
                ) : (
                  <RegistrationFlow
                    onRefresh={() => setRefreshKey((k) => k + 1)}
                  />
                ))}
              {current === "registration" && (
                <RegistrationFlow
                  onRefresh={() => setRefreshKey((k) => k + 1)}
                />
              )}
              {current === "account" && (
                <>
                  <h1>My account</h1>
                  <Card className="registration-shortcut">
                    <h2>Registration and season agreement</h2>
                    <p>
                      Complete your details, review your registration, or sign
                      as a guardian. Each season has its own agreement.
                    </p>
                    <button
                      className="button primary"
                      onClick={() => go("registration")}
                    >
                      Open registration
                    </button>
                  </Card>
                  {active && (
                    <button className="button" onClick={() => go("help")}>
                      League questions & answers
                    </button>
                  )}
                  <MemberDashboard view="account" />
                </>
              )}
              {current === "matchday" && (
                <>
                  <h1>Run match day</h1>
                  <p>
                    Check in players, review assignments, record games, then
                    publish movements or close the session.
                  </p>
                  {courts}
                </>
              )}
              {current === "schedule" && !active && schedule}
              {current === "admin" && (
                <>
                  <div className="admin-shortcut">
                    <button
                      className="button primary"
                      onClick={() => go("matchday")}
                    >
                      Open match-day controls
                    </button>
                    <p>
                      Check-in → assign courts → record scores → review
                      movements → complete session. Corrections remain available
                      with an audit reason.
                    </p>
                  </div>
                  {admin}
                </>
              )}
            </>
          )
        )}
      </main>
    </>
  );
}
