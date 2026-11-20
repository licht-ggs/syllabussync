// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  AuthContext,
  type AuthContextValue,
} from "../features/auth/AuthContext";
import { AppShell } from "./AppShell";
import { NavigationGuardContext } from "./NavigationGuardContext";

afterEach(cleanup);

function DirtyTasksContent() {
  const registerNavigationGuard = useContext(NavigationGuardContext);
  const [draft, setDraft] = useState("Unsaved task draft");

  useEffect(() => {
    registerNavigationGuard?.(() => false);
    return () => registerNavigationGuard?.(null);
  }, [registerNavigationGuard]);

  return (
    <>
      <h1>Tasks content</h1>
      <label>
        Task draft
        <input
          onChange={(event) => setDraft(event.target.value)}
          value={draft}
        />
      </label>
    </>
  );
}

function renderShell(path = "/dashboard") {
  const auth: AuthContextValue = {
    client: null,
    configurationError: null,
    initializationError: null,
    isLoading: false,
    recoveryPending: false,
    session: { user: { email: "student@example.edu" } } as Session,
    setRecoveryPending: () => undefined,
  };
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<h1>Workspace content</h1>} />
            <Route path="/tasks" element={<DirtyTasksContent />} />
            <Route path="/archives" element={<h1>Archive content</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("AppShell", () => {
  it("shows app navigation and the active protected page", () => {
    renderShell("/tasks");
    expect(
      screen.getByRole("navigation", { name: "Main navigation" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Tasks" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByRole("heading", { name: "Tasks content" })).toBeTruthy();
  });

  it("links to the dedicated Archives page", () => {
    renderShell("/archives");
    expect(
      screen
        .getByRole("link", { name: "Archives" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("heading", { name: "Archive content" }),
    ).toBeTruthy();
  });

  it("provides a signed-in account menu", () => {
    renderShell();
    const menu = screen
      .getAllByText("student@example.edu")[0]!
      .closest("details");
    expect(menu).toBeTruthy();
    fireEvent.click(
      (menu as HTMLElement).querySelector("summary") as HTMLElement,
    );
    expect(
      within(menu as HTMLElement).getByRole("button", { name: "Sign out" }),
    ).toBeTruthy();
  });

  it("preserves an unsaved task draft when logo navigation is canceled", () => {
    renderShell("/tasks");
    const draft = screen.getByRole("textbox", { name: "Task draft" });
    fireEvent.change(draft, { target: { value: "Keep this draft" } });

    fireEvent.click(screen.getByRole("link", { name: "SyllabusSync home" }));

    expect(screen.getByRole("heading", { name: "Tasks content" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Task draft" }).getAttribute("value")).toBe("Keep this draft");
  });
});
