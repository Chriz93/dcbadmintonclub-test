import { useState } from "react";
import "./score-corrections.css";

export interface ScoreCorrection {
  id: string;
  title: string;
  requestedBy: string;
  proposed: string;
  current: string;
  message: string;
  status: string;
  resolution: string | null;
}
function Review({
  review,
  admin,
  disabled,
  onResolve,
}: {
  review: ScoreCorrection;
  admin: boolean;
  disabled: boolean;
  onResolve: (id: string, accept: boolean, reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <article className="score-correction" aria-label={review.title}>
      <h3>{review.title}</h3>
      <p>
        <strong>
          {review.status === "open"
            ? "Awaiting Christy’s review"
            : review.status === "accepted"
              ? "Accepted · score corrected"
              : "Declined"}
        </strong>
      </p>
      <p>
        Current score: {review.current} → Requested:{" "}
        <strong>{review.proposed}</strong>
      </p>
      {admin && <p>Requested by {review.requestedBy}</p>}
      <p>{review.message}</p>
      {review.resolution && <p>Christy: {review.resolution}</p>}
      {admin && review.status === "open" && (
        <form onSubmit={(event) => event.preventDefault()}>
          <label>
            Review decision
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={5}
              maxLength={500}
              disabled={busy || disabled}
            />
          </label>
          <div className="score-correction-actions">
            {[true, false].map((accept) => (
              <button
                type="button"
                className="button"
                key={String(accept)}
                disabled={busy || disabled || reason.trim().length < 5}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await onResolve(review.id, accept, reason.trim());
                    setReason("");
                  } catch (error) {
                    setError((error as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? "Saving decision…"
                  : accept
                    ? "Accept & correct score"
                    : "Decline request"}
              </button>
            ))}
          </div>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
export function ScoreCorrectionQueue({
  reviews,
  admin,
  disabled = false,
  onResolve,
}: {
  reviews: ScoreCorrection[];
  admin: boolean;
  disabled?: boolean;
  onResolve: (id: string, accept: boolean, reason: string) => Promise<void>;
}) {
  return (
    <section
      className="score-correction-queue"
      aria-label="Correction requests"
      id="correction-requests"
    >
      <h2>
        Correction requests ({reviews.filter((r) => r.status === "open").length}{" "}
        pending)
      </h2>
      <p>
        {admin
          ? "Review the match, requested score and explanation before accepting. Accepting updates results and ELO; played court assignments stay recorded."
          : "To change a saved score, open a game you played and choose Request a correction. Your request stays private to you and Christy."}
      </p>
      {!reviews.length && <p>No correction requests yet.</p>}
      {reviews.map((r) => (
        <Review
          key={r.id}
          review={r}
          admin={admin}
          disabled={disabled}
          onResolve={onResolve}
        />
      ))}
    </section>
  );
}
