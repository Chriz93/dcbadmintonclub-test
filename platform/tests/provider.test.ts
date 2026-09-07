import { it, expect, vi } from "vitest";
import { sendProvider } from "../scripts/delivery-provider";
const job = {
  id: "job",
  idempotency_key: "unique",
  template: "attendance.reminder",
  channel: "email" as const,
};
const config = {
  mode: "provider-sandbox" as const,
  mailKey: "synthetic",
  mailFrom: "club@example.invalid",
  appUrl: "https://example.invalid",
  allowRealRecipients: false,
};
it("never calls a provider after consent is withdrawn", async () => {
  const fetcher = vi.fn();
  expect(await sendProvider(job, { enabled: false }, config, fetcher)).toEqual({
    status: "suppressed",
  });
  expect(fetcher).not.toHaveBeenCalled();
});
it("sandbox email uses a test recipient and idempotency key, reports acceptance only", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ id: "mail-id" }), { status: 200 }),
    );
  expect(
    await sendProvider(
      job,
      { enabled: true, email: "private@example.invalid" },
      config,
      fetcher,
    ),
  ).toEqual({ status: "accepted", id: "mail-id" });
  const args = fetcher.mock.calls[0];
  expect(JSON.parse(args[1].body).to).toEqual(["delivered@resend.dev"]);
  expect(args[1].headers["Idempotency-Key"]).toBe("unique");
});
it("live mode cannot send without explicit real-recipient enablement", async () => {
  await expect(
    sendProvider(
      job,
      { enabled: true, email: "private@example.invalid" },
      { ...config, mode: "live" },
      vi.fn(),
    ),
  ).rejects.toThrow("not enabled");
});
it("SMS is suppressed in sandbox and never reaches a real phone", async () => {
  const f = vi.fn();
  expect(
    await sendProvider(
      { ...job, channel: "sms" },
      { enabled: true, phone: "+16135550123" },
      config,
      f,
    ),
  ).toEqual({ status: "suppressed" });
  expect(f).not.toHaveBeenCalled();
});

it("zero-cost policy blocks live SMS even with recipient authorization", async () => {
  const f = vi.fn();
  expect(
    await sendProvider(
      { ...job, channel: "sms" },
      { enabled: true, phone: "+16135550123" },
      {
        ...config,
        mode: "live",
        allowRealRecipients: true,
        unsubscribeUrl: "https://example.invalid/unsubscribe",
        senderContact: "Synthetic organizer",
      },
      f,
    ),
  ).toEqual({ status: "suppressed" });
  expect(f).not.toHaveBeenCalled();
});
