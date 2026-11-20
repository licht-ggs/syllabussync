// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useCallback, useState, type PropsWithChildren } from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../AuthContext";
import { AuthCallbackPage } from "./AuthCallbackPage";
import { ResetPasswordPage } from "./ResetPasswordPage";

afterEach(cleanup);

const emailSession = {
  user: {
    id: "72a5f91e-ea4e-4e16-a30f-231f65b469ce",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
    email: "student@example.edu",
    email_confirmed_at: "2026-01-01T00:00:00Z",
  } as User,
} as Session;

function renderRecoveryRoutes({
  initialPath,
  initialSession = null,
  isLoading = false,
  recoveryPending = false,
  updateUser = vi.fn().mockResolvedValue({ error: null }),
  signOut = vi.fn().mockResolvedValue({ error: null }),
  exchangeCodeForSession = vi
    .fn()
    .mockResolvedValue({ data: { session: null }, error: null }),
}: {
  initialPath: string;
  initialSession?: Session | null;
  isLoading?: boolean;
  recoveryPending?: boolean;
  updateUser?: ReturnType<typeof vi.fn>;
  signOut?: ReturnType<typeof vi.fn>;
  exchangeCodeForSession?: ReturnType<typeof vi.fn>;
}) {
  function TestAuthProvider({ children }: PropsWithChildren) {
    const [session, setSession] = useState(initialSession);
    const setRecoveryPending = useCallback((_pending: boolean) => {}, []);
    const handleSignOut = async () => {
      const result = await signOut();
      if (!result.error) {
        setSession(null);
      }
      return result;
    };
    const client = {
      auth: { updateUser, signOut: handleSignOut, exchangeCodeForSession },
    } as unknown as SupabaseClient;
    const value: AuthContextValue = {
      client,
      configurationError: null,
      initializationError: null,
      isLoading,
      recoveryPending,
      session,
      setRecoveryPending,
    };

    return (
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
  }

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/auth/forgot-password"
          element={<h1>Request reset screen</h1>}
        />
        <Route path="/sign-in" element={<h1>Sign-in screen</h1>} />
        <Route path="/dashboard" element={<h1>Dashboard</h1>} />
      </Routes>
    </MemoryRouter>,
    { wrapper: TestAuthProvider },
  );
}

function enterNewPassword() {
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: "new-password-123" },
  });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: "new-password-123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));
}

describe("password recovery pages", () => {
  it("shows success only after updating the password and returns to sign in", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    renderRecoveryRoutes({
      initialPath: "/auth/reset-password",
      initialSession: emailSession,
      recoveryPending: true,
      updateUser,
    });

    enterNewPassword();

    expect(
      await screen.findByText(
        "Password updated successfully. You can now sign in.",
      ),
    ).not.toBeNull();
    expect(
      screen.queryByText(
        "This reset link is invalid or expired. Request a new link to continue.",
      ),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Update password" }),
    ).toBeNull();
    expect(updateUser).toHaveBeenCalledWith({ password: "new-password-123" });

    fireEvent.click(screen.getByRole("link", { name: "Return to sign in" }));
    expect(
      await screen.findByRole("heading", { name: "Sign-in screen" }),
    ).not.toBeNull();
  });

  it("shows an invalid-link error only and requests a new reset link", async () => {
    renderRecoveryRoutes({
      initialPath: "/auth/reset-password",
      initialSession: null,
    });

    expect(
      screen.getByText(
        "This reset link is invalid or expired. Request a new link to continue.",
      ),
    ).not.toBeNull();
    expect(screen.queryByText(/Password updated successfully/)).toBeNull();

    fireEvent.click(
      screen.getByRole("link", { name: "Request a new reset link" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Request reset screen" }),
    ).not.toBeNull();
  });

  it("does not show an expired recovery link success and requests a replacement link", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { session: null },
      error: { message: "expired" },
    });
    renderRecoveryRoutes({
      initialPath: "/auth/callback?flow=recovery&code=expired",
      exchangeCodeForSession,
    });

    expect(
      await screen.findByText(
        "This password recovery link is invalid or expired. Request a new reset link to continue.",
      ),
    ).not.toBeNull();
    expect(screen.queryByText(/Password updated successfully/)).toBeNull();

    fireEvent.click(
      screen.getByRole("link", { name: "Request a new reset link" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Request reset screen" }),
    ).not.toBeNull();
    expect(exchangeCodeForSession).toHaveBeenCalledWith("expired");
  });

  it("completes a successful OAuth callback and uses in-app navigation", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { session: emailSession },
      error: null,
    });
    renderRecoveryRoutes({
      initialPath: "/auth/callback?code=oauth-code",
      exchangeCodeForSession,
    });

    expect(
      await screen.findByRole("heading", { name: "Dashboard" }),
    ).not.toBeNull();
    expect(exchangeCodeForSession).toHaveBeenCalledWith("oauth-code");
    expect(screen.queryByText(/localhost:5173/)).toBeNull();
  });

  it("treats a recovery callback without a code as invalid and offers a replacement link", async () => {
    renderRecoveryRoutes({ initialPath: "/auth/callback?flow=recovery" });

    expect(
      await screen.findByText(
        "This password recovery link is invalid or expired. Request a new reset link to continue.",
      ),
    ).not.toBeNull();
    expect(screen.queryByText(/Password updated successfully/)).toBeNull();
    expect(
      screen.getByRole("link", { name: "Request a new reset link" }),
    ).not.toBeNull();
  });

  it("waits for session restoration before showing an invalid-link error", () => {
    renderRecoveryRoutes({
      initialPath: "/auth/reset-password",
      isLoading: true,
      initialSession: null,
    });

    expect(screen.getByText("Checking your recovery link…")).not.toBeNull();
    expect(
      screen.queryByText(
        "This reset link is invalid or expired. Request a new link to continue.",
      ),
    ).toBeNull();
  });

  it("clears an earlier update error after a later successful submission", async () => {
    const updateUser = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: "temporary failure" } })
      .mockResolvedValueOnce({ error: null });
    renderRecoveryRoutes({
      initialPath: "/auth/reset-password",
      initialSession: emailSession,
      recoveryPending: true,
      updateUser,
    });

    enterNewPassword();
    expect(
      await screen.findByText(
        "Password could not be updated. Request a new reset link.",
      ),
    ).not.toBeNull();

    enterNewPassword();
    expect(
      await screen.findByText(
        "Password updated successfully. You can now sign in.",
      ),
    ).not.toBeNull();
    await waitFor(() => {
      expect(
        screen.queryByText(
          "Password could not be updated. Request a new reset link.",
        ),
      ).toBeNull();
    });
    expect(
      screen.queryByText(/This reset link is invalid or expired/),
    ).toBeNull();
  });

  it("can retry sign-out and return to sign in after a successful update", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const signOut = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: "temporary failure" } })
      .mockResolvedValueOnce({ error: null });
    renderRecoveryRoutes({
      initialPath: "/auth/reset-password",
      initialSession: emailSession,
      recoveryPending: true,
      signOut,
      updateUser,
    });

    enterNewPassword();

    expect(
      await screen.findByText(
        "Password updated successfully, but sign-out did not complete. Please try again.",
      ),
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Update password" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Return to sign in" }));
    expect(
      await screen.findByRole("heading", { name: "Sign-in screen" }),
    ).not.toBeNull();
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(2);
  });
});
