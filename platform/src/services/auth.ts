import { createClient } from "@supabase/supabase-js";
import { readConfig } from "./config";
export const config = readConfig(import.meta.env);
export const supabase =
  config.VITE_APP_ENV === "test"
    ? createClient(
        config.VITE_SUPABASE_URL!,
        config.VITE_SUPABASE_PUBLISHABLE_KEY!,
        {
          db: { schema: "club_app" },
          auth: {
            persistSession: false,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            flowType: "pkce",
          },
        },
      )
    : null;
export async function requestCode(email: string) {
  if (!supabase)
    throw new Error("Email sign-in is unavailable in the offline preview.");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw new Error("Unable to request code. Please try again later.");
}
export async function verifyCode(email: string, token: string) {
  if (!supabase) throw new Error("Configure the isolated test project first.");
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error) throw new Error("Code expired or invalid. Request a new code.");
}
