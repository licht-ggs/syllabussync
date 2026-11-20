// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import { RequirementReviewPage } from "./RequirementReviewPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("RequirementReviewPage", () => {
  it("discloses that extraction remains unavailable until provider safeguards are configured", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/candidates")) return response([]);
        if (url.endsWith("/workspace"))
          return response({
            academic_years: [],
            academic_periods: [],
            subjects: [],
            current_academic_period_id: null,
          });
        if (url === "/api/tasks?limit=1")
          return response({
            tasks: [],
            next_cursor: null,
            preferred_timezone: "Asia/Manila",
          });
        return response({
          id: "11111111-1111-4111-8111-111111111111",
          owner_id: "22222222-2222-4222-8222-222222222222",
          subject_id: null,
          filename: "Syllabus.pdf",
          content_type: "application/pdf",
          file_size: 1024,
          sha256: "a".repeat(64),
          page_count: 2,
          processing_status: "text_extracted",
          created_at: "2026-11-20T00:00:00.000Z",
          updated_at: "2026-11-20T00:00:00.000Z",
        });
      });
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
    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter
          initialEntries={[
            "/documents/11111111-1111-4111-8111-111111111111/review",
          ]}
        >
          <Routes>
            <Route
              path="/documents/:documentId/review"
              element={<RequirementReviewPage />}
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(
      await screen.findByText("No requirements are available to review yet"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /No syllabus content has been sent to an external AI provider/,
      ),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
