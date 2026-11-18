import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

export function createSupabaseClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "Supabase is not configured; set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY",
    );
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
