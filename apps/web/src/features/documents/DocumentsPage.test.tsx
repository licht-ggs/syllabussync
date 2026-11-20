// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import { DocumentsPage } from "./DocumentsPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const documentRow = {
  id: "11111111-1111-4111-8111-111111111111",
  owner_id: "22222222-2222-4222-8222-222222222222",
  subject_id: null,
  filename: "Syllabus.pdf",
  content_type: "application/pdf",
  file_size: 1024,
  sha256: "a".repeat(64),
  page_count: 3,
  processing_status: "uploaded",
  created_at: "2026-11-20T00:00:00.000Z",
  updated_at: "2026-11-20T00:00:00.000Z",
  processing_progress_percent: null,
  processing_error_code: null,
};

function response(payload: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderDocuments(fetchMock: typeof fetch) {
  const auth: AuthContextValue = {
    client: null,
    configurationError: null,
    initializationError: null,
    isLoading: false,
    recoveryPending: false,
    session: {
      access_token: "test-token",
      user: { email: "student@example.edu" },
    } as Session,
    setRecoveryPending: () => undefined,
  };
  vi.stubGlobal("fetch", fetchMock);
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        <DocumentsPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("DocumentsPage", () => {
  it("shows the private PDF document library and its processing boundary", async () => {
    renderDocuments(
      vi.fn().mockImplementation(async (input: RequestInfo | URL) =>
        String(input).includes("/api/documents")
          ? response([documentRow])
          : response({
              academic_years: [],
              academic_periods: [],
              subjects: [],
              current_academic_period_id: null,
            }),
      ),
    );

    expect(await screen.findByText("Syllabus.pdf")).toBeTruthy();
    expect(
      screen.getByText("Uploaded · text extraction not started"),
    ).toBeTruthy();
    expect(
      screen.getByText(/AI requirement extraction is disabled/),
    ).toBeTruthy();
  });

  it("uploads a PDF through the authenticated API and refreshes the list", async () => {
    let uploadRequest: RequestInit | undefined;
    let listed = false;
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input) === "/api/documents" && init?.method === "POST") {
            uploadRequest = init;
            return response(documentRow, 201);
          }
          if (String(input) === "/api/documents") {
            return response(listed ? [documentRow] : []);
          }
          if (String(input) === "/api/academic/workspace") {
            listed = true;
            return response({
              academic_years: [],
              academic_periods: [],
              subjects: [],
              current_academic_period_id: null,
            });
          }
          return response({ error: "Unexpected request" }, 500);
        },
      );
    renderDocuments(fetchMock);
    await screen.findByText("You haven’t uploaded a syllabus yet.");

    const file = new File(["%PDF-1.4"], "My syllabus.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("PDF file"), {
      target: { files: [file] },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Upload PDF" }).closest("form")!,
    );

    expect(await screen.findByText("Syllabus.pdf")).toBeTruthy();
    expect(uploadRequest?.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Content-Type": "application/pdf",
      "X-Document-Filename": "My%20syllabus.pdf",
    });
    expect(uploadRequest?.body).toBe(file);
    expect(
      await screen.findByText(
        "Syllabus uploaded. Start text extraction from the document list.",
      ),
    ).toBeTruthy();
  });

  it("does not call the delete endpoint when the student cancels deletion", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL) =>
        String(input).includes("/api/documents")
          ? response([documentRow])
          : response({
              academic_years: [],
              academic_periods: [],
              subjects: [],
              current_academic_period_id: null,
            }),
      );
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderDocuments(fetchMock);
    await screen.findByText("Syllabus.pdf");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false);
  });
});
