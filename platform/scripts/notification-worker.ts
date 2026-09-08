import {
  sendGmail,
  gmailTransport,
  isPreSubmissionFailure,
} from "./gmail-provider.ts";
import { signUnsubscribe } from "./unsubscribe-token.ts";
/** Run each minute with server-only secrets. Never imported by the browser. */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { sendProvider } from "./delivery-provider.ts";
const env = z
  .object({
    TEST_SUPABASE_URL: z.url(),
    TEST_PROJECT_REF: z.literal("wgolevihkvmosajumzvl"),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    APP_URL: z.url(),
    DELIVERY_MODE: z
      .enum(["provider-sandbox", "live"])
      .default("provider-sandbox"),
    ALLOW_REAL_RECIPIENTS: z.enum(["true", "false"]).default("false"),
    MAIL_PROVIDER: z.enum(["resend", "gmail"]).default("resend"),
    GMAIL_USER: z.string().optional(),
    GMAIL_APP_PASSWORD: z.string().optional(),
    MAIL_API_KEY: z.string().optional(),
    MAIL_FROM: z.string().optional(),
    UNSUBSCRIBE_URL: z.url(),
    UNSUBSCRIBE_SIGNING_KEY: z.string().min(32),
    SENDER_CONTACT: z.string().min(5),
  })
  .parse(process.env);
const url = new URL(env.TEST_SUPABASE_URL);
if (
  url.protocol !== "https:" ||
  url.hostname !== `${env.TEST_PROJECT_REF}.supabase.co` ||
  url.username ||
  url.password ||
  url.search ||
  url.pathname !== "/"
)
  throw new Error("Unapproved database");
const db = createClient(env.TEST_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "club_app" },
  auth: { persistSession: false },
});
const { data: queued, error: queueError } = await db.rpc("queue_due_reminders");
if (queueError) throw new Error("Reminder scheduler failed");
if (env.DELIVERY_MODE === "live" && env.ALLOW_REAL_RECIPIENTS !== "true") {
  // Queue-only mode: reminders are targeted and recorded, nothing is leased or sent.
  const { count } = await db
    .from("notification_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  console.log(
    JSON.stringify({
      mode: "queue-only",
      queuedThisRun: queued ?? 0,
      pending: count ?? null,
    }),
  );
  process.exit(0);
}
const gmail = env.MAIL_PROVIDER === "gmail";
const gmailSender = gmail
  ? gmailTransport(
      env.GMAIL_USER ?? "",
      (env.GMAIL_APP_PASSWORD ?? "").replace(/\s/g, ""),
    )
  : undefined;
if (gmail && env.DELIVERY_MODE !== "live")
  throw new Error("Gmail has no provider sandbox; use local mocked tests");
if (!gmail && (!env.MAIL_API_KEY || !env.MAIL_FROM))
  throw new Error(
    "Configure the free email sender; notifications remain pending",
  );
const { data, error } = await db.rpc("claim_free_email_batch", {
  batch_size: 20,
});
if (error) throw new Error("Unable to lease notifications");
const jobs = z
  .array(
    z.object({
      id: z.string(),
      club_id: z
        .string()
        .regex(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        ),
      user_id: z
        .string()
        .regex(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        ),
      idempotency_key: z.string(),
      template: z.string(),
      channel: z.enum(["email", "sms"]),
      attempts: z.number(),
    }),
  )
  .parse(data);
for (const job of jobs) {
  let outcome: string;
  let providerId: string | null = null;
  try {
    const { data: recipient, error: targetError } = await db.rpc(
      "delivery_target",
      { delivery_id: job.id },
    );
    if (targetError) throw targetError;
    const target = z
      .object({
        email: z.string().nullable(),
        phone: z.string().nullable(),
        enabled: z.boolean().nullable(),
      })
      .parse(recipient);
    const link = new URL(env.UNSUBSCRIBE_URL);
    if (link.protocol !== "https:" || link.pathname !== "/unsubscribe")
      throw new Error("HTTPS unsubscribe endpoint required");
    link.searchParams.set(
      "token",
      signUnsubscribe(
        { club: job.club_id, user: job.user_id, channel: job.channel },
        env.UNSUBSCRIBE_SIGNING_KEY,
      ),
    );
    const recipientTarget = {
      email: target.email ?? undefined,
      phone: target.phone ?? undefined,
      enabled: target.enabled === true,
    };
    if (gmail && recipientTarget.enabled && job.channel === "email") {
      const { error: markError } = await db.rpc("begin_smtp_delivery", {
        delivery_id: job.id,
        attempt: job.attempts,
      });
      if (markError)
        throw new Error("Unable to mark SMTP submission; do not send");
    }
    const sent = gmail
      ? await sendGmail(
          job,
          recipientTarget,
          {
            user: env.GMAIL_USER!,
            password: (env.GMAIL_APP_PASSWORD ?? "").replace(/\s/g, ""),
            appUrl: env.APP_URL,
            unsubscribeUrl: link.toString(),
            senderContact: env.SENDER_CONTACT,
            allowRealRecipients: env.ALLOW_REAL_RECIPIENTS === "true",
          },
          gmailSender,
        )
      : await sendProvider(job, recipientTarget, {
          mode: env.DELIVERY_MODE,
          allowRealRecipients: env.ALLOW_REAL_RECIPIENTS === "true",
          mailKey: env.MAIL_API_KEY,
          mailFrom: env.MAIL_FROM,
          appUrl: env.APP_URL,
          senderContact: env.SENDER_CONTACT,
          unsubscribeUrl: link.toString(),
        });
    outcome = sent.status;
    providerId = "id" in sent ? (sent.id ?? null) : null;
  } catch (error) {
    outcome = gmail || job.channel === "sms" ? "failed" : "pending";
    // A Gmail failure before DATA cannot have sent anything: release the marker and retry with backoff.
    if (gmail && job.channel === "email" && isPreSubmissionFailure(error)) {
      const { error: releaseError } = await db.rpc("abandon_smtp_delivery", {
        delivery_id: job.id,
        attempt: job.attempts,
      });
      if (!releaseError) outcome = "pending";
    }
  }
  const { error: finishError } = await db.rpc("finish_delivery", {
    delivery_id: job.id,
    attempt: job.attempts,
    outcome,
    provider_id: providerId,
  });
  if (finishError)
    throw new Error(
      "Unable to persist delivery state; stop and reconcile provider before retrying",
    );
}
console.log(
  JSON.stringify({ processed: jobs.length, mode: env.DELIVERY_MODE }),
);
