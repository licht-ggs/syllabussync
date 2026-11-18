import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const supabaseEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export function createBrowserSupabaseClient() {
  const result = supabaseEnvSchema.safeParse(import.meta.env);

  if (!result.success) {
    throw new Error(`Invalid Supabase configuration: ${result.error.message}`);
  }

  return createClient(
    result.data.VITE_SUPABASE_URL,
    result.data.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
}
