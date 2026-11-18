// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useCallback, type PropsWithChildren } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../AuthContext";
import { SignUpPage } from "./SignUpPage";
import { VerificationPendingPage } from "./VerificationPendingPage";

afterEach(cleanup);

const genericSignupError =
  "We couldn't complete registration or confirm that a verification email was sent. Please try again later.";
const rateLimitError =
  "We couldn't send your verification email just yet. Please wait a little before trying again. If you've already requested an email, check your inbox and spam folder.";
const rawProviderError = "SMTP diagnostic: private provider detail";

function renderSignup({
  signUp = vi.fn().mockResolvedValue({
    data: { session: null, user: null },
    error: null,
  }),
  signOut = vi.fn().mockResolvedValue({ error: null }),
  resend = vi.fn().mockResolvedValue({ error: null }),
}: {
  signUp?: ReturnType<typeof vi.fn>;
  signOut?: ReturnType<typeof vi.fn>;
  resend?: ReturnType<typeof vi.fn>;
} = {}) {
  function TestAuthProvider({ children }: PropsWithChildren) {
    const setRecoveryPending = useCallback((_pending: boolean) => {}, []);
    const client = {
      auth: {
        signUp,
        signOut,
        resend,
        signInWithOAuth: vi.fn(),
      },
    } as unknown as SupabaseClient;
    const value: AuthContextValue = {
      client,
      configurationError: null,
      initializationError: null,
      isLoading: false,
      recoveryPending: false,
      session: null,
      setRecoveryPending,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }

  const view = render(
    <MemoryRouter initialEntries={["/sign-up"]}>
      <Routes>
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/auth/verify" element={<VerificationPendingPage />} />
        <Route path="/sign-in" element={<h1>Sign-in screen</h1>} />
      </Routes>
    </MemoryRouter>,
    { wrapper: TestAuthProvider },
  );

  return { ...view, resend, signOut, signUp };
}

function enterValidSignup() {
  fireEvent.change(screen.getByLabelText("What should we call you?"), {
    target: { value: "Alex Student" },
  });
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "alex@example.edu" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "correct-horse" },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "correct-horse" },
  });
}

async function submitSignup() {
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

describe("SignUpPage", () => {
  it("shows field errors for invalid input without calling Supabase", async () => {
    const { signUp } = renderSignup();

    await submitSignup();

    expect(screen.getByText("Enter your preferred name.")).not.toBeNull();
    expect(screen.getByText("Enter a valid email address.")).not.toBeNull();
    expect(
      screen.getByText("Password must be at least 8 characters."),
    ).not.toBeNull();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("shows a wait-and-retry message for the email send rate limit", async () => {
    const { signUp } = renderSignup({
      signUp: vi.fn().mockResolvedValue({
        data: { session: null, user: null },
        error: {
          code: "over_email_send_rate_limit",
          message: rawProviderError,
        },
      }),
    });
    enterValidSignup();

    await submitSignup();

    expect(await screen.findByText(rateLimitError)).not.toBeNull();
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(rawProviderError)).toBeNull();
    expect(screen.queryByText(genericSignupError)).toBeNull();
  });

  it("uses safe fallback messaging for returned email delivery errors", async () => {
    const { signUp } = renderSignup({
      signUp: vi.fn().mockResolvedValue({
        data: { session: null, user: null },
        error: {
          code: "unexpected_failure",
          message: rawProviderError,
        },
      }),
    });
    enterValidSignup();

    await submitSignup();

    expect(await screen.findByText(genericSignupError)).not.toBeNull();
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(rawProviderError)).toBeNull();
  });

  it("uses safe fallback messaging for thrown registration errors", async () => {
    const { signUp } = renderSignup({
      signUp: vi.fn().mockRejectedValue(new Error(rawProviderError)),
    });
    enterValidSignup();

    await submitSignup();

    expect(await screen.findByText(genericSignupError)).not.toBeNull();
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(rawProviderError)).toBeNull();
  });

  it("keeps existing-account errors generic", async () => {
    const existingAccountMessage = "A user with this email is already registered";
    const { signUp } = renderSignup({
      signUp: vi.fn().mockResolvedValue({
        data: { session: null, user: null },
        error: {
          code: "user_already_exists",
          message: existingAccountMessage,
        },
      }),
    });
    enterValidSignup();

    await submitSignup();

    expect(await screen.findByText(genericSignupError)).not.toBeNull();
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(existingAccountMessage)).toBeNull();
    expect(screen.queryByRole("heading", { name: "Verify your email" })).toBeNull();
  });

  it("routes sessionless signup to verification and retains resend functionality", async () => {
    const { resend, signOut, signUp } = renderSignup();
    enterValidSignup();

    await submitSignup();

    expect(
      await screen.findByRole("heading", { name: "Verify your email" }),
    ).not.toBeNull();
    expect(
      (screen.getByLabelText("Email address") as HTMLInputElement).value,
    ).toBe("alex@example.edu");
    expect(
      screen.getByText(
        "If your account needs email verification, check your inbox and spam folder. If you don't receive an email, you can request another below.",
      ),
    ).not.toBeNull();
    expect(
      screen.queryByText(
        "Your account was created, but we couldn't close the current session. Please complete email verification before continuing.",
      ),
    ).toBeNull();
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "alex@example.edu",
        password: "correct-horse",
        options: expect.objectContaining({
          data: { display_name: "Alex Student" },
          emailRedirectTo: expect.stringContaining("flow=signup"),
        }),
      }),
    );
    expect(signOut).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Resend verification email" }),
    );
    expect(
      await screen.findByText(
        "If this address can receive a verification email, check your inbox and spam folder for a new link.",
      ),
    ).not.toBeNull();
    expect(resend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "signup",
        email: "alex@example.edu",
      }),
    );
  });

  it("routes to verification with an informational notice when sign-out fails", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { session: {}, user: null },
      error: null,
    });
    const signOut = vi.fn().mockResolvedValue({
      error: { message: rawProviderError },
    });
    renderSignup({ signUp, signOut });
    enterValidSignup();

    await submitSignup();

    expect(
      await screen.findByRole("heading", { name: "Verify your email" }),
    ).not.toBeNull();
    expect(
      screen.getByText(
        "Your account was created, but we couldn't close the current session. Please complete email verification before continuing.",
      ),
    ).not.toBeNull();
    expect(
      (screen.getByLabelText("Email address") as HTMLInputElement).value,
    ).toBe("alex@example.edu");
    expect(
      screen.queryByRole("button", { name: "Create account" }),
    ).toBeNull();
    expect(
      screen.queryByLabelText("What should we call you?"),
    ).toBeNull();
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(rawProviderError)).toBeNull();
  });

  it("routes to verification when sign-out throws", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { session: {}, user: null },
      error: null,
    });
    const signOut = vi.fn().mockRejectedValue(new Error(rawProviderError));
    renderSignup({ signUp, signOut });
    enterValidSignup();

    await submitSignup();

    expect(
      await screen.findByRole("heading", { name: "Verify your email" }),
    ).not.toBeNull();
    expect(
      screen.getByText(
        "Your account was created, but we couldn't close the current session. Please complete email verification before continuing.",
      ),
    ).not.toBeNull();
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(rawProviderError)).toBeNull();
  });

  it("never displays a raw provider error message", async () => {
    const { signUp } = renderSignup({
      signUp: vi.fn().mockResolvedValue({
        data: { session: null, user: null },
        error: {
          code: "unexpected_failure",
          message: rawProviderError,
        },
      }),
    });
    enterValidSignup();

    await submitSignup();

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(rawProviderError)).toBeNull();
  });
});
