import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

export function createSupabaseClient(accessToken: string) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "Supabase is not configured; set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY",
    );
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

export function createDocumentWorkerClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Document processing worker requires server-side SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY configuration",
    );
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
