import {
  createTaskInputSchema,
  deleteTaskInputSchema,
  deleteTaskResultSchema,
  taskCursorSchema,
  taskHistoryListResponseSchema,
  taskListQuerySchema,
  taskListResponseSchema,
  taskMutationResultSchema,
  taskSchema,
  updateTaskInputSchema,
  updateTaskStatusInputSchema,
  type Task,
  type TaskListQuery,
} from "@syllabussync/shared";
import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { createSupabaseClient } from "../services/supabase.js";

type ClientFactory = typeof createSupabaseClient;

const uuidSchema = z.string().uuid();
const taskColumns =
  "id, user_id, subject_id, title, description, task_type, custom_type, due_date, due_time, due_timezone, due_at, priority, status, estimated_duration_minutes, reference_url, version, created_at, updated_at";
const historyColumns =
  "id, task_id, user_id, event_type, old_values, new_values, changed_at";

const historyCursorSchema = z.object({
  changed_at: z.string().datetime({ offset: true }),
  id: uuidSchema,
  filters: z.string(),
});

function parseId(value: string | undefined, response: Response) {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid request" });
    return null;
  }
  return parsed.data;
}

function parseBody<T extends z.ZodType>(
  schema: T,
  request: Request,
  response: Response,
): z.infer<T> | null {
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid request" });
    return null;
  }
  return parsed.data;
}

function sendDatabaseError(
  response: Response,
  error: { code?: string | undefined },
) {
  if (error.code === "P0002") {
    response.status(404).json({ error: "Task or subject not found." });
    return;
  }

  if (["23503", "23514", "23505"].includes(error.code ?? "")) {
    response.status(409).json({
      error: "The task cannot be changed in its current state.",
    });
    return;
  }

  if (error.code === "22023") {
    response.status(400).json({
      error: "The deadline or timezone is invalid.",
    });
    return;
  }

  response.status(500).json({ error: "Unable to complete the request." });
}

function sendInvalidDatabaseResponse(response: Response) {
  response.status(500).json({ error: "Unable to complete the request." });
}

function sendReviewRequired(
  response: Response,
  task?: Task,
  error = "This task changed. Review its latest values before saving.",
) {
  response.status(409).json({
    error,
    code: "review_required",
    ...(task ? { task } : {}),
  });
}

function getClient(
  request: Request,
  response: Response,
  clientFactory: ClientFactory,
) {
  if (!request.authUser || !request.supabaseAccessToken) {
    response.status(401).json({ error: "Authentication required" });
    return null;
  }
  return clientFactory(request.supabaseAccessToken);
}

function filterIdentity(query: TaskListQuery) {
  return JSON.stringify({
    view: query.view,
    status: query.status ?? null,
    subject_id: query.subject_id ?? null,
    task_type: query.task_type ?? null,
    priority: query.priority ?? null,
    search: query.search ?? null,
    sort: query.sort,
  });
}

