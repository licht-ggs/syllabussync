import { z } from "zod";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const dateSchema = z.iso.date();

export const taskTypeSchema = z.enum([
  "Assignment",
  "Quiz",
  "Examination",
  "Project",
  "Activity",
  "Laboratory",
  "Practical Exam",
  "Other",
]);

export const taskPrioritySchema = z.enum(["Low", "Normal", "High", "Urgent"]);
export const taskStatusSchema = z.enum([
  "Not Started",
  "In Progress",
  "Completed",
]);

const taskTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/);
const taskTimeInputSchema = taskTimeSchema;

function validateTaskFields(
  task: {
    task_type: z.infer<typeof taskTypeSchema>;
    custom_type: string | null;
    due_time: string | null;
    due_timezone: string | null;
    due_at: string | null;
  },
  context: z.RefinementCtx,
) {
  if (task.task_type === "Other") {
    if (!task.custom_type?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["custom_type"],
        message: "Enter a custom task type.",
      });
    }
  } else if (task.custom_type !== null) {
    context.addIssue({
      code: "custom",
      path: ["custom_type"],
      message: "A custom type is only allowed for Other.",
    });
  }

  if (task.due_time === null) {
    if (task.due_timezone !== null || task.due_at !== null) {
      context.addIssue({
        code: "custom",
        path: ["due_time"],
        message: "All-day deadlines cannot include a time or timezone.",
      });
    }
  } else if (task.due_timezone === null || task.due_at === null) {
    context.addIssue({
      code: "custom",
      path: ["due_time"],
      message: "Timed deadlines require a timezone and resolved instant.",
    });
  }
}

const taskWriteFields = {
  subject_id: uuidSchema,
  title: z.string().trim().min(1, "Enter a task title."),
  description: z.string().nullable(),
  task_type: taskTypeSchema,
  custom_type: z.string().nullable(),
  due_date: dateSchema,
  due_time: taskTimeInputSchema.nullable(),
  due_timezone: z.string().trim().min(1).nullable(),
  due_at: timestampSchema.nullable(),
  priority: taskPrioritySchema,
  estimated_duration_minutes: z.number().int().positive().nullable(),
  reference_url: z.string().url().nullable(),
};

export const createTaskInputSchema = z
  .object(taskWriteFields)
  .strict()
  .superRefine(validateTaskFields);

export const updateTaskInputSchema = z
  .object({
    ...taskWriteFields,
    expected_version: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .superRefine(validateTaskFields);

export const updateTaskStatusInputSchema = z
  .object({
    status: taskStatusSchema,
    expected_version: z.number().int().positive().nullable().optional(),
  })
  .strict();

export const deleteTaskInputSchema = z
  .object({
    expected_version: z.number().int().positive().nullable().optional(),
  })
  .strict();

const optionalQueryText = (maxLength: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(maxLength).optional(),
  );

export const taskListQuerySchema = z
  .object({
    view: z.enum(["active", "completed"]).default("active"),
    status: taskStatusSchema.optional(),
    subject_id: uuidSchema.optional(),
    task_type: taskTypeSchema.optional(),
    priority: taskPrioritySchema.optional(),
    search: optionalQueryText(100),
    sort: z.enum(["due_date_asc", "due_date_desc"]).default("due_date_asc"),
    limit: z.preprocess(
      (value) => (value === undefined ? 20 : Number(value)),
      z.number().int().min(1).max(100),
    ),
    cursor: optionalQueryText(1024),
  })
  .strict()
  .superRefine((query, context) => {
    if (query.status === "Completed" && query.view === "active") {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Completed status is only available in the completed view.",
      });
    }

    if (
      query.status !== undefined &&
      query.status !== "Completed" &&
      query.view === "completed"
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "The completed view only includes completed tasks.",
      });
    }
  });

export const taskCursorSchema = z.object({
  due_date: dateSchema,
  due_time: taskTimeSchema.nullable(),
  id: uuidSchema,
  sort: z.enum(["due_date_asc", "due_date_desc"]),
  filters: z.string(),
});

export const taskSchema = z
  .object({
    id: uuidSchema,
    user_id: uuidSchema,
    subject_id: uuidSchema,
    title: z.string().min(1),
    description: z.string().nullable(),
    task_type: taskTypeSchema,
    custom_type: z.string().nullable(),
    due_date: dateSchema,
    due_time: taskTimeSchema.nullable(),
    due_timezone: z.string().nullable(),
    due_at: timestampSchema.nullable(),
    priority: taskPrioritySchema,
    status: taskStatusSchema,
    estimated_duration_minutes: z.number().int().positive().nullable(),
    reference_url: z.string().nullable(),
    version: z.number().int().positive(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .superRefine(validateTaskFields);

export const taskHistoryEventSchema = z.object({
  id: uuidSchema,
  task_id: uuidSchema,
  user_id: uuidSchema,
  event_type: z.enum([
    "status_changed",
    "deadline_changed",
    "subject_reassigned",
  ]),
  old_values: z.record(z.string(), z.unknown()),
  new_values: z.record(z.string(), z.unknown()),
  changed_at: timestampSchema,
});

export const taskListResponseSchema = z.object({
  tasks: z.array(taskSchema),
  next_cursor: z.string().nullable(),
  preferred_timezone: z.string().min(1),
});

export const taskHistoryListResponseSchema = z.object({
  history: z.array(taskHistoryEventSchema),
  next_cursor: z.string().nullable(),
});

export const taskMutationResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("created"), task: taskSchema }),
  z.object({ status: z.literal("updated"), task: taskSchema }),
  z.object({ status: z.literal("review_required"), task: taskSchema }),
]);

export const deleteTaskResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("deleted") }),
  z.object({ status: z.literal("review_required"), task: taskSchema }),
]);

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
export type Task = z.infer<typeof taskSchema>;
export type TaskHistoryEvent = z.infer<typeof taskHistoryEventSchema>;
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskType = z.infer<typeof taskTypeSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;
