import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { resetPasswordSchema } from "@syllabussync/shared";
import { useAuth } from "../useAuth";
import { getFieldErrors, hasEmailPasswordProvider } from "../auth-utils";
import { AuthLayout, FormMessage } from "../components/AuthLayout";
import { PasswordField, SubmitButton } from "../components/AuthFields";

export function ResetPasswordPage() {
  const {
    client,
    configurationError,
    recoveryPending,
    isLoading,
    session,
    setRecoveryPending,
  } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRetryingSignOut, setIsRetryingSignOut] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "submitting" | "signing-out" | "updated" | "sign-out-error"
  >("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitStatus !== "idle") {
      return;
    }

    setErrorMessage(null);

    const parsed = resetPasswordSchema.safeParse({
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      setFieldErrors(getFieldErrors(parsed.error));
      return;
    }

    if (!client) {
      setErrorMessage(configurationError ?? "Authentication is unavailable.");
      return;
    }

    setFieldErrors({});
    setSubmitStatus("submitting");
    let passwordUpdated = false;

    try {
      const { error } = await client.auth.updateUser({
        password: parsed.data.password,
      });

      if (error) {
        setSubmitStatus("idle");
        setErrorMessage(
          "Password could not be updated. Request a new reset link.",
        );
        return;
      }

      passwordUpdated = true;
      setSubmitStatus("signing-out");
      setRecoveryPending(false);
      const { error: signOutError } = await client.auth.signOut();
      if (signOutError) {
        setSubmitStatus("sign-out-error");
        setErrorMessage(
          "Password updated successfully, but sign-out did not complete. Please try again.",
        );
        return;
      }

      setSubmitStatus("updated");
    } catch {
      if (passwordUpdated) {
        setSubmitStatus("sign-out-error");
        setErrorMessage(
          "Password updated successfully, but sign-out did not complete. Please try again.",
        );
      } else {
        setSubmitStatus("idle");
        setErrorMessage("Password could not be updated. Please try again.");
      }
    }
  }

  async function handleReturnToSignIn() {
    if (!client || isRetryingSignOut) {
      return;
    }

    setIsRetryingSignOut(true);
    try {
      const { error } = await client.auth.signOut();
      if (error) {
        setErrorMessage(
          "Password updated successfully, but sign-out did not complete. Please try again.",
        );
        return;
      }

      navigate("/sign-in", { replace: true });
    } catch {
      setErrorMessage(
        "Password updated successfully, but sign-out did not complete. Please try again.",
      );
    } finally {
      setIsRetryingSignOut(false);
    }
  }

  const usesPassword = session ? hasEmailPasswordProvider(session.user) : false;
  const canReset = Boolean(
    !isLoading &&
    session &&
    usesPassword &&
    recoveryPending &&
    submitStatus === "idle",
  );
  const isSubmitting =
    submitStatus === "submitting" || submitStatus === "signing-out";

  return (
    <AuthLayout
      description="Choose a new password for your SyllabusSync account."
      title="Set a new password"
    >
      {configurationError && submitStatus !== "updated" && (
        <FormMessage kind="error">{configurationError}</FormMessage>
      )}
      {isLoading && (
        <FormMessage kind="info">Checking your recovery link…</FormMessage>
      )}
      {!isLoading && !session && submitStatus !== "updated" && (
        <>
          <FormMessage kind="error">
            This reset link is invalid or expired. Request a new link to
            continue.
          </FormMessage>
          <Link
            className="mt-5 inline-block text-sm font-semibold underline"
            to="/auth/forgot-password"
          >
            Request a new reset link
          </Link>
        </>
      )}
      {!isLoading && session && !usesPassword && submitStatus === "idle" && (
        <>
          <FormMessage kind="info">
            This account uses Google sign-in. Recover access through your Google
            account; SyllabusSync password reset is not available for it.
          </FormMessage>
          <Link
            className="mt-5 inline-block text-sm font-semibold underline"
            to="/sign-in"
          >
            Return to sign in
          </Link>
        </>
      )}
      {!isLoading &&
        session &&
        usesPassword &&
        !recoveryPending &&
        submitStatus === "idle" && (
          <>
            <FormMessage kind="error">
              A valid password recovery link is required to set a new password.
            </FormMessage>
            <Link
              className="mt-5 inline-block text-sm font-semibold underline"
              to="/auth/forgot-password"
            >
              Request a new reset link
            </Link>
          </>
        )}
      {errorMessage && submitStatus !== "updated" && (
        <FormMessage kind="error">{errorMessage}</FormMessage>
      )}
      {submitStatus === "sign-out-error" && (
        <button
          className="mt-5 inline-block text-sm font-semibold underline disabled:opacity-60"
          disabled={isRetryingSignOut}
          onClick={() => void handleReturnToSignIn()}
          type="button"
        >
          {isRetryingSignOut ? "Signing out…" : "Return to sign in"}
        </button>
      )}
      {submitStatus === "updated" && (
        <>
          <FormMessage kind="success">
            Password updated successfully. You can now sign in.
          </FormMessage>
          <Link
            className="mt-5 inline-block text-sm font-semibold underline"
            to="/sign-in"
          >
            Return to sign in
          </Link>
        </>
      )}
      {submitStatus === "signing-out" && (
        <FormMessage kind="info">
          Password updated. Finishing sign out…
        </FormMessage>
      )}
      {canReset && (
        <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
          <PasswordField
            autoComplete="new-password"
            error={fieldErrors.password}
            id="password"
            label="New password"
            onChange={setPassword}
            value={password}
          />
          <PasswordField
            autoComplete="new-password"
            error={fieldErrors.confirmPassword}
            id="confirmPassword"
            label="Confirm new password"
            onChange={setConfirmPassword}
            value={confirmPassword}
          />
          <SubmitButton disabled={isSubmitting}>
            {isSubmitting ? "Updating…" : "Update password"}
          </SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}
