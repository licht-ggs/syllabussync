import type { User } from "@supabase/supabase-js";
import type { ZodError } from "zod";

export type AuthCallbackFlow = "signup" | "recovery";

export function getAuthCallbackUrl(flow?: AuthCallbackFlow): string {
  const callbackUrl = new URL("/auth/callback", window.location.origin);

  if (flow) {
    callbackUrl.searchParams.set("flow", flow);
  }

  return callbackUrl.toString();
}

export function hasEmailPasswordProvider(user: User): boolean {
  const providers = user.app_metadata.providers;

  return (
    user.app_metadata.provider === "email" ||
    (Array.isArray(providers) && providers.includes("email"))
  );
}

export function needsEmailVerification(user: User): boolean {
  return hasEmailPasswordProvider(user) && !user.email_confirmed_at;
}

export function getFieldErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }

  return fieldErrors;
}
