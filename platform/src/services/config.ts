import { z } from "zod";
const schema = z.object({
  VITE_APP_ENV: z.enum(["demo", "test"]).default("demo"),
  VITE_SUPABASE_URL: z.string().url().optional(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  VITE_TEST_PROJECT_REF: z.string().optional(),
});
export function readConfig(env: Record<string, unknown>) {
  const c = schema.parse(env);
  if (c.VITE_APP_ENV === "test") {
    if (
      !c.VITE_SUPABASE_URL ||
      !c.VITE_SUPABASE_PUBLISHABLE_KEY ||
      !c.VITE_TEST_PROJECT_REF
    )
      throw new Error(
        "Test environment requires an explicitly approved project and publishable key.",
      );
    const url = new URL(c.VITE_SUPABASE_URL);
    if (
      url.protocol !== "https:" ||
      url.hostname !== `${c.VITE_TEST_PROJECT_REF}.supabase.co` ||
      c.VITE_TEST_PROJECT_REF === "bwepvxelvwgwxrnaglrx" ||
      url.username ||
      url.password ||
      url.pathname !== "/"
    )
      throw new Error("Production or unapproved database rejected.");
    const key = c.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!key.startsWith("sb_publishable_"))
      throw new Error(
        "Use a publishable key; privileged and legacy JWT keys are not accepted.",
      );
  }
  return c;
}
