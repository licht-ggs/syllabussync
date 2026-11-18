import { useEffect, useState } from "react";
import { profileSchema, type Profile } from "@syllabussync/shared";
import { useAuth } from "../auth/useAuth";
import { AuthLayout, FormMessage } from "../auth/components/AuthLayout";
import { SubmitButton } from "../auth/components/AuthFields";

export function DashboardPage() {
  const { client, session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

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
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
        },
      });

      if (response.status === 401) {
        await profileClient.auth.signOut();
        return;
      }

      if (!response.ok) {
        throw new Error("Profile could not be loaded.");
      }

      const parsed = profileSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error("Profile response was invalid.");
      }

      if (active) {
        setProfile(parsed.data);
      }
    }

    void loadProfile()
      .catch(() => {
        if (active) {
          setErrorMessage("Your profile could not be loaded. Please try again.");
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [client, session]);

  async function handleSignOut() {
    if (!client) {
      return;
    }

    setIsSigningOut(true);
    try {
      const { error } = await client.auth.signOut();
      if (error) {
        setErrorMessage("Sign-out could not be completed. Please try again.");
      }
    } catch {
      setErrorMessage("Sign-out could not be completed. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <AuthLayout
      description="Your academic workspace is ready when you are."
      title="Welcome to SyllabusSync"
    >
      {profile && (
        <p className="mt-5 text-sm text-slate-700">
          Signed in as <span className="font-semibold">{profile.display_name}</span>
        </p>
      )}
      {isLoading && (
        <p className="mt-5 text-sm text-slate-600" role="status">
          Loading your profile…
        </p>
      )}
      {errorMessage && <FormMessage kind="error">{errorMessage}</FormMessage>}
      <p className="mt-5 text-sm text-slate-600">
        This is a minimal authenticated placeholder. Academic planning features
        will arrive in a later phase.
      </p>
      <form
        className="mt-6"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSignOut();
        }}
      >
        <SubmitButton disabled={isSigningOut}>
          {isSigningOut ? "Signing out…" : "Sign out"}
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
