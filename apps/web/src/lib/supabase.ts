import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

let browserSupabase: ReturnType<typeof createClient> | null = null;

const supabaseEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export function getBrowserSupabaseClient() {
  if (browserSupabase) {
    return browserSupabase;
  }

  const result = supabaseEnvSchema.safeParse(import.meta.env);

  if (!result.success) {
    throw new Error(`Invalid Supabase configuration: ${result.error.message}`);
  }

  browserSupabase = createClient(
    result.data.VITE_SUPABASE_URL,
    result.data.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: false,
        autoRefreshToken: true,
        persistSession: true,
      },
    },
  );

  return browserSupabase;
}
