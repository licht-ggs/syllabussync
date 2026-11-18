import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "../features/auth/useAuth";
import { AuthCallbackPage } from "../features/auth/pages/AuthCallbackPage";
import { ForgotPasswordPage } from "../features/auth/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "../features/auth/pages/ResetPasswordPage";
import { SignInPage } from "../features/auth/pages/SignInPage";
import { SignUpPage } from "../features/auth/pages/SignUpPage";
import { VerificationPendingPage } from "../features/auth/pages/VerificationPendingPage";
import { needsEmailVerification } from "../features/auth/auth-utils";
import { DashboardPage } from "../features/dashboard/DashboardPage";

function LoadingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <p className="text-sm text-slate-600" role="status">
        Loading your session…
      </p>
    </main>
  );
}

function PublicOnly() {
  const { isLoading, session } = useAuth();

  if (isLoading) {
    return <LoadingPage />;
  }

  if (session) {
    return (
      <Navigate
        replace
        to={needsEmailVerification(session.user) ? "/auth/verify" : "/dashboard"}
      />
    );
  }

  return <Outlet />;
}

function RequireAuth() {
  const { isLoading, session } = useAuth();

  if (isLoading) {
    return <LoadingPage />;
  }

  if (!session) {
    return <Navigate replace to="/sign-in" />;
  }

  if (needsEmailVerification(session.user)) {
    return (
      <Navigate
        replace
        to="/auth/verify"
        state={{ email: session.user.email ?? "" }}
      />
    );
  }

  return <Outlet />;
}

function RootRedirect() {
  const { isLoading, session } = useAuth();

  if (isLoading) {
    return <LoadingPage />;
  }

  if (!session) {
    return <Navigate replace to="/sign-in" />;
  }

  return (
    <Navigate
      replace
      to={needsEmailVerification(session.user) ? "/auth/verify" : "/dashboard"}
    />
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
      </Route>
      <Route path="/auth/verify" element={<VerificationPendingPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/dashboard" element={<DashboardPage />} />
      </Route>
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
