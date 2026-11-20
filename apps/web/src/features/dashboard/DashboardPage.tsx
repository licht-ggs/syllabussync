import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { profileSchema, type Profile } from "@syllabussync/shared";
import { useAuth } from "../auth/useAuth";
import { FormMessage } from "../auth/components/AuthLayout";
import { AcademicWorkspace } from "./AcademicWorkspace";

export function DashboardPage() {
  const { client, session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const authClient = client;
    if (!authClient || !session) {
      setIsLoading(false);
      return;
    }
    const profileClient = authClient;
    let active = true;
    setIsLoading(true);
    setErrorMessage(null);

    async function loadProfile() {
      const {
        data: { session: currentSession },
        error: sessionError,
      } = await profileClient.auth.getSession();
      if (sessionError || !currentSession) {
        await profileClient.auth.signOut();
        return;
      }
      const response = await fetch("/api/profile", {
        headers: { Authorization: `Bearer ${currentSession.access_token}` },
      });
      if (response.status === 401) {
        await profileClient.auth.signOut();
        return;
      }
      if (!response.ok) throw new Error("Profile could not be loaded.");
      const parsed = profileSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("Profile response was invalid.");
      if (active) setProfile(parsed.data);
    }

    void loadProfile()
      .catch(() => {
        if (active)
          setErrorMessage(
            "Your profile could not be loaded. Please try again.",
          );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, session]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-wide text-slate-500">
              SYLLABUSSYNC
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Academic workspace
            </h1>
            {profile && (
              <p className="mt-2 text-sm text-slate-700">
                Signed in as{" "}
                <span className="font-semibold">{profile.display_name}</span>
              </p>
            )}
            {isLoading && (
              <p className="mt-2 text-sm text-slate-600" role="status">
                Loading your profile…
              </p>
            )}
          </div>
          <Link
            className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
            to="/tasks"
          >
            Manage tasks
          </Link>
        </header>
        {errorMessage && <FormMessage kind="error">{errorMessage}</FormMessage>}
        <AcademicWorkspace />
      </div>
    </main>
  );
}
