import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createContext } from "react";

export type AuthContextValue = {
  client: SupabaseClient | null;
  configurationError: string | null;
  initializationError: string | null;
  isLoading: boolean;
  recoveryPending: boolean;
  session: Session | null;
  setRecoveryPending: (pending: boolean) => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
