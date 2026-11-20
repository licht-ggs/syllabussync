import { describe, expect, it } from "vitest";
import {
  createTaskInputSchema,
  taskListQuerySchema,
  taskSchema,
  updateTaskInputSchema,
} from "./tasks.js";

const subjectId = "22222222-2222-4222-8222-222222222222";

const validTaskInput = {
  subject_id: subjectId,
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

describe("task schemas", () => {
  it("accepts an all-day task without timezone fields", () => {
    expect(createTaskInputSchema.safeParse(validTaskInput).success).toBe(true);
  });

  it("requires a resolved instant and timezone for timed deadlines", () => {
    const parsed = createTaskInputSchema.safeParse({
      ...validTaskInput,
      due_time: "09:30",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects incomplete timed deadline combinations", () => {
    expect(
      createTaskInputSchema.safeParse({
        ...validTaskInput,
        due_time: "09:30",
        due_timezone: "Asia/Manila",
        due_at: null,
      }).success,
    ).toBe(false);
    expect(
      createTaskInputSchema.safeParse({
        ...validTaskInput,
        due_time: "09:30",
        due_timezone: null,
        due_at: "2026-12-01T01:30:00Z",
      }).success,
    ).toBe(false);
  });

  it("rejects timezone or resolved-instant fields on all-day deadlines", () => {
    expect(
      createTaskInputSchema.safeParse({
        ...validTaskInput,
        due_timezone: "Asia/Manila",
      }).success,
    ).toBe(false);
    expect(
      createTaskInputSchema.safeParse({
        ...validTaskInput,
        due_at: "2026-12-01T01:30:00Z",
      }).success,
    ).toBe(false);
  });

  it("requires a custom type only when task type is Other", () => {
    expect(
      createTaskInputSchema.safeParse({
        ...validTaskInput,
        task_type: "Other",
      }).success,
    ).toBe(false);
    expect(
      createTaskInputSchema.safeParse({
        ...validTaskInput,
        task_type: "Quiz",
        custom_type: "Research",
      }).success,
    ).toBe(false);
  });

  it("allows missing expected versions so the API can return review_required", () => {
    expect(updateTaskInputSchema.safeParse(validTaskInput).success).toBe(true);
  });

  it("rejects contradictory task view and status filters", () => {
    expect(
      taskListQuerySchema.safeParse({
        view: "active",
        status: "Completed",
      }).success,
    ).toBe(false);
  });

  it("accepts persisted timed tasks that include PostgreSQL seconds", () => {
    const parsed = taskSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      user_id: "33333333-3333-4333-8333-333333333333",
      ...validTaskInput,
      due_time: "09:30:00",
      due_timezone: "Asia/Manila",
      due_at: "2026-12-01T01:30:00Z",
      status: "Not Started",
      version: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });

    expect(parsed.success).toBe(true);
  });
});
