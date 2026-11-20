import { describe, expect, it } from "vitest";
import {
  dateInTimeZone,
  formatDateOnly,
  isTaskOverdue,
  resolveLocalDateTime,
} from "./task-date-time.js";

describe("task date and time helpers", () => {
  it("preserves date-only values without shifting calendar days", () => {
    expect(formatDateOnly("2026-01-01", "en-US")).toBe("Jan 1, 2026");
  });

  it("resolves a valid local deadline to its matching instant", () => {
    expect(resolveLocalDateTime("2026-12-01", "09:30", "Asia/Manila")).toEqual({
      kind: "resolved",
      instants: ["2026-12-01T01:30:00.000Z"],
    });
  });

  it("rejects nonexistent daylight-saving wall times", () => {
    expect(
      resolveLocalDateTime("2026-03-08", "02:30", "America/New_York"),
    ).toEqual({ kind: "resolved", instants: [] });
  });

  it("returns both explicit choices for an ambiguous wall time", () => {
    expect(
      resolveLocalDateTime("2026-11-01", "01:30", "America/New_York"),
    ).toEqual({
      kind: "resolved",
      instants: ["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"],
    });
  });

  it("reports unsupported IANA timezones", () => {
    expect(
      resolveLocalDateTime("2026-12-01", "09:30", "Not/A_Timezone"),
    ).toEqual({ kind: "invalid_timezone" });
  });

  it("calculates all-day overdue state in the preferred timezone", () => {
    const task = {
      id: "11111111-1111-4111-8111-111111111111",
      user_id: "22222222-2222-4222-8222-222222222222",
      subject_id: "33333333-3333-4333-8333-333333333333",
      title: "Read chapter 4",
      description: null,
      task_type: "Assignment" as const,
      custom_type: null,
      due_date: "2026-01-01",
      due_time: null,
      due_timezone: null,
      due_at: null,
      priority: "Normal" as const,
      status: "Not Started" as const,
      estimated_duration_minutes: null,
      reference_url: null,
      version: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    expect(
      isTaskOverdue(task, "Pacific/Honolulu", new Date("2026-01-02T00:30:00Z")),
    ).toBe(false);
    expect(
      dateInTimeZone(new Date("2026-01-02T00:30:00Z"), "Pacific/Honolulu"),
    ).toBe("2026-01-01");
    expect(
      isTaskOverdue(task, "Asia/Manila", new Date("2026-01-02T00:30:00Z")),
    ).toBe(true);
    expect(
      isTaskOverdue(
        { ...task, status: "Completed" },
        "Asia/Manila",
        new Date("2026-01-02T00:30:00Z"),
      ),
    ).toBe(false);
  });

  it("characterizes timed deadline equality and completion boundaries", () => {
    const dueAt = "2026-12-01T01:30:00.000Z";
    const task = {
      id: "11111111-1111-4111-8111-111111111111",
      user_id: "22222222-2222-4222-8222-222222222222",
      subject_id: "33333333-3333-4333-8333-333333333333",
      title: "Timed deadline",
      description: null,
      task_type: "Assignment" as const,
      custom_type: null,
      due_date: "2026-12-01",
      due_time: "09:30:00",
      due_timezone: "Asia/Manila",
      due_at: dueAt,
      priority: "Normal" as const,
      status: "In Progress" as const,
      estimated_duration_minutes: null,
      reference_url: null,
      version: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const instant = Date.parse(dueAt);

    expect(
      isTaskOverdue(task, "Asia/Manila", new Date(instant - 1)),
    ).toBe(false);
    expect(isTaskOverdue(task, "Asia/Manila", new Date(instant))).toBe(
      false,
    );
    expect(
      isTaskOverdue(task, "Asia/Manila", new Date(instant + 1)),
    ).toBe(true);
    expect(
      isTaskOverdue(
        { ...task, status: "Completed" },
        "Asia/Manila",
        new Date(instant + 1),
      ),
    ).toBe(false);
  });

  it("characterizes all-day deadline boundaries in an explicit timezone", () => {
    const task = {
      id: "11111111-1111-4111-8111-111111111111",
      user_id: "22222222-2222-4222-8222-222222222222",
      subject_id: "33333333-3333-4333-8333-333333333333",
      title: "All-day deadline",
      description: null,
      task_type: "Assignment" as const,
      custom_type: null,
      due_date: "2026-12-01",
      due_time: null,
      due_timezone: null,
      due_at: null,
      priority: "Normal" as const,
      status: "In Progress" as const,
      estimated_duration_minutes: null,
      reference_url: null,
      version: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    expect(
      isTaskOverdue(
        task,
        "Asia/Manila",
        new Date("2026-11-30T15:59:59.999Z"),
      ),
    ).toBe(false);
    expect(
      isTaskOverdue(
        task,
        "Asia/Manila",
        new Date("2026-12-01T15:59:59.999Z"),
      ),
    ).toBe(false);
    expect(
      isTaskOverdue(
        task,
        "Asia/Manila",
        new Date("2026-12-01T16:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isTaskOverdue(
        { ...task, status: "Completed" },
        "Asia/Manila",
        new Date("2026-12-01T16:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("keeps timed overdue comparison independent of browser timezone", () => {
    const task = {
      id: "11111111-1111-4111-8111-111111111111",
      user_id: "22222222-2222-4222-8222-222222222222",
      subject_id: "33333333-3333-4333-8333-333333333333",
      title: "Timed timezone independence",
      description: null,
      task_type: "Assignment" as const,
      custom_type: null,
      due_date: "2026-12-01",
      due_time: "09:30:00",
      due_timezone: "Asia/Manila",
      due_at: "2026-12-01T01:30:00.000Z",
      priority: "Normal" as const,
      status: "In Progress" as const,
      estimated_duration_minutes: null,
      reference_url: null,
      version: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const fixedNow = new Date("2026-12-01T01:30:00.001Z");

    expect(isTaskOverdue(task, "Asia/Manila", fixedNow)).toBe(true);
    expect(isTaskOverdue(task, "America/Los_Angeles", fixedNow)).toBe(true);
  });
});
