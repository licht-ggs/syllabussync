import {
  requirementCandidateProposalsSchema,
  type RequirementCandidateProposal,
} from "@syllabussync/shared";

export type ExtractionSourcePage = {
  page_number: number;
  extracted_text: string;
  extraction_status: "extracted" | "partial" | "empty" | "failed";
};

export type RequirementExtractionProvider = {
  providerId: string;
  modelId: string;
  extract: (
    pages: Array<Pick<ExtractionSourcePage, "page_number" | "extracted_text">>,
  ) => Promise<unknown>;
};

export class RequirementExtractionUnavailableError extends Error {
  constructor() {
    super(
      "Requirement extraction is unavailable until a provider is configured.",
    );
    this.name = "RequirementExtractionUnavailableError";
  }
}

function normalizeEvidence(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export async function extractRequirementCandidates(
  pages: ExtractionSourcePage[],
  provider: RequirementExtractionProvider | null,
): Promise<{
  providerId: string;
  modelId: string;
  candidates: RequirementCandidateProposal[];
}> {
  if (!provider) throw new RequirementExtractionUnavailableError();
  const usablePages = pages
    .filter(
      (page) =>
        page.extraction_status === "extracted" ||
        page.extraction_status === "partial",
    )
    .map(({ page_number, extracted_text }) => ({
      page_number,
      extracted_text,
    }));
  if (!usablePages.length)
    throw new Error("No extracted source pages are available.");

  const parsed = requirementCandidateProposalsSchema.safeParse(
    await provider.extract(usablePages),
  );
  if (!parsed.success)
    throw new Error(
      "The extraction response did not match the candidate schema.",
    );

  const sourceByPage = new Map(
    usablePages.map((page) => [
      page.page_number,
      normalizeEvidence(page.extracted_text),
    ]),
  );
  for (const candidate of parsed.data) {
    const source = sourceByPage.get(candidate.source_page);
    if (
      !source ||
      !source.includes(normalizeEvidence(candidate.evidence_excerpt))
    ) {
      throw new Error(
        "Candidate evidence does not match its cited source page.",
      );
    }
  }

  return {
    providerId: provider.providerId,
    modelId: provider.modelId,
    candidates: parsed.data,
  };
}
