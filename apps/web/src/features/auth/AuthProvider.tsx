import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "../../lib/supabase";
import { AuthContext } from "./AuthContext";

const recoveryStorageKey = "syllabussync.auth.recovery";

function updateRecoveryStorage(pending: boolean) {
  if (pending) {
    window.sessionStorage.setItem(recoveryStorageKey, "1");
  } else {
    window.sessionStorage.removeItem(recoveryStorageKey);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [clientState] = useState<{
    client: SupabaseClient | null;
    configurationError: string | null;
  }>(() => {
    try {
      return { client: getBrowserSupabaseClient(), configurationError: null };
    } catch {
      return {
        client: null,
        configurationError:
          "Authentication is not configured. Set the Supabase URL and publishable key.",
      };
    }
  });
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(
    null,
  );
  const [recoveryPending, setRecoveryPendingState] = useState(
    () => window.sessionStorage.getItem(recoveryStorageKey) === "1",
  );

  const setRecoveryPending = useCallback((pending: boolean) => {
    setRecoveryPendingState(pending);
    updateRecoveryStorage(pending);
  }, []);

  useEffect(() => {
    const client = clientState.client;

    if (!client) {
      setIsLoading(false);
      return;
    }

    let active = true;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!active) {
        return;
      }

      setSession(nextSession);

      if (event === "PASSWORD_RECOVERY") {
        setRecoveryPending(true);
      } else if (event === "SIGNED_OUT") {
        setRecoveryPending(false);
      }
    });

    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) {
          return;
        }

        if (error) {
          setInitializationError(
            "Your session could not be restored. Please sign in again.",
          );
          setSession(null);
        } else {
          setSession(data.session);
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (active) {
          setInitializationError(
            "Your session could not be restored. Please sign in again.",
          );
          setSession(null);
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [clientState.client, setRecoveryPending]);

  return (
    <AuthContext.Provider
      value={{
        client: clientState.client,
        configurationError: clientState.configurationError,
        initializationError,
        isLoading,
        recoveryPending,
        session,
        setRecoveryPending,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

