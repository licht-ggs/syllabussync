import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { forgotPasswordSchema } from "@syllabussync/shared";
import { useAuth } from "../useAuth";
import { getAuthCallbackUrl } from "../auth-utils";
import { AuthLayout, FormMessage } from "../components/AuthLayout";
import { SubmitButton, TextField } from "../components/AuthFields";

export function VerificationPendingPage() {
  const location = useLocation();
  const stateEmail =
    typeof location.state === "object" &&
    location.state !== null &&
    "email" in location.state &&
    typeof location.state.email === "string"
      ? location.state.email
      : "";
  const stateNotice =
    typeof location.state === "object" &&
    location.state !== null &&
    "notice" in location.state &&
    typeof location.state.notice === "string"
      ? location.state.notice
      : null;
  const { client, configurationError } = useAuth();
  const [email, setEmail] = useState(stateEmail);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSent(false);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setErrorMessage("Enter a valid email address.");
      return;
    }

    if (!client) {
      setErrorMessage(configurationError ?? "Authentication is unavailable.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await client.auth.resend({
        type: "signup",
        email: parsed.data.email,
        options: { emailRedirectTo: getAuthCallbackUrl("signup") },
      });

      if (error) {
        setErrorMessage(
          "We could not resend the verification email. Please wait a moment and try again.",
        );
        return;
      }

      setSent(true);
    } catch {
      setErrorMessage("Verification email could not be sent. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      description="If your account needs email verification, check your inbox and spam folder. If you don't receive an email, you can request another below."
      title="Verify your email"
    >
      {configurationError && <FormMessage kind="error">{configurationError}</FormMessage>}
      {stateNotice && <FormMessage kind="info">{stateNotice}</FormMessage>}
      {sent && (
        <FormMessage kind="success">
          If this address can receive a verification email, check your inbox and
          spam folder for a new link.
        </FormMessage>
      )}
      {errorMessage && <FormMessage kind="error">{errorMessage}</FormMessage>}
      <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
        <TextField
          autoComplete="email"
          error={undefined}
          id="email"
          label="Email address"
          onChange={setEmail}
          type="email"
          value={email}
        />
        <SubmitButton disabled={isSubmitting}>
          {isSubmitting ? "Sending…" : "Resend verification email"}
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        <Link className="font-semibold text-slate-900 underline" to="/sign-in">
          Return to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
