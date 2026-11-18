import type { User } from "@supabase/supabase-js";
import type { RequestHandler } from "express";
import { createSupabaseClient } from "../services/supabase.js";

declare global {
  // Required for Express global type augmentation.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: User;
      supabaseAccessToken?: string;
    }
  }
}

type TokenVerifier = (token: string) => Promise<User | null>;

async function verifySupabaseToken(token: string): Promise<User | null> {
  const supabase = createSupabaseClient(token);
  const { data, error } = await supabase.auth.getUser(token);

  return error ? null : data.user;
}

function isUnverifiedEmailAccount(user: User): boolean {
  const providers = user.app_metadata.providers;
  const hasEmailProvider =
    user.app_metadata.provider === "email" ||
    (Array.isArray(providers) && providers.includes("email"));

  return hasEmailProvider && !user.email_confirmed_at;
}

export function createAuthMiddleware(
  verifyToken: TokenVerifier = verifySupabaseToken,
): RequestHandler {
  return async (request, response, next) => {
    const authorization = request.get("authorization");
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    const token = match?.[1];

    if (!token) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }

    const user = await verifyToken(token);

    if (!user) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }

    if (isUnverifiedEmailAccount(user)) {
      response.status(403).json({ error: "Email verification required" });
      return;
    }

    request.authUser = user;
    request.supabaseAccessToken = token;
    next();
  };
}

export const requireAuth = createAuthMiddleware();
