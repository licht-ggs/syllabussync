import { z } from "zod";

const uuidSchema = z.string().uuid();

export const documentProcessingStatusSchema = z.enum([
  "uploading",
  "uploaded",
  "upload_failed",
  "deletion_pending",
  "queued",
  "processing",
  "text_extracted",
  "processing_failed",
]);

export const documentProcessingJobStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
]);

export const documentProcessingErrorSchema = z.enum([
  "source_unavailable",
  "invalid_pdf",
  "page_limit_exceeded",
  "render_failed",
  "ocr_failed",
  "partial_page_failure",
  "worker_error",
]);

export const documentPageSchema = z.object({
  document_id: uuidSchema,
  owner_id: uuidSchema,
  page_number: z.number().int().min(1).max(200),
  extracted_text: z.string(),
  extraction_method: z.enum(["native_text", "ocr", "mixed", "none"]),
  extraction_status: z.enum(["completed", "partial", "failed"]),
  error_code: z
    .enum(["native_extraction_failed", "render_failed", "ocr_failed"])
    .nullable(),
  updated_at: z.string().datetime({ offset: true }),
});

export const documentPageListSchema = z.array(documentPageSchema);

export const documentProcessingJobSchema = z.object({
  id: uuidSchema,
  document_id: uuidSchema,
  owner_id: uuidSchema,
  generation: z.number().int().positive(),
  status: documentProcessingJobStatusSchema,
  progress_percent: z.number().int().min(0).max(100),
  attempt_count: z.number().int().min(0).max(3),
  error_code: documentProcessingErrorSchema.nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  started_at: z.string().datetime({ offset: true }).nullable(),
  completed_at: z.string().datetime({ offset: true }).nullable(),
});

export const documentSchema = z.object({
  id: uuidSchema,
  owner_id: uuidSchema,
  subject_id: uuidSchema.nullable(),
  filename: z.string().min(1).max(255),
  content_type: z.literal("application/pdf"),
  file_size: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  page_count: z.number().int().positive().max(200),
  processing_status: documentProcessingStatusSchema,
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const documentLibraryItemSchema = documentSchema.extend({
  processing_progress_percent: z.number().int().min(0).max(100).nullable(),
  processing_error_code: documentProcessingErrorSchema.nullable(),
});

export const documentListSchema = z.array(documentSchema);
export const documentLibrarySchema = z.array(documentLibraryItemSchema);

export const createDocumentInputSchema = z
  .object({
    subject_id: uuidSchema.nullable().optional(),
  })
  .strict();

export type AcademicDocument = z.infer<typeof documentSchema>;
export type DocumentLibraryItem = z.infer<typeof documentLibraryItemSchema>;
export type AcademicDocumentPage = z.infer<typeof documentPageSchema>;
export type DocumentProcessingJob = z.infer<typeof documentProcessingJobSchema>;
