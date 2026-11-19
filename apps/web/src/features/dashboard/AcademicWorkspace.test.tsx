// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import { AcademicWorkspace } from "./AcademicWorkspace";

const userId = "11111111-1111-4111-8111-111111111111";
const yearId = "22222222-2222-4222-8222-222222222222";
const periodId = "33333333-3333-4333-8333-333333333333";
const subjectId = "55555555-5555-4555-8555-555555555555";
const otherSubjectId = "66666666-6666-4666-8666-666666666666";
const timestamp = "2026-01-01T00:00:00Z";

function createWorkspace(
  overrides: Partial<{
    academic_years: Array<Record<string, unknown>>;
    academic_periods: Array<Record<string, unknown>>;
    subjects: Array<Record<string, unknown>>;
    current_academic_period_id: string | null;
  }> = {},
) {
  return {
    academic_years: [
      {
        id: yearId,
        user_id: userId,
        name: "2026-2027",
        created_at: timestamp,
        updated_at: timestamp,
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
        archived_at: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
    ],
    subjects: [
      {
        id: subjectId,
        user_id: userId,
        academic_period_id: periodId,
        name: "Biology",
        subject_code: "BIO-101",
        instructor: "Dr. Lee",
        units: 3,
        schedule_text: "Monday 9:00",
        room: "A101",
        is_active: true,
        created_at: timestamp,
        updated_at: timestamp,
      },
    ],
    current_academic_period_id: periodId,
    ...overrides,
  };
}

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => structuredClone(data),
  };
}

function createFakeApi(initialWorkspace = createWorkspace()) {
  const workspace = structuredClone(initialWorkspace);
  const calls: Array<{
    path: string;
    method: string;
    body: Record<string, unknown>;
  }> = [];
  let nextId = 10;

  const fetchMock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {};
      calls.push({ path, method, body });

      if (path === "/api/academic/workspace") {
        return jsonResponse(workspace);
      }

      if (method === "POST" && path === "/api/academic/years") {
        const year = {
          id: `77777777-7777-4777-8777-${String(nextId++).padStart(12, "0")}`,
          user_id: userId,
          name: body.name,
          created_at: timestamp,
          updated_at: timestamp,
        };
        workspace.academic_years.push(year);
        return jsonResponse(year, 201);
      }

      const yearMatch = path.match(/^\/api\/academic\/years\/([^/]+)$/);
      if (yearMatch && method === "PATCH") {
        const year = workspace.academic_years.find(
          (item) => item.id === yearMatch[1],
        );
        if (year) {
          year.name = body.name;
        }
        return jsonResponse(year);
      }

      if (method === "POST" && path === "/api/academic/periods") {
        const period = {
          id: `88888888-8888-4888-8888-${String(nextId++).padStart(12, "0")}`,
          user_id: userId,
          academic_year_id: body.academic_year_id,
          name: body.name,
          start_date: body.start_date,
          end_date: body.end_date,
          archived_at: null,
          created_at: timestamp,
          updated_at: timestamp,
        };
        workspace.academic_periods.push(period);
        return jsonResponse(period, 201);
      }

      const currentMatch = path.match(
        /^\/api\/academic\/periods\/([^/]+)\/current$/,
      );
      if (currentMatch && method === "POST") {
        workspace.current_academic_period_id = currentMatch[1]!;
        return jsonResponse({ success: true });
      }

      const periodActionMatch = path.match(
        /^\/api\/academic\/periods\/([^/]+)\/(archive|restore)$/,
      );
      if (periodActionMatch && method === "POST") {
        const period = workspace.academic_periods.find(
          (item) => item.id === periodActionMatch[1],
        );
        if (period) {
          period.archived_at =
            periodActionMatch[2] === "archive" ? timestamp : null;
          if (
            periodActionMatch[2] === "archive" &&
            workspace.current_academic_period_id === period.id
          ) {
            workspace.current_academic_period_id = null;
          }
        }
        return jsonResponse({ success: true });
      }

      const periodMatch = path.match(/^\/api\/academic\/periods\/([^/]+)$/);
      if (periodMatch && method === "PATCH") {
        const period = workspace.academic_periods.find(
          (item) => item.id === periodMatch[1],
        );
        if (period) {
          period.name = body.name;
          period.start_date = body.start_date;
          period.end_date = body.end_date;
        }
        return jsonResponse(period);
      }

      if (method === "POST" && path === "/api/academic/subjects") {
        const subject = {
          id: `99999999-9999-4999-8999-${String(nextId++).padStart(12, "0")}`,
          user_id: userId,
          academic_period_id: body.academic_period_id,
          name: body.name,
          subject_code: body.subject_code,
          instructor: body.instructor,
          units: body.units,
          schedule_text: body.schedule_text,
          room: body.room,
          is_active: true,
          created_at: timestamp,
          updated_at: timestamp,
        };
        workspace.subjects.push(subject);
        return jsonResponse(subject, 201);
      }

      const subjectMatch = path.match(/^\/api\/academic\/subjects\/([^/]+)$/);
      if (subjectMatch && method === "PATCH") {
        const subject = workspace.subjects.find(
          (item) => item.id === subjectMatch[1],
        );
        if (subject) {
          Object.assign(subject, body);
        }
        return jsonResponse(subject);
      }

      const subjectActionMatch = path.match(
        /^\/api\/academic\/subjects\/([^/]+)\/(archive|restore)$/,
      );
      if (subjectActionMatch && method === "POST") {
        const subject = workspace.subjects.find(
          (item) => item.id === subjectActionMatch[1],
        );
        if (subject) {
          subject.is_active = subjectActionMatch[2] === "restore";
        }
        return jsonResponse({ success: true });
      }

      if (method === "DELETE" && periodMatch) {
        workspace.subjects = workspace.subjects.filter(
          (subject) => subject.academic_period_id !== periodMatch[1],
        );
        workspace.academic_periods = workspace.academic_periods.filter(
          (period) => period.id !== periodMatch[1],
        );
        return jsonResponse({ status: "deleted" });
      }

      if (method === "DELETE" && subjectMatch) {
        workspace.subjects = workspace.subjects.filter(
          (subject) => subject.id !== subjectMatch[1],
        );
        return jsonResponse({ status: "deleted" });
      }

      return jsonResponse({ error: "Not found" }, 404);
    },
  );

  return {
    calls,
    fetchMock,
    getWorkspace: () => workspace,
  };
}

