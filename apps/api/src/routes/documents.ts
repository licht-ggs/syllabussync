import {
  createDocumentInputSchema,
  documentLibrarySchema,
  documentListSchema,
  documentPageListSchema,
  documentProcessingJobSchema,
  documentSchema,
  candidateTaskCreationSchema,
  candidateTaskApprovalResultSchema,
  editRequirementCandidateRequestSchema,
  requirementCandidateListSchema,
  requirementCandidateSchema,
} from "@syllabussync/shared";
import { randomUUID, createHash } from "node:crypto";
import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { createSupabaseClient } from "../services/supabase.js";

const BUCKET = "academic-documents";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 200;
const uuidSchema = z.string().uuid();
const documentWithStoragePathSchema = documentSchema.extend({
  storage_path: z.string().min(1),
});
type ClientFactory = typeof createSupabaseClient;

function sendError(response: Response, status: number, error: string) {
  response.status(status).json({ error });
}

function parseFilename(value: string | undefined) {
  if (!value || value.length > 1024) return null;
  let filename: string;
  try {
    filename = decodeURIComponent(value);
  } catch {
    return null;
  }
  filename =
    filename
      .split(/[\\/]/)
      .at(-1)
      ?.split("")
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code !== 127;
      })
      .join("")
      .trim() ?? "";
  if (
    !filename ||
    filename.length > 255 ||
    !filename.toLowerCase().endsWith(".pdf")
  )
    return null;
  return filename;
}

export async function inspectPdf(data: Buffer) {
  if (
    data.length < 8 ||
    data.length > MAX_FILE_BYTES ||
    data.subarray(0, 5).toString("ascii") !== "%PDF-"
  ) {
    return null;
  }

  let loadingTask: ReturnType<typeof getDocument> | undefined;
  try {
    loadingTask = getDocument({
      data: new Uint8Array(data),
      stopAtErrors: true,
    });
    const pdf = await loadingTask.promise;
    const pages = pdf.numPages;
    await loadingTask.destroy();
    return pages > 0 && pages <= MAX_PAGES ? pages : null;
  } catch {
    await loadingTask?.destroy().catch(() => undefined);
    return null;
  }
}

function getClient(
  request: Request,
  response: Response,
  factory: ClientFactory,
) {
  if (!request.authUser || !request.supabaseAccessToken) {
    sendError(response, 401, "Authentication required");
    return null;
  }
  return factory(request.supabaseAccessToken);
}

function parseDocumentId(value: string | undefined, response: Response) {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    sendError(response, 400, "Invalid request");
    return null;
  }
  return parsed.data;
}