function encodeCursor(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor<T extends z.ZodType>(
  value: string,
  schema: T,
): z.infer<T> | null {
  try {
    const parsedJson: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    const parsed = schema.safeParse(parsedJson);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function taskCursorFilter(cursor: z.infer<typeof taskCursorSchema>): string {
  const ascending = cursor.sort === "due_date_asc";
  const dateOperator = ascending ? "gt" : "lt";
  const timeOperator = ascending ? "gt" : "lt";
  const date = cursor.due_date;
  const conditions = [`due_date.${dateOperator}.${date}`];

  if (cursor.due_time === null) {
    conditions.push(`and(due_date.eq.${date},due_time.not.is.null)`);
    conditions.push(
      `and(due_date.eq.${date},due_time.is.null,id.gt.${cursor.id})`,
    );
  } else {
    conditions.push(
      `and(due_date.eq.${date},due_time.${timeOperator}.${cursor.due_time})`,
    );
    conditions.push(
      `and(due_date.eq.${date},due_time.eq.${cursor.due_time},id.gt.${cursor.id})`,
    );
  }

  return conditions.join(",");
}

function taskRpcArguments(
  task: Task,
  expectedVersion: number,
  subjectId: string,
  status = task.status,
) {
  return {
    p_task_id: task.id,
    p_expected_version: expectedVersion,
    p_title: task.title,
    p_description: task.description,
    p_task_type: task.task_type,
    p_custom_type: task.custom_type,
    p_due_date: task.due_date,
    p_due_time: task.due_time,
    p_due_timezone: task.due_timezone,
    p_due_at: task.due_at,
    p_priority: task.priority,
    p_status: status,
    p_estimated_duration_minutes: task.estimated_duration_minutes,
    p_reference_url: task.reference_url,
    p_subject_id: subjectId,
  };
}

export function createTaskRouter(
  authMiddleware: RequestHandler = requireAuth,
  clientFactory: ClientFactory = createSupabaseClient,
) {
  const router = Router();
  router.use(authMiddleware);

  router.post("/", async (request, response) => {
    const input = parseBody(createTaskInputSchema, request, response);
    const client = getClient(request, response, clientFactory);
    if (!input || !client) {
      return;
    }

    const { data, error } = await client.rpc("create_task", {
      p_subject_id: input.subject_id,
      p_title: input.title,
      p_description: input.description,
      p_task_type: input.task_type,
      p_custom_type: input.custom_type,
      p_due_date: input.due_date,
      p_due_time: input.due_time,
      p_due_timezone: input.due_timezone,
      p_due_at: input.due_at,
      p_priority: input.priority,
      p_estimated_duration_minutes: input.estimated_duration_minutes,
      p_reference_url: input.reference_url,
    });
    if (error) {
      sendDatabaseError(response, error);
      return;
    }

    const parsed = taskMutationResultSchema.safeParse(data);
    if (!parsed.success || parsed.data.status !== "created") {
      sendInvalidDatabaseResponse(response);
      return;
    }
    response.status(201).json(parsed.data.task);
  });

  router.get("/", async (request, response) => {
    const parsedQuery = taskListQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      response.status(400).json({ error: "Invalid request" });
      return;
    }

    const client = getClient(request, response, clientFactory);
    if (!client || !request.authUser) {
      return;
    }

    const query = parsedQuery.data;
    const ownerId = request.authUser.id;
    const filters = filterIdentity(query);
    let taskCursor: z.infer<typeof taskCursorSchema> | null = null;
    if (query.cursor) {
      taskCursor = decodeCursor(query.cursor, taskCursorSchema);
      if (
        !taskCursor ||
        taskCursor.sort !== query.sort ||
        taskCursor.filters !== filters
      ) {
        response.status(400).json({ error: "Invalid cursor" });
        return;
      }
    }

    let taskQuery = client
      .from("tasks")
      .select(taskColumns)
      .eq("user_id", ownerId);

    if (query.view === "completed") {
      taskQuery = taskQuery.eq("status", "Completed");
    } else if (query.status) {
      taskQuery = taskQuery.eq("status", query.status);
    } else {
      taskQuery = taskQuery.neq("status", "Completed");
    }
    if (query.subject_id) {
      taskQuery = taskQuery.eq("subject_id", query.subject_id);
    }
    if (query.task_type) {
      taskQuery = taskQuery.eq("task_type", query.task_type);
    }
    if (query.priority) {
      taskQuery = taskQuery.eq("priority", query.priority);
    }
    if (query.search) {
      const literalSearch = query.search.replace(/[\\%_]/g, "\\$&");
      taskQuery = taskQuery.ilike("title", `%${literalSearch}%`);
    }
    if (taskCursor) {
      taskQuery = taskQuery.or(taskCursorFilter(taskCursor));
    }

    const ascending = query.sort === "due_date_asc";
    taskQuery = taskQuery
      .order("due_date", { ascending })
      .order("due_time", { ascending, nullsFirst: true })
      .order("id", { ascending: true })
      .limit(query.limit + 1);

    const [tasksResult, settingsResult] = await Promise.all([
      taskQuery,
      client
        .from("workspace_settings")
        .select("preferred_timezone")
        .eq("user_id", ownerId)
        .maybeSingle(),
    ]);

    if (tasksResult.error || settingsResult.error) {
      sendInvalidDatabaseResponse(response);
      return;
    }

    const parsedTasks = z.array(taskSchema).safeParse(tasksResult.data);
    if (!parsedTasks.success) {
      sendInvalidDatabaseResponse(response);
      return;
    }

    const hasMore = parsedTasks.data.length > query.limit;
    const tasks = parsedTasks.data.slice(0, query.limit);
    const lastTask = tasks.at(-1);
    const nextCursor =
      hasMore && lastTask
        ? encodeCursor({
            due_date: lastTask.due_date,
            due_time: lastTask.due_time,
            id: lastTask.id,
            sort: query.sort,
            filters,
          })
        : null;
    const result = taskListResponseSchema.safeParse({
      tasks,
      next_cursor: nextCursor,
      preferred_timezone:
        settingsResult.data?.preferred_timezone ?? "Asia/Manila",
    });
    if (!result.success) {
      sendInvalidDatabaseResponse(response);
      return;
    }
    response.json(result.data);
  });

  router.get("/:taskId", async (request, response) => {
    const taskId = parseId(request.params.taskId, response);
    const client = getClient(request, response, clientFactory);
    if (!taskId || !client || !request.authUser) {
      return;
    }

    const { data, error } = await client
      .from("tasks")
      .select(taskColumns)
      .eq("id", taskId)
      .eq("user_id", request.authUser.id)
      .maybeSingle();
    if (error) {
      sendInvalidDatabaseResponse(response);
      return;
    }

    const parsed = taskSchema.safeParse(data);
    if (!parsed.success) {
      response.status(404).json({ error: "Task not found." });
      return;
    }
    response.json(parsed.data);
  });

  router.patch("/:taskId", async (request, response) => {
    const taskId = parseId(request.params.taskId, response);
    const input = parseBody(updateTaskInputSchema, request, response);
    const client = getClient(request, response, clientFactory);
    if (!taskId || !input || !client || !request.authUser) {
      return;
    }
    if (
      input.expected_version === undefined ||
      input.expected_version === null
    ) {
      sendReviewRequired(
        response,
        undefined,
        "A task version is required. Reload before saving.",
      );
      return;
    }

    const { data: currentData, error: currentError } = await client
      .from("tasks")
      .select(taskColumns)
      .eq("id", taskId)
      .eq("user_id", request.authUser.id)
      .maybeSingle();
    if (currentError) {
      sendInvalidDatabaseResponse(response);
      return;
    }
    const currentTask = taskSchema.safeParse(currentData);
    if (!currentTask.success) {
      response.status(404).json({ error: "Task not found." });
      return;
    }

    const { data, error } = await client.rpc(
      "update_task",
      taskRpcArguments(
        {
          ...currentTask.data,
          ...input,
        },
        input.expected_version,
        input.subject_id,
      ),
    );
    if (error) {
      sendDatabaseError(response, error);
      return;
    }

    const parsed = taskMutationResultSchema.safeParse(data);
    if (!parsed.success || parsed.data.status === "created") {
      sendInvalidDatabaseResponse(response);
      return;
    }
    if (parsed.data.status === "review_required") {
      sendReviewRequired(response, parsed.data.task);
      return;
    }
    response.json(parsed.data.task);
  });

  router.patch("/:taskId/status", async (request, response) => {
    const taskId = parseId(request.params.taskId, response);
    const input = parseBody(updateTaskStatusInputSchema, request, response);
    const client = getClient(request, response, clientFactory);
    if (!taskId || !input || !client || !request.authUser) {
      return;
    }
    if (
      input.expected_version === undefined ||
      input.expected_version === null
    ) {
      sendReviewRequired(
        response,
        undefined,
        "A task version is required. Reload before changing status.",
      );
      return;
    }

    const { data: currentData, error: currentError } = await client
      .from("tasks")
      .select(taskColumns)
      .eq("id", taskId)
      .eq("user_id", request.authUser.id)
      .maybeSingle();
    if (currentError) {
      sendInvalidDatabaseResponse(response);
      return;
    }
    const currentTask = taskSchema.safeParse(currentData);
    if (!currentTask.success) {
      response.status(404).json({ error: "Task not found." });
      return;
    }

    const { data, error } = await client.rpc(
      "update_task",
      taskRpcArguments(
        currentTask.data,
        input.expected_version,
        currentTask.data.subject_id,
        input.status,
      ),
    );
    if (error) {
      sendDatabaseError(response, error);
      return;
    }

    const parsed = taskMutationResultSchema.safeParse(data);
    if (!parsed.success || parsed.data.status === "created") {
      sendInvalidDatabaseResponse(response);
      return;
    }
    if (parsed.data.status === "review_required") {
      sendReviewRequired(response, parsed.data.task);
      return;
    }
    response.json(parsed.data.task);
  });

  router.delete("/:taskId", async (request, response) => {
    const taskId = parseId(request.params.taskId, response);
    const input = parseBody(deleteTaskInputSchema, request, response);
    const client = getClient(request, response, clientFactory);
    if (!taskId || !input || !client || !request.authUser) {
      return;
    }
    if (
      input.expected_version === undefined ||
      input.expected_version === null
    ) {
      sendReviewRequired(
        response,
        undefined,
        "A task version is required. Reload before deleting.",
      );
      return;
    }

    const { data, error } = await client.rpc("delete_task", {
      p_task_id: taskId,
      p_expected_version: input.expected_version,
    });
    if (error) {
      sendDatabaseError(response, error);
      return;
    }

    const parsed = deleteTaskResultSchema.safeParse(data);
    if (!parsed.success) {
      sendInvalidDatabaseResponse(response);
      return;
    }
    if (parsed.data.status === "review_required") {
      sendReviewRequired(response, parsed.data.task);
      return;
    }
    response.json(parsed.data);
  });

  router.get("/:taskId/history", async (request, response) => {
    const taskId = parseId(request.params.taskId, response);
    const client = getClient(request, response, clientFactory);
    if (!taskId || !client || !request.authUser) {
      return;
    }

    const limitValue = request.query.limit;
    const limit = limitValue === undefined ? 20 : Number(limitValue);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      response.status(400).json({ error: "Invalid request" });
      return;
    }
    const cursorValue = request.query.cursor;
    if (cursorValue !== undefined && typeof cursorValue !== "string") {
      response.status(400).json({ error: "Invalid cursor" });
      return;
    }

    const filterKey = JSON.stringify({ task_id: taskId });
    let historyCursor: z.infer<typeof historyCursorSchema> | null = null;
    if (typeof cursorValue === "string" && cursorValue.length > 0) {
      historyCursor = decodeCursor(cursorValue, historyCursorSchema);
      if (!historyCursor || historyCursor.filters !== filterKey) {
        response.status(400).json({ error: "Invalid cursor" });
        return;
      }
    }

    const { data: taskData, error: taskError } = await client
      .from("tasks")
      .select("id")
      .eq("id", taskId)
      .eq("user_id", request.authUser.id)
      .maybeSingle();
    if (taskError) {
      sendInvalidDatabaseResponse(response);
      return;
    }
    if (!taskData) {
      response.status(404).json({ error: "Task not found." });
      return;
    }

    let historyQuery = client
      .from("task_history")
      .select(historyColumns)
      .eq("task_id", taskId)
      .eq("user_id", request.authUser.id);
    if (historyCursor) {
      historyQuery = historyQuery.or(
        `changed_at.gt.${historyCursor.changed_at},and(changed_at.eq.${historyCursor.changed_at},id.gt.${historyCursor.id})`,
      );
    }
    const { data, error } = await historyQuery
      .order("changed_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit + 1);
    if (error) {
      sendInvalidDatabaseResponse(response);
      return;
    }

    const parsedHistory =
      taskHistoryListResponseSchema.shape.history.safeParse(data);
    if (!parsedHistory.success) {
      sendInvalidDatabaseResponse(response);
      return;
    }

    const hasMore = parsedHistory.data.length > limit;
    const history = parsedHistory.data.slice(0, limit);
    const lastEntry = history.at(-1);
    const nextCursor =
      hasMore && lastEntry
        ? encodeCursor({
            changed_at: lastEntry.changed_at,
            id: lastEntry.id,
            filters: filterKey,
          })
        : null;
    const result = taskHistoryListResponseSchema.safeParse({
      history,
      next_cursor: nextCursor,
    });
    if (!result.success) {
      sendInvalidDatabaseResponse(response);
      return;
    }
    response.json(result.data);
  });

  return router;
}

export const taskRouter = createTaskRouter();
