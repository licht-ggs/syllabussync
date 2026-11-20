import { describe, expect, it } from "vitest";
import {
  candidateTaskCreationSchema,
  requirementCandidateProposalSchema,
  updateRequirementCandidateSchema,
} from "./requirement-candidates.js";

const candidate = {
  title: "Assignment one",
  description: "Submit the first assignment.",
  category: "assignment",
  source_page: 1,
  evidence_excerpt: "Assignment one is due on June 3.",
  original_date_expression: "June 3",
  normalized_due_date: "2027-06-03",
  normalized_due_time: null,
  deadline_certainty: "exact",
  confidence: 0.8,
  ambiguity_notes: [],
};

describe("requirement candidate schemas", () => {
  it("accepts evidenced exact candidates and rejects inferred uncertain dates", () => {
    expect(
      requirementCandidateProposalSchema.safeParse(candidate).success,
    ).toBe(true);
    expect(
      requirementCandidateProposalSchema.safeParse({
        ...candidate,
        deadline_certainty: "ambiguous",
      }).success,
    ).toBe(false);
  });

  it("keeps edited exact dates explicit and prevents times without dates", () => {
    const edit = {
      title: candidate.title,
      description: candidate.description,
      category: candidate.category,
      subject_id: "11111111-1111-4111-8111-111111111111",
      original_date_expression: candidate.original_date_expression,
      normalized_due_date: null,
      normalized_due_time: null,
      deadline_certainty: "ambiguous",
    };
    expect(updateRequirementCandidateSchema.safeParse(edit).success).toBe(true);
    expect(
      updateRequirementCandidateSchema.safeParse({
        ...edit,
        normalized_due_time: "09:30",
      }).success,
    ).toBe(false);
    expect(
      updateRequirementCandidateSchema.safeParse({
        ...edit,
        deadline_certainty: "exact",
      }).success,
    ).toBe(false);
  });

  it("requires consistent date-only or timed task deadline values", () => {
    const input = {
      subject_id: "11111111-1111-4111-8111-111111111111",
      due_date: "2027-06-03",
      due_time: null,
      due_timezone: null,
      due_at: null,
      priority: "Normal",
      estimated_duration_minutes: null,
      reference_url: null,
    };
    expect(candidateTaskCreationSchema.safeParse(input).success).toBe(true);
    expect(
      candidateTaskCreationSchema.safeParse({
        ...input,
        due_time: "09:30",
      }).success,
    ).toBe(false);
  });
});
