// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://172.18.131.69:5173/sign-in"}

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../AuthContext";
import { GoogleButton } from "./AuthFields";

afterEach(cleanup);

describe("GoogleButton", () => {
  it("starts OAuth with the callback on the current WSL browser origin", async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
    const value: AuthContextValue = {
      client: {
        auth: { signInWithOAuth },
      } as unknown as SupabaseClient,
      configurationError: null,
      initializationError: null,
      isLoading: false,
      recoveryPending: false,
      session: null,
      setRecoveryPending: vi.fn(),
    };

    render(
      <AuthContext.Provider value={value}>
        <GoogleButton onError={vi.fn()} />
      </AuthContext.Provider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    await waitFor(() => {
      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: "http://172.18.131.69:5173/auth/callback",
        },
      });
    });
  });
});
