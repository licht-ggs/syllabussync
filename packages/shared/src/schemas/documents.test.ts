import { describe, expect, it } from "vitest";
import { documentSchema } from "./documents.js";

const validDocument = {
  id: "11111111-1111-4111-8111-111111111111",
  owner_id: "22222222-2222-4222-8222-222222222222",
  subject_id: null,
  filename: "Syllabus.pdf",
  content_type: "application/pdf",
  file_size: 2048,
  sha256: "a".repeat(64),
  page_count: 3,
  processing_status: "uploaded",
  created_at: "2026-11-20T00:00:00.000Z",
  updated_at: "2026-11-20T00:00:00.000Z",
};

describe("document schema", () => {
  it("accepts valid uploaded PDF metadata", () => {
    expect(documentSchema.safeParse(validDocument).success).toBe(true);
  });

  it("rejects non-PDF content types", () => {
    expect(
      documentSchema.safeParse({
        ...validDocument,
        content_type: "text/plain",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown document processing states", () => {
    expect(
      documentSchema.safeParse({
        ...validDocument,
        processing_status: "review_ready",
      }).success,
    ).toBe(false);
  });
});
