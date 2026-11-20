import { useCallback, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/useAuth";
import {
  NavigationGuardContext,
  type NavigationGuard,
} from "./NavigationGuardContext";

const navItems = [
  { label: "Workspace", to: "/dashboard" },
  { label: "Tasks", to: "/tasks" },
  { label: "Archives", to: "/archives" },
  { label: "Documents", to: "/documents" },
];

export function AppShell() {
  const { client, session } = useAuth();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [navigationGuard, setNavigationGuard] =
    useState<NavigationGuard | null>(null);
  const registerNavigationGuard = useCallback(
    (guard: NavigationGuard | null) => {
      setNavigationGuard(() => guard);
    },
    [],
  );

  async function handleSignOut() {
    if (!client) return;
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      const { error } = await client.auth.signOut();
      if (error)
        setSignOutError("Sign-out could not be completed. Please try again.");
    } catch {
      setSignOutError("Sign-out could not be completed. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NavigationGuardContext.Provider value={registerNavigationGuard}>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
            <NavLink
              aria-label="SyllabusSync home"
              className="shrink-0 text-lg font-bold tracking-tight text-indigo-800"
              onClick={(event) => {
                if (navigationGuard && !navigationGuard())
                  event.preventDefault();
              }}
              to="/dashboard"
            >
              SyllabusSync
            </NavLink>
            <nav
              aria-label="Main navigation"
              className="order-3 w-full overflow-x-auto sm:order-2 sm:w-auto"
            >
              <ul className="flex min-w-max items-center gap-1">
                {navItems.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      className={({ isActive }) =>
                        `block rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? "bg-indigo-50 text-indigo-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`
                      }
                      end={item.to === "/dashboard"}
                      onClick={(event) => {
                        if (navigationGuard && !navigationGuard())
                          event.preventDefault();
                      }}
                      to={item.to}
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            <details className="relative order-2 ml-auto sm:order-3 sm:ml-0">
              <summary className="flex max-w-[15rem] cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700">
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800"
                >
                  {(session?.user.email?.[0] ?? "A").toUpperCase()}
                </span>
                <span className="truncate">
                  {session?.user.email ?? "Account"}
                </span>
                <span aria-hidden="true">⌄</span>
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                <p className="truncate px-3 py-2 text-xs text-slate-500">
                  {session?.user.email ?? "Signed in"}
                </p>
                <button
                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                  disabled={isSigningOut}
                  onClick={() => {
                    if (navigationGuard && !navigationGuard()) return;
                    void handleSignOut();
                  }}
                  type="button"
                >
                  {isSigningOut ? "Signing out…" : "Sign out"}
                </button>
                {signOutError && (
                  <p className="px-3 py-2 text-xs text-red-700" role="alert">
                    {signOutError}
                  </p>
                )}
              </div>
            </details>
          </div>
        </header>
        <Outlet />
      </NavigationGuardContext.Provider>
    </div>
  );
}
