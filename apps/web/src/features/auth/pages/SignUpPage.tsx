import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signUpSchema } from "@syllabussync/shared";
import { useAuth } from "../useAuth";
import { getAuthCallbackUrl, getFieldErrors } from "../auth-utils";
import { AuthLayout, FormMessage } from "../components/AuthLayout";
import {
  GoogleButton,
  PasswordField,
  SubmitButton,
  TextField,
} from "../components/AuthFields";

export function SignUpPage() {
  const { client, configurationError } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const parsed = signUpSchema.safeParse({
      displayName,
      email,
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      setFieldErrors(getFieldErrors(parsed.error));
      return;
    }

    setFieldErrors({});

    if (!client) {
      setErrorMessage(configurationError ?? "Authentication is unavailable.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await client.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          data: { display_name: parsed.data.displayName },
          emailRedirectTo: getAuthCallbackUrl("signup"),
        },
      });

      if (error) {
        setErrorMessage(
          error.code === "over_email_send_rate_limit"
            ? "We couldn't send your verification email just yet. Please wait a little before trying again. If you've already requested an email, check your inbox and spam folder."
            : "We couldn't complete registration or confirm that a verification email was sent. Please try again later.",
        );
        return;
      }

      let notice: string | undefined;
      if (data.session) {
        try {
          const { error: signOutError } = await client.auth.signOut();
          if (signOutError) {
            notice =
              "Your account was created, but we couldn't close the current session. Please complete email verification before continuing.";
          }
        } catch {
          notice =
            "Your account was created, but we couldn't close the current session. Please complete email verification before continuing.";
        }
      }

      navigate("/auth/verify", {
        state: {
          email: parsed.data.email,
          ...(notice ? { notice } : {}),
        },
        replace: true,
      });
    } catch {
      setErrorMessage(
        "We couldn't complete registration or confirm that a verification email was sent. Please try again later.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      description="Create an account to get started with your semester."
      title="Create your account"
    >
      {configurationError && <FormMessage kind="error">{configurationError}</FormMessage>}
      {errorMessage && <FormMessage kind="error">{errorMessage}</FormMessage>}

      <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
        <TextField
          autoComplete="name"
          error={fieldErrors.displayName}
          id="displayName"
          label="What should we call you?"
          onChange={setDisplayName}
          placeholder="Enter your preferred name"
          value={displayName}
        />
        <TextField
          autoComplete="email"
          error={fieldErrors.email}
          id="email"
          label="Email address"
          onChange={setEmail}
          type="email"
          value={email}
        />
        <PasswordField
          autoComplete="new-password"
          error={fieldErrors.password}
          id="password"
          label="Password"
          onChange={setPassword}
          value={password}
        />
        <PasswordField
          autoComplete="new-password"
          error={fieldErrors.confirmPassword}
          id="confirmPassword"
          label="Confirm password"
          onChange={setConfirmPassword}
          value={confirmPassword}
        />
        <SubmitButton disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
        </SubmitButton>
      </form>

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Or
        </span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <GoogleButton onError={setErrorMessage} />
      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link className="font-semibold text-slate-900 underline" to="/sign-in">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
