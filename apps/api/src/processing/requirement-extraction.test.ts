import { describe, expect, it, vi } from "vitest";
import {
  extractRequirementCandidates,
  RequirementExtractionUnavailableError,
  type ExtractionSourcePage,
  type RequirementExtractionProvider,
} from "./requirement-extraction.js";

const pages: ExtractionSourcePage[] = [
  {
    page_number: 1,
    extracted_text: "Assignment 1 is due June 3, 2027.",
    extraction_status: "extracted",
  },
  { page_number: 2, extracted_text: "", extraction_status: "empty" },
];

const candidate = {
  title: "Assignment 1",
  description: "Submit Assignment 1.",
  category: "assignment",
  source_page: 1,
  evidence_excerpt: "Assignment 1 is due June 3, 2027.",
  original_date_expression: "June 3, 2027",
  normalized_due_date: "2027-06-03",
  normalized_due_time: null,
  deadline_certainty: "exact",
  confidence: 0.82,
  ambiguity_notes: [],
};

function makeProvider(output: unknown): RequirementExtractionProvider {
  return {
    providerId: "test-provider",
    modelId: "test-model",
    extract: vi.fn().mockResolvedValue(output),
  };
}

describe("requirement extraction boundary", () => {
  it("keeps provider use unavailable when no provider is configured", async () => {
    await expect(
      extractRequirementCandidates(pages, null),
    ).rejects.toBeInstanceOf(RequirementExtractionUnavailableError);
  });

  it("validates strict candidate output and source evidence against page text", async () => {
    const result = await extractRequirementCandidates(
      pages,
      makeProvider([candidate]),
    );
    expect(result.providerId).toBe("test-provider");
    expect(result.candidates).toEqual([candidate]);
  });

  it("rejects evidence attributed to the wrong page or not present in the source", async () => {
    await expect(
      extractRequirementCandidates(
        pages,
        makeProvider([{ ...candidate, source_page: 2 }]),
      ),
    ).rejects.toThrow(
      "Candidate evidence does not match its cited source page.",
    );
    await expect(
      extractRequirementCandidates(
        pages,
        makeProvider([
          { ...candidate, evidence_excerpt: "A different deadline" },
        ]),
      ),
    ).rejects.toThrow(
      "Candidate evidence does not match its cited source page.",
    );
  });

  it("rejects uncertain normalized dates and unexpected provider fields", async () => {
    await expect(
      extractRequirementCandidates(
        pages,
        makeProvider([{ ...candidate, deadline_certainty: "ambiguous" }]),
      ),
    ).rejects.toThrow(
      "The extraction response did not match the candidate schema.",
    );
    await expect(
      extractRequirementCandidates(
        pages,
        makeProvider([{ ...candidate, made_up: "ignored" }]),
      ),
    ).rejects.toThrow(
      "The extraction response did not match the candidate schema.",
    );
  });
});
