import { useState } from "react";
import { useAuth } from "../useAuth";
import { getAuthCallbackUrl } from "../auth-utils";

type TextFieldProps = {
  autoComplete: string;
  error?: string | undefined;
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "email" | "text";
  value: string;
};

const inputClassName =
  "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-900 shadow-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

export function TextField({
  autoComplete,
  error,
  id,
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: TextFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label className="block text-sm font-medium text-slate-800" htmlFor={id}>
        {label}
      </label>
      <input
        autoComplete={autoComplete}
        className={inputClassName}
        id={id}
        name={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p className="mt-1 text-sm text-red-700" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

type PasswordFieldProps = {
  autoComplete: string;
  error?: string | undefined;
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
};

export function PasswordField({
  autoComplete,
  error,
  id,
  label,
  onChange,
  value,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;

  return (
    <div>
      <label className="block text-sm font-medium text-slate-800" htmlFor={id}>
        {label}
      </label>
      <div className="relative mt-1">
        <input
          autoComplete={autoComplete}
          className={`${inputClassName} pr-20`}
          id={id}
          name={id}
          onChange={(event) => onChange(event.target.value)}
          type={visible ? "text" : "password"}
          value={value}
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        <button
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-slate-600 hover:text-slate-900"
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-700" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

export function SubmitButton({
  children,
  disabled,
}: {
  children: string;
  disabled: boolean;
}) {
  return (
    <button
      className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      type="submit"
    >
      {children}
    </button>
  );
}

export function GoogleButton({
  onError,
}: {
  onError: (message: string) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const { client, configurationError } = useAuth();

  async function handleGoogleSignIn() {
    if (!client) {
      onError(configurationError ?? "Authentication is unavailable.");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: getAuthCallbackUrl() },
      });

      if (!error) {
        return;
      }

      onError("Google sign-in could not be started. Please try again.");
    } catch {
      onError("Google sign-in could not be started. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <button
      className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isLoading}
      onClick={() => void handleGoogleSignIn()}
      type="button"
    >
      {isLoading ? "Connecting to Google…" : "Continue with Google"}
    </button>
  );
}
