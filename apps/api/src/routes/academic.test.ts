import type { SupabaseClient, User } from "@supabase/supabase-js";
import express, { type RequestHandler } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAcademicRouter } from "./academic.js";

const userId = "11111111-1111-4111-8111-111111111111";
const yearId = "22222222-2222-4222-8222-222222222222";
const accessToken = "test-access-token";

function createTestApp(client: SupabaseClient) {
  const authMiddleware: RequestHandler = (req, _res, next) => {
    req.authUser = { id: userId } as User;
    req.supabaseAccessToken = accessToken;
    next();
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api/academic",
    createAcademicRouter(authMiddleware, () => client),
  );
  return app;
}

function createRpcClient(result: {
  data: unknown;
  error: { code?: string; message?: string } | null;
}) {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  } as unknown as SupabaseClient;
}

function createWorkspaceClient() {
  const filters: Array<{ table: string; column: string; value: string }> = [];
  const queryResult = { data: [], error: null };
  const client = {
    from: vi.fn((table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: string) => {
          filters.push({ table, column, value });
          return query;
        }),
        order: vi.fn(() => query),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
        then: (
          onFulfilled: (value: typeof queryResult) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(queryResult).then(onFulfilled, onRejected),
      };
      return query;
    }),
    rpc: vi.fn(),
  } as unknown as SupabaseClient;

  return { client, filters };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("academic API", () => {
  it("validates requests before invoking mutation RPCs", async () => {
    const client = createRpcClient({ data: null, error: null });
    const response = await request(createTestApp(client))
      .post("/api/academic/years")
      .send({ name: "   " });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Invalid request" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("uses the verified session token and never trusts a request owner id", async () => {
    const client = createRpcClient({
      data: {
        id: yearId,
        user_id: userId,
        name: "2026-2027",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      error: null,
    });
    const clientFactory = vi.fn(() => client);
    const app = express();
    app.use(express.json());
    app.use(
      "/api/academic",
      createAcademicRouter((req, _res, next) => {
        req.authUser = { id: userId } as User;
        req.supabaseAccessToken = accessToken;
        next();
      }, clientFactory),
    );

    const response = await request(app).post("/api/academic/years").send({
      name: " 2026-2027 ",
      user_id: "22222222-2222-4222-8222-222222222222",
    });

    expect(response.status).toBe(201);
    expect(clientFactory).toHaveBeenCalledWith(accessToken);
    expect(client.rpc).toHaveBeenCalledWith("create_academic_year", {
      p_name: "2026-2027",
    });
  });

  it("returns safe conflict errors without exposing database messages", async () => {
    const client = createRpcClient({
      data: null,
      error: { code: "23505", message: "private database detail" },
    });
    const response = await request(createTestApp(client))
      .post("/api/academic/years")
      .send({ name: "Repeated year" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "A record with that name already exists.",
    });
    expect(JSON.stringify(response.body)).not.toContain(
      "private database detail",
    );
  });

  it("maps archived-state violations to a safe conflict response", async () => {
    const client = createRpcClient({
      data: null,
      error: { code: "23514", message: "private lifecycle details" },
    });
    const response = await request(createTestApp(client)).post(
      `/api/academic/periods/${yearId}/current`,
    );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "The record cannot be changed in its current state.",
    });
  });

  it("returns updated deletion data when the summary is stale", async () => {
    const client = createRpcClient({
      data: {
        status: "review_required",
        academic_period: {
          id: "33333333-3333-4333-8333-333333333333",
          academic_year_id: yearId,
          name: "Term 1",
          subject_count: 3,
          updated_at: "2026-03-01T00:00:00Z",
        },
      },
      error: null,
    });
    const periodId = "33333333-3333-4333-8333-333333333333";
    const response = await request(createTestApp(client))
      .delete(`/api/academic/periods/${periodId}`)
      .send({
        expected_subject_count: 2,
        expected_updated_at: "2026-02-01T00:00:00Z",
      });

    expect(response.status).toBe(409);
    expect(response.body.result.academic_period.subject_count).toBe(3);
    expect(client.rpc).toHaveBeenCalledWith(
      "permanently_delete_archived_period",
      {
        p_academic_period_id: periodId,
        p_expected_subject_count: 2,
        p_expected_updated_at: "2026-02-01T00:00:00Z",
      },
    );
  });

  it("scopes every workspace read to the verified user", async () => {
    const { client, filters } = createWorkspaceClient();
    const response = await request(createTestApp(client)).get(
      "/api/academic/workspace",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      academic_years: [],
      academic_periods: [],
      subjects: [],
      current_academic_period_id: null,
    });
    expect(filters).toHaveLength(4);
    expect(filters.every((filter) => filter.column === "user_id")).toBe(true);
    expect(filters.every((filter) => filter.value === userId)).toBe(true);
  });

  it("rejects malformed record identifiers before calling the database", async () => {
    const client = createRpcClient({ data: null, error: null });
    const response = await request(createTestApp(client)).post(
      "/api/academic/periods/not-a-uuid/current",
    );

    expect(response.status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
