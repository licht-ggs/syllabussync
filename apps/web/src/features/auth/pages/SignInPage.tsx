import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { signInSchema } from "@syllabussync/shared";
import { useAuth } from "../useAuth";
import { getFieldErrors, needsEmailVerification } from "../auth-utils";
import {
  AuthLayout,
  FormMessage,
} from "../components/AuthLayout";
import {
  GoogleButton,
  PasswordField,
  SubmitButton,
  TextField,
} from "../components/AuthFields";

export function SignInPage() {
  const { client, configurationError, initializationError } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const locationState = location.state;
  const notice =
    typeof locationState === "object" &&
    locationState !== null &&
    "notice" in locationState &&
    typeof locationState.notice === "string"
      ? locationState.notice
      : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const parsed = signInSchema.safeParse({ email, password });
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
      const { data, error } = await client.auth.signInWithPassword(parsed.data);

      if (error) {
        if (error.code === "email_not_confirmed") {
          navigate("/auth/verify", {
            state: { email: parsed.data.email },
            replace: true,
          });
          return;
        }

        setErrorMessage("Email or password is incorrect. Please try again.");
        return;
      }

      if (!data.session) {
        setErrorMessage("Unable to start your session. Please try again.");
        return;
      }

      if (needsEmailVerification(data.session.user)) {
        navigate("/auth/verify", {
          state: { email: parsed.data.email },
          replace: true,
        });
        return;
      }

      navigate("/dashboard", { replace: true });
    } catch {
      setErrorMessage("Sign-in is temporarily unavailable. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      description="Sign in to continue to your academic workspace."
      title="Welcome back"
    >
      {configurationError && <FormMessage kind="error">{configurationError}</FormMessage>}
      {initializationError && <FormMessage kind="error">{initializationError}</FormMessage>}
      {notice && <FormMessage kind="info">{notice}</FormMessage>}
      {errorMessage && <FormMessage kind="error">{errorMessage}</FormMessage>}

      <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
        <TextField
          autoComplete="email"
          error={fieldErrors.email}
          id="email"
          label="Email address"
          onChange={setEmail}
          type="email"
          value={email}
        />
        <div>
          <PasswordField
            autoComplete="current-password"
            error={fieldErrors.password}
            id="password"
            label="Password"
            onChange={setPassword}
            value={password}
          />
          <Link
            className="mt-2 inline-block text-sm font-medium text-slate-700 underline"
            to="/auth/forgot-password"
          >
            Forgot password?
          </Link>
        </div>
        <SubmitButton disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
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
        New to SyllabusSync?{" "}
        <Link className="font-semibold text-slate-900 underline" to="/sign-up">
          Create account
        </Link>
      </p>
    </AuthLayout>
  );
}
