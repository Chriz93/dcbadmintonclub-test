/** Server-only, deliberately not imported by browser code. Run only with a sandbox mail
 * provider until real recipients and delivery are explicitly authorized. */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
const env = z
  .object({
    TEST_SUPABASE_URL: z.url(),
    TEST_PROJECT_REF: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    MAIL_API_KEY: z.string().min(1),
    MAIL_FROM: z.email(),
    APP_URL: z.url(),
    DELIVERY_MODE: z.literal("provider-sandbox"),
  })
  .parse(process.env);
const url = new URL(env.TEST_SUPABASE_URL);
if (
  url.protocol !== "https:" ||
  url.hostname !== `${env.TEST_PROJECT_REF}.supabase.co` ||
  env.TEST_PROJECT_REF === "bwepvxelvwgwxrnaglrx"
)
  throw new Error("Unapproved database");
const db = createClient(env.TEST_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "club_app" },
  auth: { persistSession: false },
});
const { data: jobs, error } = await db.rpc("claim_deliveries", {
  batch_size: 10,
});
if (error) throw error;
for (const job of jobs ?? []) {
  const { data, error: recipientError } = await db.rpc("delivery_recipient", {
    delivery_id: job.id,
  });
  let outcome = "pending",
    providerId: string | null = null;
  if (!recipientError && data?.[0]) {
    if (!data[0].enabled) outcome = "suppressed";
    else
      try {
        // Sandbox destination only. Never send personal payload or the membership list.
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${env.MAIL_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": job.idempotency_key,
          },
          body: JSON.stringify({
            from: env.MAIL_FROM,
            to: ["delivered@resend.dev"],
            subject: "Badminton club update",
            text: `Your club activity has changed (${job.template}). Sign in to review details and notification preferences: ${env.APP_URL}`,
          }),
        });
        if (response.ok) {
          const receipt = (await response.json()) as { id?: string };
          if (receipt.id) {
            outcome = "delivered";
            providerId = receipt.id;
          }
        }
      } catch {
        /* Leave retry state, no PII in logs. */
      }
  }
  const { error: finishError } = await db.rpc("finish_delivery", {
    delivery_id: job.id,
    attempt: job.attempts,
    outcome,
    provider_id: providerId,
  });
  if (finishError)
    throw new Error("Delivery state persistence failed; stop this batch.");
}