function renderWorkspace(api: ReturnType<typeof createFakeApi>) {
  const value: AuthContextValue = {
    client: null,
    configurationError: null,
    initializationError: null,
    isLoading: false,
    recoveryPending: false,
    session: { access_token: "test-access-token" } as Session,
    setRecoveryPending: () => {},
  };
  vi.stubGlobal("fetch", api.fetchMock);
  return render(
    <AuthContext.Provider value={value}>
      <AcademicWorkspace />
    </AuthContext.Provider>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AcademicWorkspace", () => {
  it("shows a useful empty state without requiring institution details", async () => {
    const api = createFakeApi({
      academic_years: [],
      academic_periods: [],
      subjects: [],
      current_academic_period_id: null,
    });
    renderWorkspace(api);

    expect(
      await screen.findByText(/No school or institution details/),
    ).not.toBeNull();
    expect(
      screen.getByText("Create an academic period to get started."),
    ).not.toBeNull();
  });

  it("creates and edits academic years", async () => {
    const api = createFakeApi({
      academic_years: [],
      academic_periods: [],
      subjects: [],
      current_academic_period_id: null,
    });
    renderWorkspace(api);
    await screen.findByText(/No school or institution details/);

    fireEvent.change(screen.getByLabelText("Academic year name"), {
      target: { value: "2027-2028" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add academic year" }));
    expect(
      await screen.findByRole("heading", { name: "2027-2028" }),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit year" }));
    fireEvent.change(screen.getByLabelText("Academic year name"), {
      target: { value: "2028-2029" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save academic year" }));

    expect(
      await screen.findByRole("heading", { name: "2028-2029" }),
    ).not.toBeNull();
    expect(api.calls.some((call) => call.method === "PATCH")).toBe(true);
  });

  it("offers a one-tap current selection when creating the first period", async () => {
    const api = createFakeApi({
      academic_years: createWorkspace().academic_years,
      academic_periods: [],
      subjects: [],
      current_academic_period_id: null,
    });
    renderWorkspace(api);
    await screen.findByText("Create an academic period to get started.");

    fireEvent.change(screen.getByLabelText("Period name"), {
      target: { value: "Fall Term" },
    });
    fireEvent.click(screen.getByLabelText("Set this first period as current"));
    fireEvent.click(screen.getByRole("button", { name: "Add period" }));

    expect(await screen.findByText(/2026-2027 · Fall Term/)).not.toBeNull();
    expect(
      screen.getByText(/No active subjects in this period yet/),
    ).not.toBeNull();
    expect(api.calls.some((call) => call.path.endsWith("/current"))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Period name"), {
      target: { value: "Fall Term Revised" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save period" }));
    expect(
      await screen.findByText(/2026-2027 · Fall Term Revised/),
    ).not.toBeNull();
    expect(api.getWorkspace().current_academic_period_id).toBe(
      api.getWorkspace().academic_periods[0]?.id,
    );
  });

  it("creates and edits subjects in the selected current period", async () => {
    const api = createFakeApi({
      ...createWorkspace(),
      subjects: [],
    });
    renderWorkspace(api);
    await screen.findByText(/2026-2027 · First Semester/);

    fireEvent.change(screen.getByLabelText("Subject name"), {
      target: { value: "Chemistry" },
    });
    fireEvent.change(screen.getByLabelText("Subject code (optional)"), {
      target: { value: "CHEM-101" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add subject" }));
    expect(await screen.findByText("Chemistry")).not.toBeNull();

    const chemistryRow = screen.getByText("Chemistry").closest("li");
    fireEvent.click(
      within(chemistryRow as HTMLElement).getByRole("button", { name: "Edit" }),
    );
    fireEvent.change(screen.getByLabelText("Subject name"), {
      target: { value: "Organic Chemistry" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save subject" }));
    expect(await screen.findByText("Organic Chemistry")).not.toBeNull();
    expect(api.calls.some((call) => call.method === "PATCH")).toBe(true);
  });

  it("archives periods centrally without listing their subjects twice", async () => {
    const api = createFakeApi(
      createWorkspace({
        subjects: [
          {
            ...createWorkspace().subjects[0],
            id: subjectId,
            is_active: true,
          },
          {
            ...createWorkspace().subjects[0],
            id: otherSubjectId,
            name: "Individually archived",
            is_active: false,
          },
        ],
      }),
    );
    renderWorkspace(api);
    await screen.findByText("Biology");

    fireEvent.click(screen.getAllByRole("button", { name: "Archive" })[0]!);
    expect(await screen.findByText("Academic period archived.")).not.toBeNull();
    expect(screen.getByText("Biology")).not.toBeNull();
    expect(screen.getByText("Individually archived")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Subjects" }));
    expect(
      screen.getByText(
        "Individually archived subjects from active periods will appear here.",
      ),
    ).not.toBeNull();
    expect(screen.queryByText("Biology")).toBeNull();
    expect(screen.queryByText("Individually archived")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Academic periods" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore period" }));
    expect(
      await screen.findByText(/Choose a period to make it current/),
    ).not.toBeNull();
    expect(api.getWorkspace().current_academic_period_id).toBeNull();
    expect(
      api.getWorkspace().subjects.find((item) => item.id === otherSubjectId)
        ?.is_active,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Subjects" }));
    expect(screen.getByText("Individually archived")).not.toBeNull();
    expect(screen.queryByText("Biology")).toBeNull();
    const archivedSubject = screen
      .getByText("Individually archived")
      .closest("li");
    fireEvent.click(
      within(archivedSubject as HTMLElement).getByRole("button", {
        name: "Restore",
      }),
    );
    expect(await screen.findByText("Subject restored.")).not.toBeNull();
    expect(
      api.getWorkspace().subjects.find((item) => item.id === otherSubjectId)
        ?.is_active,
    ).toBe(true);
    expect(
      screen.getByText(/Choose a period to make it current/),
    ).not.toBeNull();
  });

  it("requires an explicit delete after five seconds and resets on cancel", async () => {
    const archivedWorkspace = createWorkspace();
    archivedWorkspace.academic_periods[0]!.archived_at = timestamp;
    archivedWorkspace.current_academic_period_id = null;
    const api = createFakeApi(archivedWorkspace);
    renderWorkspace(api);
    await screen.findByText("Biology");

    vi.useFakeTimers();
    const deleteTrigger = screen.getAllByRole("button", {
      name: "Permanently delete",
    })[0]!;
    fireEvent.click(deleteTrigger);
    const dialog = screen.getByRole("alertdialog", {
      name: "Permanently delete period?",
    });
    expect(
      within(dialog).getByText("You can confirm in 5 seconds."),
    ).not.toBeNull();
    const confirmButton = within(dialog).getByRole("button", {
      name: "Permanently delete",
    });
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).not.toBe(confirmButton);

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api.calls.filter((call) => call.method === "DELETE")).toHaveLength(
      0,
    );

    fireEvent.click(deleteTrigger);
    const reopenedDialog = screen.getByRole("alertdialog", {
      name: "Permanently delete period?",
    });
    expect(
      within(reopenedDialog).getByText("You can confirm in 5 seconds."),
    ).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(
      within(reopenedDialog).getByRole("button", {
        name: "Permanently delete",
      }),
    ).toHaveProperty("disabled", false);
    expect(api.calls.filter((call) => call.method === "DELETE")).toHaveLength(
      0,
    );
    fireEvent.keyDown(reopenedDialog, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(deleteTrigger);
  });

  it("refreshes the deletion summary and restarts the countdown when records change", async () => {
    const archivedWorkspace = createWorkspace();
    archivedWorkspace.academic_periods[0]!.archived_at = timestamp;
    archivedWorkspace.current_academic_period_id = null;
    const api = createFakeApi(archivedWorkspace);
    const originalFetch = api.fetchMock.getMockImplementation();
    let firstDelete = true;
    const deleteCalls: RequestInit[] = [];
    api.fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === "DELETE" && firstDelete) {
        deleteCalls.push(init);
        firstDelete = false;
        return jsonResponse(
          {
            error: "The record changed. Review the updated deletion summary.",
            result: {
              status: "review_required",
              academic_period: {
                id: periodId,
                academic_year_id: yearId,
                name: "First Semester",
                subject_count: 2,
                updated_at: "2026-03-01T00:00:00Z",
              },
            },
          },
          409,
        );
      }
      return originalFetch?.(input, init) ?? jsonResponse({});
    });
    renderWorkspace(api);
    await screen.findByText("Biology");

    vi.useFakeTimers();
    const deleteTrigger = screen.getAllByRole("button", {
      name: "Permanently delete",
    })[0]!;
    fireEvent.click(deleteTrigger);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    fireEvent.click(
      within(
        screen.getByRole("alertdialog", {
          name: "Permanently delete period?",
        }),
      ).getByRole("button", { name: "Permanently delete" }),
    );
    await act(async () => {
      for (let index = 0; index < 8; index += 1) {
        await Promise.resolve();
      }
    });

    expect(
      screen.getByText(
        "This will also permanently delete 2 subjects in the period.",
      ),
    ).not.toBeNull();
    expect(screen.getByText("You can confirm in 5 seconds.")).not.toBeNull();
    expect(
      within(
        screen.getByRole("alertdialog", {
          name: "Permanently delete period?",
        }),
      ).getByRole("button", { name: "Permanently delete" }),
    ).toHaveProperty("disabled", true);
    expect(deleteCalls).toHaveLength(1);
  });
});
