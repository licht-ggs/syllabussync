import { describe, expect, it } from "vitest";
import {
  academicPeriodCreateSchema,
  academicYearInputSchema,
  subjectCreateSchema,
} from "./academic.js";

describe("academic workspace schemas", () => {
  it("trims and validates academic year names", () => {
    expect(academicYearInputSchema.parse({ name: "  2026–2027  " })).toEqual({
      name: "2026–2027",
    });
    expect(academicYearInputSchema.safeParse({ name: "   " }).success).toBe(
      false,
    );
  });

  it("rejects invalid dates and end dates before start dates", () => {
    const invalidDate = academicPeriodCreateSchema.safeParse({
      academic_year_id: "11111111-1111-4111-8111-111111111111",
      name: "Term 1",
      start_date: "2026-02-30",
      end_date: null,
    });
    const invertedDates = academicPeriodCreateSchema.safeParse({
      academic_year_id: "11111111-1111-4111-8111-111111111111",
      name: "Term 1",
      start_date: "2027-02-01",
      end_date: "2027-01-01",
    });

    expect(invalidDate.success).toBe(false);
    expect(invertedDates.success).toBe(false);
  });

  it("rejects negative or oversized subject units", () => {
    const input = {
      academic_period_id: "11111111-1111-4111-8111-111111111111",
      name: "Biology",
      subject_code: null,
      instructor: null,
      units: -1,
      schedule_text: null,
      room: null,
    };

    expect(subjectCreateSchema.safeParse(input).success).toBe(false);
    expect(
      subjectCreateSchema.safeParse({ ...input, units: 10000 }).success,
    ).toBe(false);
  });
});
