import { it, expect } from "vitest";
import {
  signUnsubscribe,
  verifyUnsubscribe,
} from "../scripts/unsubscribe-token";
const value = {
    club: "10000000-0000-0000-0000-000000000001",
    user: "20000000-0000-0000-0000-000000000001",
    channel: "email" as const,
  },
  key = "synthetic-unsubscribe-key-with-32-bytes";
it("unsubscribe tokens bind exactly one club, person and channel", () => {
  const token = signUnsubscribe(value, key);
  expect(verifyUnsubscribe(token, key)).toEqual(value);
  const changed =
    Buffer.from(JSON.stringify({ ...value, channel: "sms" })).toString(
      "base64url",
    ) +
    "." +
    token.split(".")[1];
  expect(() => verifyUnsubscribe(changed, key)).toThrow();
  expect(() => verifyUnsubscribe(token, key + "wrong")).toThrow();
});
it("malformed tokens and weak keys cannot authorize unsubscribe", () => {
  for (const token of ["", "a.b.c", "a.b", "x".repeat(1001)])
    expect(() => verifyUnsubscribe(token, key)).toThrow();
  expect(() => signUnsubscribe(value, "short")).toThrow();
});
