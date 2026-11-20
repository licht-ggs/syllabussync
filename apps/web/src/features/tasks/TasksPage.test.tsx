// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import { AppShell } from "../../app/AppShell";
import { TasksPage } from "./TasksPage";

const userId = "11111111-1111-4111-8111-111111111111";
const yearId = "22222222-2222-4222-8222-222222222222";
const periodId = "33333333-3333-4333-8333-333333333333";
const subjectId = "44444444-4444-4444-8444-444444444444";
const taskId = "55555555-5555-4555-8555-555555555555";
const token = "test-access-token";

function createTask(overrides: Record<string, unknown> = {}) {
  return {
    id: taskId,
    user_id: userId,
    subject_id: subjectId,
    title: "Read chapter 4",
    description: "Review the lecture notes.",
    task_type: "Assignment",
    custom_type: null,
    due_date: "2026-12-01",
    due_time: null,
    due_timezone: null,
    due_at: null,
    priority: "Normal",
    status: "Not Started",
    estimated_duration_minutes: 30,
    reference_url: null,
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function createWorkspace(
  options: { archivedSubject?: boolean; archivedPeriod?: boolean } = {},
) {
  return {
    academic_years: [
      {
        id: yearId,
        user_id: userId,
        name: "2026-2027",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
    academic_periods: [
      {
        id: periodId,
        user_id: userId,
        academic_year_id: yearId,
        name: "First Semester",
        start_date: "2026-09-01",
        end_date: "2027-01-15",
        archived_at: options.archivedPeriod ? "2026-10-01T00:00:00Z" : null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
    subjects: [
      {
        id: subjectId,
        user_id: userId,
        academic_period_id: periodId,
        name: "Biology",
        subject_code: null,
        instructor: null,
        units: null,
        schedule_text: null,
        room: null,
        is_active: !options.archivedSubject,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
    current_academic_period_id: periodId,
  };
}

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => structuredClone(data),
  };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="current-location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function setup(
  options: {
    task?: Record<string, unknown>;
    workspace?: ReturnType<typeof createWorkspace>;
    listTasks?: Array<Record<string, unknown>>;
    history?: Array<Record<string, unknown>>;
    initialPath?: string;
    nextCursor?: string | null;
    mutationResponses?: {
      status?: "stale";
      patch?: "stale" | "network-error";
      delete?: "stale";
    };
  } = {},
) {
  let task = createTask(options.task);
  const listTasks = options.listTasks ?? [task];
  const requests: Array<{ path: string; method: string; body: unknown }> = [];
  const fetchMock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ path, method, body });
      const url = new URL(path, "http://localhost");

      if (url.pathname === "/api/academic/workspace") {
        return jsonResponse(options.workspace ?? createWorkspace());
      }
      if (url.pathname === "/api/tasks" && method === "GET") {
        return jsonResponse({
          tasks: url.searchParams.has("cursor") ? [] : listTasks,
          next_cursor: url.searchParams.has("cursor")
            ? null
            : (options.nextCursor ?? null),
          preferred_timezone: "Asia/Manila",
        });
      }
      if (url.pathname === `/api/tasks/${taskId}` && method === "GET") {
        return jsonResponse(task);
      }
      if (url.pathname.endsWith("/history")) {
        return jsonResponse({
          history: options.history ?? [],
          next_cursor: null,
        });
      }
      if (
        url.pathname === `/api/tasks/${taskId}/status` &&
        method === "PATCH"
      ) {
        if (options.mutationResponses?.status === "stale") {
          const latest = createTask({
            status: "In Progress",
            version: task.version + 1,
          });
          return jsonResponse(
            {
              error: "This task changed. Review its latest values.",
              code: "review_required",
              task: latest,
            },
            409,
          );
        }
        task = createTask({
          ...task,
          status: body.status,
          version: task.version + 1,
        });
        return jsonResponse(task);
      }
      if (url.pathname === `/api/tasks/${taskId}` && method === "PATCH") {
        if (options.mutationResponses?.patch === "network-error") {
          throw new Error("network unavailable");
        }
        if (options.mutationResponses?.patch === "stale") {
          const latest = createTask({
            title: "Latest server title",
            version: task.version + 1,
          });
          return jsonResponse(
            {
              error: "This task changed. Review its latest values.",
              code: "review_required",
              task: latest,
            },
            409,
          );
        }
        task = createTask({
          ...task,
          ...body,
          user_id: userId,
          version: task.version + 1,
        });
        delete (task as Record<string, unknown>).expected_version;
        return jsonResponse(task);
      }
      if (url.pathname === "/api/tasks" && method === "POST") {
        task = createTask({ ...body, id: taskId, user_id: userId });
        return jsonResponse(task, 201);
      }
      if (url.pathname === `/api/tasks/${taskId}` && method === "DELETE") {
        if (options.mutationResponses?.delete === "stale") {
          const latest = createTask({
            title: "Latest server title",
            version: task.version + 1,
          });
          return jsonResponse(
            {
              error: "This task changed. Review its latest values.",
              code: "review_required",
              task: latest,
            },
            409,
          );
        }
        return jsonResponse({ status: "deleted" });
      }
      return jsonResponse({ error: "Not found" }, 404);
    },
  );
  vi.stubGlobal("fetch", fetchMock);

  const session = {
    access_token: token,
    user: { id: userId },
  } as Session;
  const authValue: AuthContextValue = {
    client: null,
    configurationError: null,
    initializationError: null,
    isLoading: false,
    recoveryPending: false,
    session,
    setRecoveryPending: vi.fn(),
  };

  render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[options.initialPath ?? "/tasks"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route element={<TasksPage />} path="/tasks" />
            <Route element={<TasksPage />} path="/tasks/:taskId" />
            <Route element={<TasksPage />} path="/tasks/:taskId/edit" />
            <Route element={<p>Academic workspace</p>} path="/dashboard" />
          </Route>
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </AuthContext.Provider>,
  );

  return { fetchMock, requests };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("TasksPage", () => {
  it("loads the owner's tasks and offers task search and filtering", async () => {
    const { requests } = setup();

    expect(await screen.findByText("Read chapter 4")).toBeTruthy();
    expect(
      requests.some(
        (request) =>
          request.path.startsWith("/api/tasks?") &&
          request.path.includes("view=active"),
      ),
    ).toBe(true);
    expect(screen.getByLabelText("Search and filter tasks")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Load more tasks" }),
    ).toBeNull();
  });

  it("opens task details from a shareable full-page URL", async () => {
    const { requests } = setup({ initialPath: `/tasks/${taskId}` });
    expect(
      await screen.findByRole("heading", { name: "Task details" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Read chapter 4" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Task list")).toBeNull();
    expect(
      requests.some((request) => request.path === `/api/tasks/${taskId}`),
    ).toBe(true);
  });

  it("loads task editing on a separate route and returns to details on cancel", async () => {
    setup({ initialPath: `/tasks/${taskId}/edit` });
    expect(await screen.findByLabelText(/Task title/)).toHaveProperty(
      "value",
      "Read chapter 4",
    );
    expect(
      screen.getByRole("heading", { name: "Edit Read chapter 4" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      await screen.findByRole("heading", { name: "Task details" }),
    ).toBeTruthy();
  });

  it("restores filters from the URL and syncs filter changes back to it", async () => {
    const { requests } = setup({
      initialPath: `/tasks?view=completed&search=chapter&sort=due_date_desc`,
    });
    await screen.findByText("Read chapter 4");
    expect(
      screen
        .getByRole("button", { name: "Completed" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByLabelText("Search task titles")).toHaveProperty(
      "value",
      "chapter",
    );
    expect(
      requests.some(
        (request) =>
          request.path.includes("view=completed") &&
          request.path.includes("search=chapter"),
      ),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Priority"), {
      target: { value: "High" },
    });
    expect(screen.getByTestId("current-location").textContent).toContain(
      "priority=High",
    );
  });

  it("syncs the opaque cursor when loading another task page", async () => {
    setup({ nextCursor: "cursor-token" });
    await screen.findByText("Read chapter 4");
    fireEvent.click(screen.getByRole("button", { name: "Load more tasks" }));
    await waitFor(() =>
      expect(screen.getByTestId("current-location").textContent).toContain(
        "cursor=cursor-token",
      ),
    );
  });

  it("creates a task and reports success only after the API responds", async () => {
    const { requests } = setup({ listTasks: [] });

    fireEvent.click(await screen.findByRole("button", { name: "New task" }));
    fireEvent.change(screen.getByLabelText(/Task title/), {
      target: { value: "Prepare lab report" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    expect(await screen.findByText("Task created.")).toBeTruthy();
    expect(
      requests.some(
        (request) => request.method === "POST" && request.path === "/api/tasks",
      ),
    ).toBe(true);
  });

  it("requires deadline-change confirmation before saving", async () => {
    const { requests } = setup();
    fireEvent.click(
      await screen.findByRole("link", { name: "View Read chapter 4" }),
    );
    fireEvent.click(screen.getByRole("link", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/Due date/), {
      target: { value: "2026-12-02" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Confirm deadline change",
    });
    expect(
      within(dialog).getAllByText("Confirm deadline change").length,
    ).toBeGreaterThan(0);
    expect(requests.some((request) => request.method === "PATCH")).toBe(false);

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Confirm deadline change",
      }),
    );
    expect(await screen.findByText("Task changes saved.")).toBeTruthy();
    expect(
      requests.some(
        (request) =>
          request.method === "PATCH" && request.path === `/api/tasks/${taskId}`,
      ),
    ).toBe(true);
  });

  it("confirms status changes before calling the server", async () => {
    const { requests } = setup();
    fireEvent.click(
      await screen.findByRole("link", { name: "View Read chapter 4" }),
    );
    fireEvent.change(screen.getByLabelText("Change status"), {
      target: { value: "Completed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update status" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Confirm status change",
    });
    expect(requests.some((request) => request.path.endsWith("/status"))).toBe(
      false,
    );

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirm status change" }),
    );
    expect(
      await screen.findByText("Task status changed to Completed."),
    ).toBeTruthy();
    expect(
      requests.some(
        (request) =>
          request.method === "PATCH" &&
          request.path === `/api/tasks/${taskId}/status`,
      ),
    ).toBe(true);
  });

  it("shows a deletion confirmation before sending the delete request", async () => {
    const { requests } = setup();
    fireEvent.click(
      await screen.findByRole("link", { name: "View Read chapter 4" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete task" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete task?" });

    expect(requests.some((request) => request.method === "DELETE")).toBe(false);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete task" }),
    );

    expect(await screen.findByText("Task deleted.")).toBeTruthy();
    expect(
      requests.some(
        (request) =>
          request.method === "DELETE" &&
          request.path === `/api/tasks/${taskId}`,
      ),
    ).toBe(true);
  });

  it("keeps the existing archived subject available when editing its task", async () => {
    setup({
      task: { subject_id: subjectId },
      workspace: createWorkspace({ archivedSubject: true }),
    });
    fireEvent.click(
      await screen.findByRole("link", { name: "View Read chapter 4" }),
    );
    fireEvent.click(screen.getByRole("link", { name: "Edit" }));

    const form = screen.getByRole("form", { name: "Edit task" });
    const subjectSelect = within(form).getByLabelText(/Subject/);
    expect(
      within(subjectSelect).getByRole("option", {
        name: "Biology (Archived — existing task)",
      }),
    ).toBeTruthy();
  });

  it("requires an explicit choice for a repeated daylight-saving time", async () => {
    const { requests } = setup({ listTasks: [] });
    fireEvent.click(await screen.findByRole("button", { name: "New task" }));
    fireEvent.change(screen.getByLabelText(/Task title/), {
      target: { value: "DST deadline" },
    });
    fireEvent.change(screen.getByLabelText(/Due date/), {
      target: { value: "2026-11-01" },
    });
    fireEvent.change(screen.getByLabelText(/Due time/), {
      target: { value: "01:30" },
    });
    fireEvent.change(screen.getByLabelText(/IANA timezone/), {
      target: { value: "America/New_York" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    expect(
      await screen.findByText("Choose the intended occurrence"),
    ).toBeTruthy();
    expect(
      requests.some(
        (request) => request.method === "POST" && request.path === "/api/tasks",
      ),
    ).toBe(false);
    fireEvent.click(
      screen.getAllByRole("radio", {
        name: /Eastern Daylight Time|Eastern Standard Time/,
      })[0]!,
    );
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            request.method === "POST" && request.path === "/api/tasks",
        ),
      ).toBe(true);
    });
  });

  it("detects dirty form values and confirms a dirty cancel", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    setup();
    fireEvent.click(
      await screen.findByRole("link", { name: "View Read chapter 4" }),
    );
    fireEvent.click(screen.getByRole("link", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/Task title/), {
      target: { value: "Unsaved title" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "Discard your unsaved task changes?",
    );
    expect(screen.getByLabelText(/Task title/)).toHaveProperty(
      "value",
      "Unsaved title",
    );
  });

  it("preserves draft values when Dashboard navigation is canceled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    setup();
    fireEvent.click(
      await screen.findByRole("link", { name: "View Read chapter 4" }),
    );
    fireEvent.click(screen.getByRole("link", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/Task title/), {
      target: { value: "Keep this draft" },
    });

    fireEvent.click(screen.getByRole("link", { name: "Workspace" }));

    expect(screen.getByLabelText(/Task title/)).toHaveProperty(
      "value",
      "Keep this draft",
    );
  });

  it("registers and cleans up beforeunload protection while dirty", async () => {
    const addListener = vi.spyOn(window, "addEventListener");
    const removeListener = vi.spyOn(window, "removeEventListener");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    setup();
    fireEvent.click(
      await screen.findByRole("link", { name: "View Read chapter 4" }),
    );
    fireEvent.click(screen.getByRole("link", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/Task title/), {
      target: { value: "Dirty beforeunload draft" },
    });

    expect(addListener).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(removeListener).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );
  });

  it("preserves entered values after a network failure", async () => {
    setup({
      mutationResponses: { patch: "network-error" },
    });
    fireEvent.click(
      await screen.findByRole("link", { name: "View Read chapter 4" }),
    );
    fireEvent.click(screen.getByRole("link", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/Task title/), {
      target: { value: "Network failure draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("The task could not be saved. Please try again."),
    ).toBeTruthy();
    expect(screen.getByLabelText(/Task title/)).toHaveProperty(
      "value",
      "Network failure draft",
    );
  });

  it("preserves entered values after validation failure", async () => {
    setup();
    fireEvent.click(
      await screen.findByRole("link", { name: "View Read chapter 4" }),
    );
    fireEvent.click(screen.getByRole("link", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/Task title/), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Enter a task title.")).toBeTruthy();
    expect(screen.getByLabelText(/Task title/)).toHaveProperty("value", "   ");
  });

  it("updates the task-list record while preserving an open draft on stale update", async () => {
    setup({
      mutationResponses: { patch: "stale" },
    });
    fireEvent.click(
      await screen.findByRole("link", { name: "View Read chapter 4" }),
    );
    fireEvent.click(screen.getByRole("link", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/Task title/), {
      target: { value: "Unsaved stale-update draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("This task changed. Review its latest values."),
    ).toBeTruthy();
    expect(screen.getByLabelText(/Task title/)).toHaveProperty(
      "value",
      "Unsaved stale-update draft",
    );
    expect(await screen.findByText("Latest server title")).toBeTruthy();
  });

  it("updates the task-list record and displays the API error on stale status", async () => {
    setup({
      mutationResponses: { status: "stale" },
    });
    fireEvent.click(
      await screen.findByRole("link", { name: "View Read chapter 4" }),
    );
    fireEvent.change(screen.getByLabelText("Change status"), {
      target: { value: "In Progress" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update status" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm status change" }),
    );

    expect(
      await screen.findByText("This task changed. Review its latest values."),
    ).toBeTruthy();
    expect((await screen.findAllByText("In Progress")).length).toBeGreaterThan(
      0,
    );
  });

  it("updates the task-list record and displays the API error on stale delete", async () => {
    setup({
      mutationResponses: { delete: "stale" },
    });
    fireEvent.click(
      await screen.findByRole("link", { name: "View Read chapter 4" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete task" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete task?" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete task" }),
    );

    expect(
      await screen.findByText("This task changed. Review its latest values."),
    ).toBeTruthy();
    expect(
      (await screen.findAllByText("Latest server title")).length,
    ).toBeGreaterThan(0);
  });
});
