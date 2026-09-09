import { rankings, type Rules } from "../domain/courts";
import { nextRoundPlacement } from "../domain/placement";
import {
  courtMovements,
  movementText,
  roundStatus,
  type CourtMovement,
  type RoundGame,
} from "../domain/round-status";
import "./match-day-views.css";

export interface DayCourt {
  id: string;
  number: number;
  players: string[];
}
export interface DayGame extends RoundGame {
  number: number;
}
interface People {
  name: (id: string) => string;
  onPlayer: (id: string) => void;
  viewer: string;
}

/** The map shows the next unscored game's actual teams, including its rest slot. */
export function CourtBoard({
  courts,
  games,
  mode,
  selected,
  incoming = [],
  onCourt,
  name,
  onPlayer,
  viewer,
}: People & {
  courts: DayCourt[];
  games: DayGame[];
  mode: "gym" | "list";
  selected?: string;
  incoming?: CourtMovement[];
  onCourt: (id: string) => void;
}) {
  const order =
    mode === "gym" && courts.length === 6
      ? [0, 1, 2, 5, 4, 3]
      : courts.map((_, i) => i);
  const player = (id: string) => {
    const movement = incoming.find((m) => m.id === id);
    return (
      <div key={id} className={`md-player ${id === viewer ? "md-you" : ""}`}>
        <button
          title={name(id)}
          aria-label={name(id)}
          onClick={() => onPlayer(id)}
        >
          {name(id)}
          {id === viewer && <span className="md-sr"> · You</span>}
        </button>
        {movement && (
          <small
            className={`md-movement md-${movement.direction}`}
            title={movementText(movement)}
            aria-label={movementText(movement)}
          >
            {movement.direction === "up"
              ? "↑"
              : movement.direction === "down"
                ? "↓"
                : "·"}
          </small>
        )}
      </div>
    );
  };
  return (
    <>
      <div className="md-capacity" role="status">
        {courts.some((c) => c.players.length)
          ? `✓ ${courts.reduce((n, c) => n + c.players.length, 0)} players assigned · ${courts.filter((c) => c.players.length).length} courts`
          : "Waiting for court assignments"}
        {courts.some((c) => c.players.length > 4) && (
          <small>Five-player courts rotate one resting player each game.</small>
        )}
      </div>
      <div
        className={`md-board md-${mode}`}
        aria-label={mode === "gym" ? "Gym court map" : "Court list"}
      >
        {mode === "gym" && <div className="md-boundary">← Entrance side →</div>}
        <div className="md-court-grid">
          {order.map((i) => {
            const c = courts[i],
              schedule = games
                .filter((g) => g.court === i + 1)
                .sort((a, b) => a.number - b.number);
            const next = schedule.find(
                (g) => g.scoreA === null || g.scoreB === null,
              ),
              game = next ?? schedule.at(-1);
            const a = game?.a ?? c.players.slice(0, 2),
              b = game?.b ?? c.players.slice(2, 4);
            const rest = c.players.filter((id) => ![...a, ...b].includes(id));
            return (
              <section
                className={`md-court ${selected === c.id ? "md-selected" : ""}`}
                data-court={c.number}
                key={c.id}
              >
                <button
                  className="md-court-title"
                  onClick={() => onCourt(c.id)}
                  aria-label={`Open Court ${c.number}`}
                  aria-pressed={selected === c.id}
                >
                  <strong>C{c.number}</strong>
                  <span>
                    {c.players.length}/{Math.max(4, c.players.length)}
                  </span>
                </button>
                <div className="md-team">{a.map(player)}</div>
                <div className="md-net">
                  <span>Net</span>
                </div>
                <div className="md-team">{b.map(player)}</div>
                {rest.length > 0 && (
                  <div className="md-rest">
                    <span>Resting</span>
                    {rest.map(player)}
                  </div>
                )}
                <small className="md-game-caption">
                  {game
                    ? `Game ${game.number} · ${next ? "Next" : "Last played"}`
                    : "Not started"}
                </small>
              </section>
            );
          })}
        </div>
        {mode === "gym" && <div className="md-boundary">← Back wall →</div>}
      </div>
      <p className="md-hint">
        Tap a court for games and rest turns. Tap a player for their profile.
      </p>
    </>
  );
}

export function CourtRoster({
  courts,
  round,
  selected,
  onCourt,
  name,
}: {
  courts: DayCourt[];
  round: number;
  selected?: string;
  onCourt: (id: string) => void;
  name: (id: string) => string;
}) {
  return (
    <section className="md-panel" aria-label={`Round ${round} courts`}>
      <h2>🏸 Round {round} courts</h2>
      <div className="md-roster-grid">
        {courts.map((c) => (
          <button
            key={c.id}
            data-court={c.number}
            className="md-roster"
            aria-label={`Scores for Court ${c.number}`}
            aria-pressed={selected === c.id}
            onClick={() => onCourt(c.id)}
          >
            <strong>Court {c.number}</strong>
            {c.players.map((id) => (
              <span key={id}>{name(id)}</span>
            ))}
            {!c.players.length && <span>Unassigned</span>}
          </button>
        ))}
      </div>
    </section>
  );
}

