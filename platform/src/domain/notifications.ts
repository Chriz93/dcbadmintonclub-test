export interface Delivery {
  id: string;
  idempotencyKey: string;
  attempts: number;
  template: string;
  payload: Record<string, string>;
}
export interface Provider {
  send: (delivery: Delivery) => Promise<{ messageId: string }>;
}
export function retryDelay(attempt: number) {
  if (!Number.isInteger(attempt) || attempt < 1)
    throw new Error("Invalid attempt");
  return Math.min(86400, 30 * 2 ** (attempt - 1));
}
export async function deliver(
  job: Delivery,
  provider: Provider,
  consent: boolean,
) {
  if (!consent) return { status: "suppressed" as const };
  try {
    const sent = await provider.send(job);
    if (!sent.messageId) throw new Error("Missing receipt");
    return { status: "delivered" as const, providerMessageId: sent.messageId };
  } catch {
    return {
      status: job.attempts >= 8 ? ("failed" as const) : ("pending" as const),
      retryAfter: retryDelay(job.attempts),
      failureReason: "Provider delivery failed",
    };
  }
}
// Provider must honour idempotencyKey. Exactly-once external mail is otherwise impossible
// across a worker crash after send but before persisting the receipt.
