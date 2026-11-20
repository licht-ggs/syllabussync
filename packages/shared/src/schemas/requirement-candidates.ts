import { z } from "zod";
import { taskSchema } from "./tasks.js";

const uuidSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,6})?)?$/);

export const requirementCategorySchema = z.enum([
  "assignment",
  "examination",
  "quiz",
  "project",
  "presentation",
  "laboratory",
  "report",
  "activity",
  "other",
]);

export const deadlineCertaintySchema = z.enum([
  "exact",
  "ambiguous",
  "relative",
  "unspecified",
]);

export const candidateReviewStatusSchema = z.enum([
  "pending_review",
  "edited",
  "approved",
  "rejected",
]);

export const requirementCandidateProposalSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000),
    category: requirementCategorySchema,
    source_page: z.number().int().min(1).max(200),
    evidence_excerpt: z.string().trim().min(1).max(1200),
    original_date_expression: z.string().trim().max(300).nullable(),
    normalized_due_date: dateSchema.nullable(),
    normalized_due_time: timeSchema.nullable(),
    deadline_certainty: deadlineCertaintySchema,
    confidence: z.number().min(0).max(1),
    ambiguity_notes: z.array(z.string().trim().min(1).max(300)).max(10),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (candidate.normalized_due_time && !candidate.normalized_due_date) {
      context.addIssue({
        code: "custom",
        path: ["normalized_due_date"],
        message: "A normalized time requires a normalized date.",
      });
    }
    if (
      candidate.deadline_certainty !== "exact" &&
      candidate.normalized_due_date
    ) {
      context.addIssue({
        code: "custom",
        path: ["normalized_due_date"],
        message: "Uncertain dates must remain unnormalized until reviewed.",
      });
    }
    if (
      candidate.deadline_certainty === "exact" &&
      !candidate.normalized_due_date
    ) {
      context.addIssue({
        code: "custom",
        path: ["normalized_due_date"],
        message: "An exact deadline requires a confirmed date.",
      });
    }
    if (
      candidate.deadline_certainty === "unspecified" &&
      candidate.original_date_expression
    ) {
      context.addIssue({
        code: "custom",
        path: ["original_date_expression"],
        message:
          "An unspecified deadline cannot contain a source date expression.",
      });
    }
  });

export const requirementCandidateProposalsSchema = z
  .array(requirementCandidateProposalSchema)
  .max(100);

export const requirementCandidateSchema =
  requirementCandidateProposalSchema.extend({
    id: uuidSchema,
    document_id: uuidSchema,
    owner_id: uuidSchema,
    subject_id: uuidSchema.nullable(),
    created_task_id: uuidSchema.nullable(),
    review_status: candidateReviewStatusSchema,
    extraction_provider: z.string().min(1).max(80),
    extraction_model: z.string().min(1).max(120),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    reviewed_at: z.string().datetime({ offset: true }).nullable(),
  });

export const requirementCandidateListSchema = z.array(
  requirementCandidateSchema,
);

export const updateRequirementCandidateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000),
    category: requirementCategorySchema,
    subject_id: uuidSchema.nullable(),
    original_date_expression: z.string().trim().max(300).nullable(),
    normalized_due_date: dateSchema.nullable(),
    normalized_due_time: timeSchema.nullable(),
    deadline_certainty: deadlineCertaintySchema,
  })
  .strict()
  .superRefine((candidate, context) => {
    if (candidate.normalized_due_time && !candidate.normalized_due_date) {
      context.addIssue({
        code: "custom",
        path: ["normalized_due_date"],
        message: "A normalized time requires a normalized date.",
      });
    }
    if (
      candidate.deadline_certainty !== "exact" &&
      candidate.normalized_due_date
    ) {
      context.addIssue({
        code: "custom",
        path: ["normalized_due_date"],
        message:
          "Confirm an exact date before saving it as a normalized deadline.",
      });
    }
    if (
      candidate.deadline_certainty === "exact" &&
      !candidate.normalized_due_date
    ) {
      context.addIssue({
        code: "custom",
        path: ["normalized_due_date"],
        message: "An exact deadline requires a confirmed date.",
      });
    }
  });

export const editRequirementCandidateRequestSchema =
  updateRequirementCandidateSchema.extend({
    expected_updated_at: z.string().datetime({ offset: true }),
  });

export const candidateTaskCreationSchema = z
  .object({
    subject_id: uuidSchema,
    due_date: dateSchema,
    due_time: timeSchema.nullable(),
    due_timezone: z.string().min(1).max(100).nullable(),
    due_at: z.string().datetime({ offset: true }).nullable(),
    priority: z.enum(["Low", "Normal", "High", "Urgent"]),
    estimated_duration_minutes: z.number().int().positive().nullable(),
    reference_url: z.string().url().max(2048).nullable(),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (candidate.due_time === null) {
      if (candidate.due_timezone !== null || candidate.due_at !== null) {
        context.addIssue({
          code: "custom",
          path: ["due_time"],
          message:
            "All-day deadlines cannot include a timezone or resolved instant.",
        });
      }
    } else if (candidate.due_timezone === null || candidate.due_at === null) {
      context.addIssue({
        code: "custom",
        path: ["due_time"],
        message: "Timed deadlines require a timezone and resolved instant.",
      });
    }
  });

export const candidateTaskApprovalResultSchema = z.object({
  status: z.literal("created"),
  candidate_id: uuidSchema,
  task: taskSchema,
});

export type RequirementCandidateProposal = z.infer<
  typeof requirementCandidateProposalSchema
>;
export type RequirementCandidate = z.infer<typeof requirementCandidateSchema>;
export type UpdateRequirementCandidate = z.infer<
  typeof updateRequirementCandidateSchema
>;
export type CandidateTaskCreationInput = z.infer<
  typeof candidateTaskCreationSchema
>;