export function RoundOverview({
  courts,
  games,
  round,
  rules,
  published,
  message,
  name,
  onPlayer,
  viewer,
}: People & {
  courts: DayCourt[];
  games: DayGame[];
  round: number;
  rules: Pick<Rules, "normalTarget" | "fiveTarget">;
  published: CourtMovement[];
  message?: string;
}) {
  const lineups = courts.map((c) => c.players),
    progress = roundStatus(lineups, games, rules);
  const proposed =
    !published.length && progress.state === "ready"
      ? courtMovements(
          lineups,
          nextRoundPlacement(
            lineups,
            games.map((m) => ({ game: m, a: m.scoreA!, b: m.scoreB! })),
            rules,
          ),
        ).map((m) => ({
          ...m,
          from: m.from === null ? null : courts[m.from - 1].number,
          to: m.to === null ? null : courts[m.to - 1].number,
        }))
      : [];
  const moves = published.length ? published : proposed;
  const complete = progress.courts.filter(
    (c) =>
      progress.state !== "invalid" &&
      c.expected > 0 &&
      c.completed === c.expected,
  );
  return (
    <section className="md-panel md-progress" aria-label="Round progress">
      <h2>📊 Round {round} progress</h2>
      <progress
        aria-label={`Round ${round} games complete`}
        max={Math.max(1, progress.expected)}
        value={progress.state === "invalid" ? 0 : progress.completed}
      />
      <p className="md-hint">
        {progress.completed} / {progress.expected} games complete
      </p>
      <div className="md-progress-grid">
        {progress.courts.map((c, i) => {
          const done = complete.some((p) => p.court === c.court);
          return (
            <div
              className={`md-progress-cell ${done ? "md-done" : ""}`}
              key={courts[i].id}
            >
              <strong>
                C{courts[i].number} {done ? "✓" : c.expected ? "⌛" : "—"}
              </strong>
              <small>
                {c.completed}/{c.expected} games
              </small>
              {moves
                .filter(
                  (m) =>
                    m.from === courts[i].number &&
                    ["up", "down"].includes(m.direction),
                )
                .map((m) => (
                  <span
                    key={m.id}
                    className={`md-${m.direction}`}
                    title={`${name(m.id)}: ${movementText(m)}`}
                  >
                    {m.direction === "up" ? "↑" : "↓"} {name(m.id)}
                  </span>
                ))}
            </div>
          );
        })}
      </div>
      <p className="md-progress-note">
        {progress.state === "invalid"
          ? `Administrator review needed: ${progress.error}`
          : published.length
            ? "Published movements · Court arrows show saved assignments."
            : progress.state === "ready"
              ? "Proposed movements · All courts finished. Stay on your court until Christy publishes."
              : message ||
                "Finish every scheduled game. All courts move together after Christy reviews and publishes."}
      </p>
      {complete.length > 0 && (
        <div className="md-round-standings">
          <h3>Round {round} standings</h3>
          {complete.map((c) => (
            <section
              className="md-standing-court"
              data-court={courts[c.court - 1].number}
              key={c.court}
            >
              <h4>Court {courts[c.court - 1].number} ✓</h4>
              {rankings(
                lineups[c.court - 1],
                games
                  .filter((g) => g.court === c.court)
                  .map((g) => ({ game: g, a: g.scoreA!, b: g.scoreB! })),
              ).map((p, i) => {
                const m = moves.find((move) => move.id === p.id);
                return (
                  <div
                    className={`md-standing-row ${m ? `md-row-${m.direction}` : ""}`}
                    key={p.id}
                  >
                    <span>{i + 1}.</span>
                    <button onClick={() => onPlayer(p.id)}>
                      {name(p.id)}
                      {p.id === viewer && " · You"}
                    </button>
                    {m && (
                      <small
                        className={`md-${m.direction}`}
                        title={movementText(m)}
                      >
                        {m.direction === "up"
                          ? "↑"
                          : m.direction === "down"
                            ? "↓"
                            : "="}{" "}
                        C{m.to ?? "—"}
                        <span className="md-sr">
                          {" "}
                          {published.length ? "Published" : "Proposed"}
                        </span>
                      </small>
                    )}
                    <strong>{p.wins}W</strong>
                    <span>{p.points} pts</span>
                  </div>
                );
              })}
            </section>
          ))}
          <p className="md-hint">
            Order: win percentage, then point percentage, then a stable
            tie-break. ELO is separate.
          </p>
        </div>
      )}
    </section>
  );
}