export function createDocumentRouter(
  authMiddleware: RequestHandler = requireAuth,
  clientFactory: ClientFactory = createSupabaseClient,
) {
  const router = Router();
  router.use(authMiddleware);

  router.get("/", async (request, response) => {
    const client = getClient(request, response, clientFactory);
    if (!client || !request.authUser) return;
    const { data, error } = await client
      .from("academic_documents")
      .select(
        "id, owner_id, subject_id, filename, content_type, file_size, sha256, page_count, processing_status, created_at, updated_at",
      )
      .eq("owner_id", request.authUser.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100);
    const parsed = documentListSchema.safeParse(data);
    if (error || !parsed.success)
      return sendError(response, 500, "Documents could not be loaded.");
    const ids = parsed.data.map((document) => document.id);
    const jobsResult = ids.length
      ? await client
          .from("academic_document_processing_jobs")
          .select("document_id, generation, progress_percent, error_code")
          .eq("owner_id", request.authUser.id)
          .in("document_id", ids)
          .order("generation", { ascending: false })
      : { data: [], error: null };
    if (jobsResult.error)
      return sendError(response, 500, "Documents could not be loaded.");
    const latestJob = new Map<string, (typeof jobsResult.data)[number]>();
    for (const job of jobsResult.data ?? []) {
      if (!latestJob.has(job.document_id)) latestJob.set(job.document_id, job);
    }
    const library = documentLibrarySchema.safeParse(
      parsed.data.map((document) => {
        const job = latestJob.get(document.id);
        return {
          ...document,
          processing_progress_percent: job?.progress_percent ?? null,
          processing_error_code: job?.error_code ?? null,
        };
      }),
    );
    if (!library.success)
      return sendError(response, 500, "Documents could not be loaded.");
    response.json(library.data);
  });

  router.post("/", async (request, response) => {
    const client = getClient(request, response, clientFactory);
    if (!client || !request.authUser) return;
    if (!Buffer.isBuffer(request.body))
      return sendError(response, 400, "Upload a PDF document.");
    const filename = parseFilename(request.get("x-document-filename"));
    if (!filename)
      return sendError(response, 400, "Choose a valid PDF filename.");
    const input = createDocumentInputSchema.safeParse({
      subject_id: request.get("x-subject-id") || null,
    });
    if (!input.success)
      return sendError(response, 400, "Invalid document details.");
    const pageCount = await inspectPdf(request.body);
    if (!pageCount)
      return sendError(
        response,
        400,
        "This PDF is invalid, encrypted, or exceeds the upload limits.",
      );

    if (input.data.subject_id) {
      const { data: subject, error } = await client
        .from("subjects")
        .select("id")
        .eq("id", input.data.subject_id)
        .eq("user_id", request.authUser.id)
        .maybeSingle();
      if (error)
        return sendError(response, 500, "The document could not be uploaded.");
      if (!subject) return sendError(response, 404, "Subject not found.");
    }

    const id = randomUUID();
    const storagePath = `${request.authUser.id}/${id}.pdf`;
    const sha256 = createHash("sha256").update(request.body).digest("hex");
    const { data: duplicate, error: duplicateError } = await client
      .from("academic_documents")
      .select("id")
      .eq("owner_id", request.authUser.id)
      .eq("sha256", sha256)
      .maybeSingle();
    if (duplicateError)
      return sendError(response, 500, "The document could not be uploaded.");
    if (duplicate)
      return sendError(
        response,
        409,
        "This PDF is already in your document library.",
      );
    const { data: registered, error: registerError } = await client.rpc(
      "register_academic_document",
      {
        p_id: id,
        p_subject_id: input.data.subject_id,
        p_filename: filename,
        p_file_size: request.body.length,
        p_sha256: sha256,
        p_page_count: pageCount,
        p_storage_path: storagePath,
      },
    );
    const registeredDocument = documentSchema.safeParse(registered);
    if (registerError)
      return sendError(
        response,
        registerError.code === "23505" ? 409 : 500,
        registerError.code === "23505"
          ? "This PDF is already in your document library."
          : "The document could not be registered.",
      );
    if (!registeredDocument.success)
      return sendError(response, 500, "The document could not be registered.");

    const { error: uploadError } = await client.storage
      .from(BUCKET)
      .upload(storagePath, request.body, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) {
      await client.rpc("set_academic_document_upload_status", {
        p_id: id,
        p_status: "upload_failed",
      });
      return sendError(
        response,
        503,
        "The document could not be stored. You can delete this failed upload and try again.",
      );
    }

    const { data: finalized, error: finalizeError } = await client.rpc(
      "set_academic_document_upload_status",
      {
        p_id: id,
        p_status: "uploaded",
      },
    );
    const parsed = documentSchema.safeParse(finalized);
    if (finalizeError || !parsed.success) {
      return sendError(
        response,
        503,
        "The file was stored, but its status could not be confirmed. Refresh your document list before retrying.",
      );
    }
    const queued = await client.rpc("queue_academic_document_processing", {
      p_document_id: id,
    });
    response.status(201).json({
      ...parsed.data,
      processing_status: queued.error ? "uploaded" : "queued",
    });
  });

  router.post("/:documentId/retry-upload", async (request, response) => {
    const id = parseDocumentId(request.params.documentId, response);
    const client = getClient(request, response, clientFactory);
    if (!id || !client || !request.authUser) return;
    if (!Buffer.isBuffer(request.body))
      return sendError(
        response,
        400,
        "Select the original PDF to retry this upload.",
      );
    const pageCount = await inspectPdf(request.body);
    if (!pageCount)
      return sendError(
        response,
        400,
        "This PDF is invalid, encrypted, or exceeds the upload limits.",
      );

    const { data: document, error } = await client
      .from("academic_documents")
      .select("id, sha256, page_count, storage_path, processing_status")
      .eq("id", id)
      .eq("owner_id", request.authUser.id)
      .maybeSingle();
    if (error)
      return sendError(response, 500, "The document could not be loaded.");
    if (!document) return sendError(response, 404, "Document not found.");
    if (document.processing_status !== "upload_failed")
      return sendError(
        response,
        409,
        "This document is not eligible for upload retry.",
      );
    const sha256 = createHash("sha256").update(request.body).digest("hex");
    if (sha256 !== document.sha256 || pageCount !== document.page_count)
      return sendError(
        response,
        409,
        "Select the same PDF that was originally uploaded.",
      );

    const { error: uploadError } = await client.storage
      .from(BUCKET)
      .upload(document.storage_path, request.body, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadError)
      return sendError(
        response,
        503,
        "The document is still unavailable. Retry later.",
      );
    const { data: updated, error: updateError } = await client.rpc(
      "set_academic_document_upload_status",
      {
        p_id: id,
        p_status: "uploaded",
      },
    );
    const parsed = documentSchema.safeParse(updated);
    if (updateError || !parsed.success)
      return sendError(
        response,
        503,
        "The file was stored, but its status could not be confirmed.",
      );
    const queued = await client.rpc("queue_academic_document_processing", {
      p_document_id: id,
    });
    response.json({
      ...parsed.data,
      processing_status: queued.error ? "uploaded" : "queued",
    });
  });

  router.post("/:documentId/process", async (request, response) => {
    const id = parseDocumentId(request.params.documentId, response);
    const client = getClient(request, response, clientFactory);
    if (!id || !client) return;
    const { data, error } = await client.rpc(
      "queue_academic_document_processing",
      {
        p_document_id: id,
      },
    );
    if (error)
      return sendError(
        response,
        error.code === "P0002" ? 404 : error.code === "22023" ? 409 : 500,
        error.code === "P0002"
          ? "Document not found."
          : error.code === "22023"
            ? "This document cannot be processed in its current state."
            : "Document processing could not be started.",
      );
    const job = documentProcessingJobSchema.safeParse(data);
    if (!job.success)
      return sendError(
        response,
        500,
        "Document processing could not be started.",
      );
    response.status(202).json(job.data);
  });

  router.get("/:documentId/pages", async (request, response) => {
    const id = parseDocumentId(request.params.documentId, response);
    const client = getClient(request, response, clientFactory);
    if (!id || !client || !request.authUser) return;
    const { data: document, error: documentError } = await client
      .from("academic_documents")
      .select("processing_status")
      .eq("id", id)
      .eq("owner_id", request.authUser.id)
      .maybeSingle();
    if (documentError)
      return sendError(response, 500, "Extracted pages could not be loaded.");
    if (!document) return sendError(response, 404, "Document not found.");
    if (
      !["text_extracted", "processing_failed"].includes(
        document.processing_status,
      )
    )
      return sendError(response, 409, "Document text is not ready yet.");
    const pagesResult = await client
      .from("academic_document_pages")
      .select(
        "document_id, owner_id, page_number, extracted_text, extraction_method, extraction_status, error_code, updated_at",
      )
      .eq("document_id", id)
      .eq("owner_id", request.authUser.id)
      .order("page_number", { ascending: true });
    const pages = documentPageListSchema.safeParse(pagesResult.data);
    if (pagesResult.error || !pages.success)
      return sendError(response, 500, "Extracted pages could not be loaded.");
    response.json(pages.data);
  });

  router.get("/:documentId/candidates", async (request, response) => {
    const id = parseDocumentId(request.params.documentId, response);
    const client = getClient(request, response, clientFactory);
    if (!id || !client || !request.authUser) return;
    const { data: document, error: documentError } = await client
      .from("academic_documents")
      .select("processing_status")
      .eq("id", id)
      .eq("owner_id", request.authUser.id)
      .maybeSingle();
    if (documentError)
      return sendError(response, 500, "Requirements could not be loaded.");
    if (!document) return sendError(response, 404, "Document not found.");
    if (
      !["text_extracted", "processing_failed"].includes(
        document.processing_status,
      )
    )
      return sendError(response, 409, "Page text is not ready for review.");
    const { data, error } = await client
      .from("academic_requirement_candidates")
      .select(
        "id, document_id, owner_id, subject_id, title, description, category, source_page, evidence_excerpt, original_date_expression, normalized_due_date, normalized_due_time, deadline_certainty, confidence, ambiguity_notes, review_status, extraction_provider, extraction_model, created_task_id, created_at, updated_at, reviewed_at",
      )
      .eq("document_id", id)
      .eq("owner_id", request.authUser.id)
      .order("source_page", { ascending: true })
      .order("id", { ascending: true });
    const parsed = requirementCandidateListSchema.safeParse(data);
    if (error || !parsed.success)
      return sendError(response, 500, "Requirements could not be loaded.");
    response.json(parsed.data);
  });

  router.patch(
    "/:documentId/candidates/:candidateId",
    async (request, response) => {
      const documentId = parseDocumentId(request.params.documentId, response);
      const candidateId = parseDocumentId(request.params.candidateId, response);
      const client = getClient(request, response, clientFactory);
      const input = editRequirementCandidateRequestSchema.safeParse(
        request.body,
      );
      if (!documentId || !candidateId || !client || !request.authUser) return;
      if (!input.success)
        return sendError(response, 400, "Invalid requirement details.");

      if (input.data.subject_id) {
        const { data: subject, error } = await client
          .from("subjects")
          .select("id")
          .eq("id", input.data.subject_id)
          .eq("user_id", request.authUser.id)
          .maybeSingle();
        if (error)
          return sendError(
            response,
            500,
            "The requirement could not be saved.",
          );
        if (!subject) return sendError(response, 404, "Subject not found.");
      }

      const { expected_updated_at: expectedUpdatedAt, ...fields } = input.data;
      const { data, error } = await client
        .from("academic_requirement_candidates")
        .update({ ...fields, review_status: "edited" })
        .eq("id", candidateId)
        .eq("document_id", documentId)
        .eq("owner_id", request.authUser.id)
        .eq("updated_at", expectedUpdatedAt)
        .in("review_status", ["pending_review", "edited"])
        .is("created_task_id", null)
        .select(
          "id, document_id, owner_id, subject_id, title, description, category, source_page, evidence_excerpt, original_date_expression, normalized_due_date, normalized_due_time, deadline_certainty, confidence, ambiguity_notes, review_status, extraction_provider, extraction_model, created_task_id, created_at, updated_at, reviewed_at",
        )
        .maybeSingle();
      const parsed = requirementCandidateSchema.safeParse(data);
      if (error || !parsed.success)
        return sendError(
          response,
          error?.code === "23503" ? 400 : 409,
          "This requirement changed or is no longer editable. Reload and review it again.",
        );
      response.json(parsed.data);
    },
  );

  router.post(
    "/:documentId/candidates/:candidateId/reject",
    async (request, response) => {
      const documentId = parseDocumentId(request.params.documentId, response);
      const candidateId = parseDocumentId(request.params.candidateId, response);
      const client = getClient(request, response, clientFactory);
      if (!documentId || !candidateId || !client || !request.authUser) return;
      const { data: document, error: documentError } = await client
        .from("academic_documents")
        .select("id")
        .eq("id", documentId)
        .eq("owner_id", request.authUser.id)
        .maybeSingle();
      if (documentError)
        return sendError(
          response,
          500,
          "The requirement could not be rejected.",
        );
      if (!document) return sendError(response, 404, "Document not found.");
      const { data: candidate, error: candidateError } = await client
        .from("academic_requirement_candidates")
        .select("id")
        .eq("id", candidateId)
        .eq("document_id", documentId)
        .eq("owner_id", request.authUser.id)
        .maybeSingle();
      if (candidateError)
        return sendError(
          response,
          500,
          "The requirement could not be rejected.",
        );
      if (!candidate) return sendError(response, 404, "Requirement not found.");
      const { data, error } = await client.rpc(
        "reject_academic_requirement_candidate",
        {
          p_candidate_id: candidateId,
        },
      );
      const parsed = requirementCandidateSchema.safeParse(data);
      if (error || !parsed.success)
        return sendError(
          response,
          error?.code === "P0002" ? 409 : 500,
          "This requirement was already reviewed or could not be rejected.",
        );
      if (parsed.data.document_id !== documentId)
        return sendError(response, 404, "Requirement not found.");
      response.json(parsed.data);
    },
  );

  router.post(
    "/:documentId/candidates/:candidateId/approve",
    async (request, response) => {
      const documentId = parseDocumentId(request.params.documentId, response);
      const candidateId = parseDocumentId(request.params.candidateId, response);
      const client = getClient(request, response, clientFactory);
      const input = candidateTaskCreationSchema.safeParse(request.body);
      if (!documentId || !candidateId || !client || !request.authUser) return;
      if (!input.success)
        return sendError(
          response,
          400,
          "Choose a subject and confirm a valid deadline before creating a task.",
        );

      const { data: candidate, error: candidateError } = await client
        .from("academic_requirement_candidates")
        .select(
          "id, document_id, owner_id, subject_id, deadline_certainty, normalized_due_date, review_status, created_task_id",
        )
        .eq("id", candidateId)
        .eq("document_id", documentId)
        .eq("owner_id", request.authUser.id)
        .maybeSingle();
      if (candidateError)
        return sendError(
          response,
          500,
          "The requirement could not be approved.",
        );
      if (!candidate) return sendError(response, 404, "Requirement not found.");
      if (candidate.subject_id !== input.data.subject_id)
        return sendError(
          response,
          409,
          "Save the selected subject before creating a task.",
        );
      if (
        candidate.deadline_certainty !== "exact" ||
        candidate.normalized_due_date !== input.data.due_date
      )
        return sendError(
          response,
          409,
          "Confirm an exact deadline on the requirement before creating a task.",
        );

      const { data, error } = await client.rpc(
        "approve_academic_requirement_candidate",
        {
          p_candidate_id: candidateId,
          p_subject_id: input.data.subject_id,
          p_due_date: input.data.due_date,
          p_due_time: input.data.due_time,
          p_due_timezone: input.data.due_timezone,
          p_due_at: input.data.due_at,
          p_priority: input.data.priority,
          p_estimated_duration_minutes: input.data.estimated_duration_minutes,
          p_reference_url: input.data.reference_url,
        },
      );
      if (error)
        return sendError(
          response,
          error.code === "P0002" ? 409 : error.code === "22023" ? 400 : 500,
          "The task could not be created from this requirement.",
        );
      const result = candidateTaskApprovalResultSchema.safeParse(data);
      if (!result.success || result.data.candidate_id !== candidateId)
        return sendError(response, 500, "The task could not be confirmed.");
      response.status(201).json(result.data);
    },
  );

  router.get("/:documentId", async (request, response) => {
    const id = parseDocumentId(request.params.documentId, response);
    const client = getClient(request, response, clientFactory);
    if (!id || !client || !request.authUser) return;
    const { data, error } = await client
      .from("academic_documents")
      .select(
        "id, owner_id, subject_id, filename, content_type, file_size, sha256, page_count, processing_status, created_at, updated_at",
      )
      .eq("id", id)
      .eq("owner_id", request.authUser.id)
      .maybeSingle();
    if (error)
      return sendError(response, 500, "The document could not be loaded.");
    if (!data) return sendError(response, 404, "Document not found.");
    const parsed = documentSchema.safeParse(data);
    if (!parsed.success)
      return sendError(response, 500, "The document could not be loaded.");
    response.json(parsed.data);
  });

  router.get("/:documentId/content", async (request, response) => {
    const id = parseDocumentId(request.params.documentId, response);
    const client = getClient(request, response, clientFactory);
    if (!id || !client || !request.authUser) return;
    const { data, error } = await client
      .from("academic_documents")
      .select("storage_path, filename, processing_status")
      .eq("id", id)
      .eq("owner_id", request.authUser.id)
      .maybeSingle();
    if (error)
      return sendError(response, 500, "The document could not be opened.");
    if (!data) return sendError(response, 404, "Document not found.");
    if (
      ["uploading", "upload_failed", "deletion_pending"].includes(
        data.processing_status,
      )
    )
      return sendError(response, 409, "This PDF is not available yet.");
    const file = await client.storage.from(BUCKET).download(data.storage_path);
    if (file.error || !file.data)
      return sendError(response, 404, "Document file not found.");
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      'inline; filename="document.pdf"',
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(Buffer.from(await file.data.arrayBuffer()));
  });

  router.delete("/:documentId", async (request, response) => {
    const id = parseDocumentId(request.params.documentId, response);
    const client = getClient(request, response, clientFactory);
    if (!id || !client) return;
    const { data, error } = await client.rpc(
      "mark_academic_document_deletion_pending",
      { p_id: id },
    );
    const document = documentWithStoragePathSchema.safeParse(data);
    if (error)
      return sendError(
        response,
        error.code === "P0002" ? 404 : 500,
        error.code === "P0002"
          ? "Document not found."
          : "Document deletion could not be started.",
      );
    if (!document.success)
      return sendError(
        response,
        500,
        "Document deletion could not be started.",
      );

    const { error: storageError } = await client.storage
      .from(BUCKET)
      .remove([document.data.storage_path]);
    if (storageError)
      return sendError(
        response,
        503,
        "Document deletion is pending. Retry deletion later.",
      );
    const { error: deleteError } = await client.rpc(
      "complete_academic_document_deletion",
      { p_id: id },
    );
    if (deleteError)
      return sendError(
        response,
        503,
        "The file is deleted; document cleanup is pending and can be retried.",
      );
    response.status(204).end();
  });

  return router;
}

export const documentRouter = createDocumentRouter();
