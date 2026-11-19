import { z } from "zod";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const dateSchema = z.iso.date();

const academicPeriodFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a period name.")
    .max(120, "Period names must be 120 characters or fewer."),
  start_date: dateSchema.nullable(),
  end_date: dateSchema.nullable(),
});

function hasValidDateOrder({
  start_date,
  end_date,
}: {
  start_date: string | null;
  end_date: string | null;
}) {
  return start_date === null || end_date === null || end_date >= start_date;
}

const dateOrderMessage = {
  path: ["end_date"],
  message: "The end date must be on or after the start date.",
};

const subjectFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a subject name.")
    .max(160, "Subject names must be 160 characters or fewer."),
  subject_code: z.string().trim().max(40).nullable(),
  instructor: z.string().trim().max(120).nullable(),
  units: z.number().finite().min(0).max(9999.99).multipleOf(0.01).nullable(),
  schedule_text: z.string().trim().max(2000).nullable(),
  room: z.string().trim().max(120).nullable(),
});

export const academicYearSchema = z.object({
  id: uuidSchema,
  user_id: uuidSchema,
  name: z.string().trim().min(1).max(120),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

export const academicPeriodSchema = z.object({
  id: uuidSchema,
  user_id: uuidSchema,
  academic_year_id: uuidSchema,
  name: z.string().trim().min(1).max(120),
  start_date: dateSchema.nullable(),
  end_date: dateSchema.nullable(),
  archived_at: timestampSchema.nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

export const subjectSchema = z.object({
  id: uuidSchema,
  user_id: uuidSchema,
  academic_period_id: uuidSchema,
  name: z.string().trim().min(1).max(160),
  subject_code: z.string().max(40).nullable(),
  instructor: z.string().max(120).nullable(),
  units: z.number().min(0).max(9999.99).multipleOf(0.01).nullable(),
  schedule_text: z.string().max(2000).nullable(),
  room: z.string().max(120).nullable(),
  is_active: z.boolean(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

export const academicWorkspaceSchema = z.object({
  academic_years: z.array(academicYearSchema),
  academic_periods: z.array(academicPeriodSchema),
  subjects: z.array(subjectSchema),
  current_academic_period_id: uuidSchema.nullable(),
});

export const academicYearInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter an academic year name.")
    .max(120, "Academic year names must be 120 characters or fewer."),
});

export const academicPeriodCreateSchema = academicPeriodFieldsSchema
  .extend({ academic_year_id: uuidSchema })
  .refine(hasValidDateOrder, dateOrderMessage);

export const academicPeriodUpdateSchema = academicPeriodFieldsSchema.refine(
  hasValidDateOrder,
  dateOrderMessage,
);

export const subjectCreateSchema = subjectFieldsSchema.extend({
  academic_period_id: uuidSchema,
});

export const subjectUpdateSchema = subjectFieldsSchema;

export const deleteAcademicYearInputSchema = z.object({
  expected_period_count: z.number().int().nonnegative(),
  expected_updated_at: timestampSchema,
});

export const deleteAcademicPeriodInputSchema = z.object({
  expected_subject_count: z.number().int().nonnegative(),
  expected_updated_at: timestampSchema,
});

export const deleteSubjectInputSchema = z.object({
  expected_updated_at: timestampSchema,
});

const academicYearDeletionSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  period_count: z.number().int().nonnegative(),
  updated_at: timestampSchema,
});

const academicPeriodDeletionSummarySchema = z.object({
  id: uuidSchema,
  academic_year_id: uuidSchema,
  name: z.string(),
  subject_count: z.number().int().nonnegative(),
  updated_at: timestampSchema,
});

const subjectDeletionSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  subject_code: z.string().nullable(),
  instructor: z.string().nullable(),
  updated_at: timestampSchema,
});

export const academicYearDeletionResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("deleted") }),
  z.object({
    status: z.literal("blocked"),
    academic_year: academicYearDeletionSummarySchema,
  }),
  z.object({
    status: z.literal("review_required"),
    academic_year: academicYearDeletionSummarySchema,
  }),
]);

export const academicPeriodDeletionResultSchema = z.discriminatedUnion(
  "status",
  [
    z.object({ status: z.literal("deleted") }),
    z.object({
      status: z.literal("review_required"),
      academic_period: academicPeriodDeletionSummarySchema,
    }),
  ],
);

export const subjectDeletionResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("deleted") }),
  z.object({
    status: z.literal("review_required"),
    subject: subjectDeletionSummarySchema,
  }),
]);

export type AcademicPeriod = z.infer<typeof academicPeriodSchema>;
export type AcademicWorkspace = z.infer<typeof academicWorkspaceSchema>;
export type AcademicYear = z.infer<typeof academicYearSchema>;
export type Subject = z.infer<typeof subjectSchema>;
