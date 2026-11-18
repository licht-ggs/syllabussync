import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../useAuth";
import {
  hasEmailPasswordProvider,
  needsEmailVerification,
} from "../auth-utils";
import { AuthLayout, FormMessage } from "../components/AuthLayout";

export function AuthCallbackPage() {
  const { client, configurationError, setRecoveryPending } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isRecoveryFlow =
    new URLSearchParams(location.search).get("flow") === "recovery";
  const started = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    if (started.current) {
      return;
    }

    started.current = true;
    const parameters = new URLSearchParams(location.search);
    const code = parameters.get("code");
    const providerError = parameters.get("error");

    if (providerError || !code) {
      setErrorMessage(
        isRecoveryFlow
          ? "This password recovery link is invalid or expired. Request a new reset link to continue."
          : "Authentication was canceled or could not be completed. Please try again.",
      );
      setIsProcessing(false);
      return;
    }

    if (!client) {
      setErrorMessage(configurationError ?? "Authentication is unavailable.");
      setIsProcessing(false);
      return;
    }

    const authClient = client;
    const authCode = code;

    async function completeAuthentication() {
      const flowId = parameters.get("sb_flow_id");
      const result = flowId
        ? await authClient.auth.exchangeCodeForSession(authCode, { flowId })
        : await authClient.auth.exchangeCodeForSession(authCode);

      if (result.error || !result.data.session) {
        setErrorMessage(
          isRecoveryFlow
            ? "This password recovery link is invalid or expired. Request a new reset link to continue."
            : "This authentication link is invalid or expired. Please start again.",
        );
        setIsProcessing(false);
        return;
      }

      const user = result.data.session.user;

      if (parameters.get("flow") === "recovery") {
        if (!hasEmailPasswordProvider(user)) {
          setRecoveryPending(false);
          navigate("/auth/reset-password", { replace: true });
          return;
        }

        setRecoveryPending(true);
        navigate("/auth/reset-password", { replace: true });
        return;
      }

      setRecoveryPending(false);
      if (needsEmailVerification(user)) {
        navigate("/auth/verify", {
          replace: true,
          state: { email: user.email ?? "" },
        });
        return;
      }

      navigate("/dashboard", { replace: true });
    }

    void completeAuthentication().catch(() => {
      setErrorMessage(
        isRecoveryFlow
          ? "This password recovery link is invalid or expired. Request a new reset link to continue."
          : "Authentication could not be completed. Please start again.",
      );
      setIsProcessing(false);
    });
  }, [
    client,
    configurationError,
    isRecoveryFlow,
    location.search,
    navigate,
    setRecoveryPending,
  ]);

  return (
    <AuthLayout
      description="We are securely completing your sign-in."
      title={isProcessing ? "Completing sign-in" : "Sign-in link unavailable"}
    >
      {configurationError && (
        <FormMessage kind="error">{configurationError}</FormMessage>
      )}
      {isProcessing && (
        <p className="mt-6 text-sm text-slate-600" role="status">
          Please wait…
        </p>
      )}
      {errorMessage && (
        <>
          <FormMessage kind="error">{errorMessage}</FormMessage>
          <p className="mt-6 text-center text-sm">
            <Link
              className="font-semibold text-slate-900 underline"
              to={isRecoveryFlow ? "/auth/forgot-password" : "/sign-in"}
            >
              {isRecoveryFlow
                ? "Request a new reset link"
                : "Return to sign in"}
            </Link>
          </p>
        </>
      )}
    </AuthLayout>
  );
}
