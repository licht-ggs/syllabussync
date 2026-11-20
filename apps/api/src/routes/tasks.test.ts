import type { SupabaseClient, User } from "@supabase/supabase-js";
import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTaskRouter } from "./tasks.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const sourceSubjectId = "22222222-2222-4222-8222-222222222222";
const destinationSubjectId = "33333333-3333-4333-8333-333333333333";
const taskId = "44444444-4444-4444-8444-444444444444";
const accessToken = "verified-access-token";

function createTask(overrides: Record<string, unknown> = {}) {
  return {
    id: taskId,
    user_id: ownerId,
    subject_id: sourceSubjectId,
    title: "Read chapter 4",
    description: null,
    task_type: "Assignment",
    custom_type: null,
    due_date: "2026-12-01",
    due_time: null,
    due_timezone: null,
    due_at: null,
    priority: "Normal",
    status: "Not Started",
    estimated_duration_minutes: null,
    reference_url: null,
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function createQueryClient(
  tableResults: Record<
    string,
    { data: unknown; error: { code?: string } | null }
  > = {},
  rpcResult: {
    data: unknown;
    error: { code?: string; message?: string } | null;
  } = { data: null, error: null },
) {
  const queries: Array<{
    table: string;
    operations: Array<[string, ...unknown[]]>;
  }> = [];
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const client = {
    from: vi.fn((table: string) => {
      const result = tableResults[table] ?? { data: null, error: null };
      const query = {
        operations: [] as Array<[string, ...unknown[]]>,
        select: vi.fn((...args: unknown[]) => {
          query.operations.push(["select", ...args]);
          return query;
        }),
        eq: vi.fn((...args: unknown[]) => {
          query.operations.push(["eq", ...args]);
          return query;
        }),
        neq: vi.fn((...args: unknown[]) => {
          query.operations.push(["neq", ...args]);
          return query;
        }),
        ilike: vi.fn((...args: unknown[]) => {
          query.operations.push(["ilike", ...args]);
          return query;
        }),
        or: vi.fn((...args: unknown[]) => {
          query.operations.push(["or", ...args]);
          return query;
        }),
        order: vi.fn((...args: unknown[]) => {
          query.operations.push(["order", ...args]);
          return query;
        }),
        limit: vi.fn((...args: unknown[]) => {
          query.operations.push(["limit", ...args]);
          return query;
        }),
        maybeSingle: vi.fn().mockResolvedValue(result),
        then: (
          onFulfilled: (value: typeof result) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(onFulfilled, onRejected),
      };
      queries.push({ table, operations: query.operations });
      return query;
    }),
    rpc,
  } as unknown as SupabaseClient;

  return { client, queries, rpc };
}

function createApp(
  client: SupabaseClient,
  authMiddleware: RequestHandler = (req, _res, next) => {
    req.authUser = { id: ownerId } as User;
    req.supabaseAccessToken = accessToken;
    next();
  },
  clientFactory = vi.fn(() => client),
) {
  const app = express();
  app.use(express.json());
  app.use("/api/tasks", createTaskRouter(authMiddleware, clientFactory));
  return { app, clientFactory };
}

describe("task API", () => {
  it("validates create requests and invokes only the protected RPC", async () => {
    const task = createTask();
    const { client, rpc } = createQueryClient(
      {},
      { data: { status: "created", task }, error: null },
    );
    const { app } = createApp(client);
    const body = {
      subject_id: sourceSubjectId,
      title: "Read chapter 4",
      description: null,
      task_type: "Assignment",
      custom_type: null,
      due_date: "2026-12-01",
      due_time: null,
      due_timezone: null,
      due_at: null,
      priority: "Normal",
      estimated_duration_minutes: null,
      reference_url: null,
    };

    const invalid = await request(app)
      .post("/api/tasks")
      .send({ ...body, user_id: "99999999-9999-4999-8999-999999999999" });
    expect(invalid.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();

    const response = await request(app).post("/api/tasks").send(body);
    expect(response.status).toBe(201);
    expect(response.body.id).toBe(taskId);
    expect(rpc).toHaveBeenCalledWith("create_task", {
      p_subject_id: sourceSubjectId,
      p_title: "Read chapter 4",
      p_description: null,
      p_task_type: "Assignment",
      p_custom_type: null,
      p_due_date: "2026-12-01",
      p_due_time: null,
      p_due_timezone: null,
      p_due_at: null,
      p_priority: "Normal",
      p_estimated_duration_minutes: null,
      p_reference_url: null,
    });
  });

  it("scopes list reads to the authenticated owner and returns a next cursor", async () => {
    const tasks = [
      createTask(),
      createTask({
        id: "55555555-5555-4555-8555-555555555555",
        due_date: "2026-12-02",
      }),
    ];
    const { client, queries } = createQueryClient({
      tasks: { data: tasks, error: null },
      workspace_settings: {
        data: { preferred_timezone: "Asia/Manila" },
        error: null,
      },
    });
    const { app } = createApp(client);

    const response = await request(app).get("/api/tasks").query({
      view: "active",
      subject_id: sourceSubjectId,
      task_type: "Assignment",
      search: "chapter",
      sort: "due_date_asc",
      limit: "1",
    });

    expect(response.status).toBe(200);
    expect(response.body.tasks).toHaveLength(1);
    expect(response.body.next_cursor).toEqual(expect.any(String));
    expect(response.body.preferred_timezone).toBe("Asia/Manila");
    const operations = queries.find(
      (query) => query.table === "tasks",
    )?.operations;
    expect(operations).toContainEqual(["eq", "user_id", ownerId]);
    expect(operations).toContainEqual(["neq", "status", "Completed"]);
    expect(operations).toContainEqual(["eq", "subject_id", sourceSubjectId]);
    expect(operations).toContainEqual(["eq", "task_type", "Assignment"]);
    expect(operations).toContainEqual(["ilike", "title", "%chapter%"]);
    expect(operations).toContainEqual(["limit", 2]);
  });

  it("rejects malformed or filter-mismatched task cursors", async () => {
    const { client, queries } = createQueryClient();
    const { app } = createApp(client);

    const response = await request(app)
      .get("/api/tasks")
      .query({ cursor: "not-a-cursor" });

    expect(response.status).toBe(400);
    expect(queries).toHaveLength(0);
  });

  it("passes the destination subject as the final update_task RPC argument", async () => {
    const currentTask = createTask();
    const updatedTask = createTask({
      subject_id: destinationSubjectId,
      version: 2,
    });
    const { client, rpc } = createQueryClient(
      { tasks: { data: currentTask, error: null } },
      { data: { status: "updated", task: updatedTask }, error: null },
    );
    const { app } = createApp(client);

    const response = await request(app).patch(`/api/tasks/${taskId}`).send({
      subject_id: destinationSubjectId,
      title: currentTask.title,
      description: null,
      task_type: "Assignment",
      custom_type: null,
      due_date: "2026-12-01",
      due_time: null,
      due_timezone: null,
      due_at: null,
      priority: "Normal",
      estimated_duration_minutes: null,
      reference_url: null,
      expected_version: 1,
    });

    expect(response.status).toBe(200);
    expect(response.body.subject_id).toBe(destinationSubjectId);
    expect(rpc).toHaveBeenCalledWith(
      "update_task",
      expect.objectContaining({
        p_expected_version: 1,
        p_subject_id: destinationSubjectId,
        p_status: "Not Started",
      }),
    );
  });

  it("returns review_required when an update has no expected version", async () => {
    const { client, rpc } = createQueryClient();
    const { app } = createApp(client);

    const response = await request(app).patch(`/api/tasks/${taskId}`).send({
      subject_id: sourceSubjectId,
      title: "Read chapter 4",
      description: null,
      task_type: "Assignment",
      custom_type: null,
      due_date: "2026-12-01",
      due_time: null,
      due_timezone: null,
      due_at: null,
      priority: "Normal",
      estimated_duration_minutes: null,
      reference_url: null,
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("review_required");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns review_required when a status update has no expected version", async () => {
    const { client, rpc } = createQueryClient();
    const { app } = createApp(client);

    const response = await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .send({ status: "Completed" });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("review_required");
    expect(response.body).not.toHaveProperty("task");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns review_required when deletion has no expected version", async () => {
    const { client, rpc } = createQueryClient();
    const { app } = createApp(client);

    const response = await request(app).delete(`/api/tasks/${taskId}`).send({});

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("review_required");
    expect(response.body).not.toHaveProperty("task");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the latest task when an update is stale", async () => {
    const latestTask = createTask({
      title: "Latest server title",
      version: 2,
    });
    const { client } = createQueryClient(
      { tasks: { data: latestTask, error: null } },
      {
        data: { status: "review_required", task: latestTask },
        error: null,
      },
    );
    const { app } = createApp(client);

    const response = await request(app).patch(`/api/tasks/${taskId}`).send({
      subject_id: sourceSubjectId,
      title: "Unsaved stale title",
      description: null,
      task_type: "Assignment",
      custom_type: null,
      due_date: "2026-12-01",
      due_time: null,
      due_timezone: null,
      due_at: null,
      priority: "Normal",
      estimated_duration_minutes: null,
      reference_url: null,
      expected_version: 1,
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("review_required");
    expect(response.body.task).toEqual(latestTask);
  });

  it("returns the latest task when a status update is stale", async () => {
    const latestTask = createTask({
      status: "In Progress",
      version: 2,
    });
    const { client } = createQueryClient(
      { tasks: { data: latestTask, error: null } },
      {
        data: { status: "review_required", task: latestTask },
        error: null,
      },
    );
    const { app } = createApp(client);

    const response = await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .send({
        status: "Completed",
        expected_version: 1,
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("review_required");
    expect(response.body.task).toEqual(latestTask);
  });

  it("returns the latest task when the database rejects a stale version", async () => {
    const task = createTask({ version: 2 });
    const { client } = createQueryClient(
      {},
      { data: { status: "review_required", task }, error: null },
    );
    const { app } = createApp(client);

    const response = await request(app)
      .delete(`/api/tasks/${taskId}`)
      .send({ expected_version: 1 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("review_required");
    expect(response.body.task.version).toBe(2);
  });

  it("maps archived destination errors to a safe conflict", async () => {
    const { client } = createQueryClient(
      { tasks: { data: createTask(), error: null } },
      { data: null, error: { code: "23514", message: "private details" } },
    );
    const { app } = createApp(client);

    const response = await request(app).patch(`/api/tasks/${taskId}`).send({
      subject_id: destinationSubjectId,
      title: "Read chapter 4",
      description: null,
      task_type: "Assignment",
      custom_type: null,
      due_date: "2026-12-01",
      due_time: null,
      due_timezone: null,
      due_at: null,
      priority: "Normal",
      estimated_duration_minutes: null,
      reference_url: null,
      expected_version: 1,
    });

    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).not.toContain("private details");
  });

  it("reads only the authenticated task history", async () => {
    const history = {
      id: "66666666-6666-4666-8666-666666666666",
      task_id: taskId,
      user_id: ownerId,
      event_type: "subject_reassigned",
      old_values: { subject_id: sourceSubjectId },
      new_values: { subject_id: destinationSubjectId },
      changed_at: "2026-01-02T00:00:00Z",
    };
    const { client, queries } = createQueryClient({
      tasks: { data: { id: taskId }, error: null },
      task_history: { data: [history], error: null },
    });
    const { app } = createApp(client);

    const response = await request(app).get(`/api/tasks/${taskId}/history`);

    expect(response.status).toBe(200);
    expect(response.body.history).toEqual([history]);
    const operations = queries.find(
      (query) => query.table === "task_history",
    )?.operations;
    expect(operations).toContainEqual(["eq", "task_id", taskId]);
    expect(operations).toContainEqual(["eq", "user_id", ownerId]);
  });

  it("requires authentication on task endpoints", async () => {
    const { client } = createQueryClient();
    const { app } = createApp(client, (_req, _res, next) => next());

    const response = await request(app).get("/api/tasks");

    expect(response.status).toBe(401);
  });
});
