import {
  academicPeriodCreateSchema,
  academicPeriodDeletionResultSchema,
  academicPeriodSchema,
  academicPeriodUpdateSchema,
  academicWorkspaceSchema,
  academicYearDeletionResultSchema,
  academicYearInputSchema,
  academicYearSchema,
  deleteAcademicPeriodInputSchema,
  deleteAcademicYearInputSchema,
  deleteSubjectInputSchema,
  subjectCreateSchema,
  subjectDeletionResultSchema,
  subjectSchema,
  subjectUpdateSchema,
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

function parseId(value: string | undefined, response: Response): string | null {
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
    response.status(404).json({ error: "Record not found" });
    return;
  }

  if (["23503", "23505", "23514"].includes(error.code ?? "")) {
    const message =
      error.code === "23505"
        ? "A record with that name already exists."
        : error.code === "23514"
          ? "The record cannot be changed in its current state."
          : "The selected academic record is unavailable.";
    response.status(409).json({ error: message });
    return;
  }

  response.status(500).json({ error: "Unable to complete the request" });
}

function sendInvalidDatabaseResponse(response: Response) {
  response.status(500).json({ error: "Unable to complete the request" });
}

export function createAcademicRouter(
  authMiddleware: RequestHandler = requireAuth,
  clientFactory: ClientFactory = createSupabaseClient,
) {
  const router = Router();
  router.use(authMiddleware);

  function getClient(request: Request, response: Response) {
    if (!request.authUser || !request.supabaseAccessToken) {
      response.status(401).json({ error: "Authentication required" });
      return null;
    }

    return clientFactory(request.supabaseAccessToken);
  }

  router.get("/workspace", async (request, response) => {
    const client = getClient(request, response);
    if (!client || !request.authUser) {
      return;
    }

    const ownerId = request.authUser.id;
    const [years, periods, subjects, settings] = await Promise.all([
      client
        .from("academic_years")
        .select("id, user_id, name, created_at, updated_at")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      client
        .from("academic_periods")
        .select(
          "id, user_id, academic_year_id, name, start_date, end_date, archived_at, created_at, updated_at",
        )
        .eq("user_id", ownerId)
        .order("academic_year_id", { ascending: true })
        .order("start_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      client
        .from("subjects")
        .select(
          "id, user_id, academic_period_id, name, subject_code, instructor, units, schedule_text, room, is_active, created_at, updated_at",
        )
        .eq("user_id", ownerId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      client
        .from("workspace_settings")
        .select("current_academic_period_id")
        .eq("user_id", ownerId)
        .maybeSingle(),
    ]);

    if (years.error || periods.error || subjects.error || settings.error) {
      sendInvalidDatabaseResponse(response);
      return;
    }

    const parsed = academicWorkspaceSchema.safeParse({
      academic_years: years.data,
      academic_periods: periods.data,
      subjects: subjects.data,
      current_academic_period_id:
        settings.data?.current_academic_period_id ?? null,
    });

    if (!parsed.success) {
      sendInvalidDatabaseResponse(response);
      return;
    }

    response.json(parsed.data);
  });

  router.post("/years", async (request, response) => {
    const input = parseBody(academicYearInputSchema, request, response);
    const client = getClient(request, response);
    if (!input || !client) {
      return;
    }

    const { data, error } = await client.rpc("create_academic_year", {
      p_name: input.name,
    });
    if (error) {
      sendDatabaseError(response, error);
      return;
    }

    const parsed = academicYearSchema.safeParse(data);
    if (!parsed.success) {
      sendInvalidDatabaseResponse(response);
      return;
    }
    response.status(201).json(parsed.data);
  });

  router.patch("/years/:yearId", async (request, response) => {
    const yearId = parseId(request.params.yearId, response);
    const input = parseBody(academicYearInputSchema, request, response);
    const client = getClient(request, response);
    if (!yearId || !input || !client) {
      return;
    }

    const { data, error } = await client.rpc("update_academic_year", {
      p_academic_year_id: yearId,
      p_name: input.name,
    });
    if (error) {
      sendDatabaseError(response, error);
      return;
    }

    const parsed = academicYearSchema.safeParse(data);
    if (!parsed.success) {
      sendInvalidDatabaseResponse(response);
      return;
    }
    response.json(parsed.data);
  });

  router.delete("/years/:yearId", async (request, response) => {
    const yearId = parseId(request.params.yearId, response);
    const input = parseBody(deleteAcademicYearInputSchema, request, response);
    const client = getClient(request, response);
    if (!yearId || !input || !client) {
      return;
    }

    const { data, error } = await client.rpc("delete_academic_year", {
      p_academic_year_id: yearId,
      p_expected_period_count: input.expected_period_count,
      p_expected_updated_at: input.expected_updated_at,
    });
    if (error) {
      sendDatabaseError(response, error);
      return;
    }

    const parsed = academicYearDeletionResultSchema.safeParse(data);
    if (!parsed.success) {
      sendInvalidDatabaseResponse(response);
      return;
    }
    if (parsed.data.status === "review_required") {
      response.status(409).json({
        error: "The record changed. Review the updated deletion summary.",
        result: parsed.data,
      });
      return;
    }
    if (parsed.data.status === "blocked") {
      response.status(409).json({
        error: "Academic years containing periods cannot be deleted.",
        result: parsed.data,
      });
      return;
    }
    response.json(parsed.data);
  });

  router.post("/periods", async (request, response) => {
    const input = parseBody(academicPeriodCreateSchema, request, response);
    const client = getClient(request, response);
    if (!input || !client) {
      return;
    }

    const { data, error } = await client.rpc("create_academic_period", {
      p_academic_year_id: input.academic_year_id,
      p_name: input.name,
      p_start_date: input.start_date,
      p_end_date: input.end_date,
    });
    if (error) {
      sendDatabaseError(response, error);
      return;
    }

    const parsed = academicPeriodSchema.safeParse(data);
    if (!parsed.success) {
      sendInvalidDatabaseResponse(response);
      return;
    }
    response.status(201).json(parsed.data);
  });

  router.patch("/periods/:periodId", async (request, response) => {
    const periodId = parseId(request.params.periodId, response);
    const input = parseBody(academicPeriodUpdateSchema, request, response);
    const client = getClient(request, response);
    if (!periodId || !input || !client) {
      return;
    }

    const { data, error } = await client.rpc("update_academic_period", {
      p_academic_period_id: periodId,
      p_name: input.name,
      p_start_date: input.start_date,
      p_end_date: input.end_date,
    });
    if (error) {
      sendDatabaseError(response, error);
      return;
    }

    const parsed = academicPeriodSchema.safeParse(data);
    if (!parsed.success) {
      sendInvalidDatabaseResponse(response);
      return;
    }
    response.json(parsed.data);
  });

  router.post("/periods/:periodId/current", async (request, response) => {
    const periodId = parseId(request.params.periodId, response);
    const client = getClient(request, response);
    if (!periodId || !client) {
      return;
    }

    const { error } = await client.rpc("select_current_academic_period", {
      p_academic_period_id: periodId,
    });
    if (error) {
      sendDatabaseError(response, error);
      return;
    }
    response.json({ success: true });
  });

  for (const [action, functionName] of [
    ["archive", "archive_academic_period"],
    ["restore", "restore_academic_period"],
  ] as const) {
    router.post(`/periods/:periodId/${action}`, async (request, response) => {
      const periodId = parseId(request.params.periodId, response);
      const client = getClient(request, response);
      if (!periodId || !client) {
        return;
      }

      const { error } = await client.rpc(functionName, {
        p_academic_period_id: periodId,
      });
      if (error) {
        sendDatabaseError(response, error);
        return;
      }
      response.json({ success: true });
    });
  }

  router.delete("/periods/:periodId", async (request, response) => {
    const periodId = parseId(request.params.periodId, response);
    const input = parseBody(deleteAcademicPeriodInputSchema, request, response);
    const client = getClient(request, response);
    if (!periodId || !input || !client) {
      return;
    }

    const { data, error } = await client.rpc(
      "permanently_delete_archived_period",
      {
        p_academic_period_id: periodId,
        p_expected_subject_count: input.expected_subject_count,
        p_expected_updated_at: input.expected_updated_at,
      },
    );
    if (error) {
      sendDatabaseError(response, error);
      return;
    }

    const parsed = academicPeriodDeletionResultSchema.safeParse(data);
    if (!parsed.success) {
      sendInvalidDatabaseResponse(response);
      return;
    }
    if (parsed.data.status === "review_required") {
      response.status(409).json({
        error: "The record changed. Review the updated deletion summary.",
        result: parsed.data,
      });
      return;
    }
    response.json(parsed.data);
  });

  router.post("/subjects", async (request, response) => {
    const input = parseBody(subjectCreateSchema, request, response);
    const client = getClient(request, response);
    if (!input || !client) {
      return;
    }

    const { data, error } = await client.rpc("create_subject", {
      p_academic_period_id: input.academic_period_id,
      p_name: input.name,
      p_subject_code: input.subject_code,
      p_instructor: input.instructor,
      p_units: input.units,
      p_schedule_text: input.schedule_text,
      p_room: input.room,
    });
    if (error) {
      sendDatabaseError(response, error);
      return;
    }

    const parsed = subjectSchema.safeParse(data);
    if (!parsed.success) {
      sendInvalidDatabaseResponse(response);
      return;
    }
    response.status(201).json(parsed.data);
  });

  router.patch("/subjects/:subjectId", async (request, response) => {
    const subjectId = parseId(request.params.subjectId, response);
    const input = parseBody(subjectUpdateSchema, request, response);
    const client = getClient(request, response);
    if (!subjectId || !input || !client) {
      return;
    }

    const { data, error } = await client.rpc("update_subject", {
      p_subject_id: subjectId,
      p_name: input.name,
      p_subject_code: input.subject_code,
      p_instructor: input.instructor,
      p_units: input.units,
      p_schedule_text: input.schedule_text,
      p_room: input.room,
    });
    if (error) {
      sendDatabaseError(response, error);
      return;
    }

    const parsed = subjectSchema.safeParse(data);
    if (!parsed.success) {
      sendInvalidDatabaseResponse(response);
      return;
    }
    response.json(parsed.data);
  });

  for (const [action, functionName] of [
    ["archive", "archive_subject"],
    ["restore", "restore_subject"],
  ] as const) {
    router.post(`/subjects/:subjectId/${action}`, async (request, response) => {
      const subjectId = parseId(request.params.subjectId, response);
      const client = getClient(request, response);
      if (!subjectId || !client) {
        return;
      }

      const { error } = await client.rpc(functionName, {
        p_subject_id: subjectId,
      });
      if (error) {
        sendDatabaseError(response, error);
        return;
      }
      response.json({ success: true });
    });
  }

  router.delete("/subjects/:subjectId", async (request, response) => {
    const subjectId = parseId(request.params.subjectId, response);
    const input = parseBody(deleteSubjectInputSchema, request, response);
    const client = getClient(request, response);
    if (!subjectId || !input || !client) {
      return;
    }

    const { data, error } = await client.rpc(
      "permanently_delete_archived_subject",
      {
        p_subject_id: subjectId,
        p_expected_updated_at: input.expected_updated_at,
      },
    );
    if (error) {
      sendDatabaseError(response, error);
      return;
    }

    const parsed = subjectDeletionResultSchema.safeParse(data);
    if (!parsed.success) {
      sendInvalidDatabaseResponse(response);
      return;
    }
    if (parsed.data.status === "review_required") {
      response.status(409).json({
        error: "The record changed. Review the updated deletion summary.",
        result: parsed.data,
      });
      return;
    }
    response.json(parsed.data);
  });

  return router;
}

export const academicRouter = createAcademicRouter();
