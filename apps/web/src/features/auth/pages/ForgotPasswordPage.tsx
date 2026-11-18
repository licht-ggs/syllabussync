import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { forgotPasswordSchema } from "@syllabussync/shared";
import { useAuth } from "../useAuth";
import { getAuthCallbackUrl, getFieldErrors } from "../auth-utils";
import { AuthLayout, FormMessage } from "../components/AuthLayout";
import { SubmitButton, TextField } from "../components/AuthFields";

export function ForgotPasswordPage() {
  const { client, configurationError } = useAuth();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setFieldError(null);
    setSent(false);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(getFieldErrors(parsed.error).email ?? "Enter a valid email address.");
      return;
    }

    if (!client) {
      setErrorMessage(configurationError ?? "Authentication is unavailable.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await client.auth.resetPasswordForEmail(
        parsed.data.email,
        { redirectTo: getAuthCallbackUrl("recovery") },
      );

      if (error) {
        setErrorMessage("The request could not be submitted. Please try again.");
        return;
      }

      setSent(true);
    } catch {
      setErrorMessage("The request could not be submitted. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      description="If an account can receive a reset email, we will send instructions."
      title="Reset your password"
    >
      {configurationError && <FormMessage kind="error">{configurationError}</FormMessage>}
      {sent && (
        <FormMessage kind="success">
          If an account exists for that address, password reset instructions will be
          sent.
        </FormMessage>
      )}
      {errorMessage && <FormMessage kind="error">{errorMessage}</FormMessage>}
      <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
        <TextField
          autoComplete="email"
          error={fieldError ?? undefined}
          id="email"
          label="Email address"
          onChange={setEmail}
          type="email"
          value={email}
        />
        <SubmitButton disabled={isSubmitting}>
          {isSubmitting ? "Sending…" : "Send reset instructions"}
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
