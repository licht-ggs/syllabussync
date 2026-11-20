import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createDocumentProcessingWorker } from "./document-processing-worker.js";

function createPdf() {
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>\nendobj\n",
  ];
  const parts = ["%PDF-1.4\n"];
  const offsets = [0];
  let offset = Buffer.byteLength(parts[0]!);
  for (const object of objects) {
    offsets.push(offset);
    parts.push(object);
    offset += Buffer.byteLength(object);
  }
  const xref = offset;
  parts.push(`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n");
  for (const value of offsets.slice(1)) parts.push(`${String(value).padStart(10, "0")} 00000 n \n`);
  parts.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.from(parts.join(""), "ascii");
}

const jobBase = {
  id: "33333333-3333-4333-8333-333333333333",
  document_id: "11111111-1111-4111-8111-111111111111",
  owner_id: "22222222-2222-4222-8222-222222222222",
  generation: 1,
  attempt_count: 1,
  storage_path: "22222222-2222-4222-8222-222222222222/11111111-1111-4111-8111-111111111111.pdf",
  file_size: 0,
  sha256: "",
  page_count: 1,
};

describe("document processing worker", () => {
  it("validates the source, writes page results, updates progress, and completes", async () => {
    const pdf = createPdf();
    const job = { ...jobBase, file_size: pdf.length, sha256: createHash("sha256").update(pdf).digest("hex") };
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_academic_document_processing_job") return { data: [job], error: null };
      return { data: null, error: null };
    });
    const recognize = vi.fn().mockResolvedValue("Assignment due on June 3");
    const terminate = vi.fn().mockResolvedValue(undefined);
    const client = {
      rpc,
      storage: { from: vi.fn().mockReturnValue({ download: vi.fn().mockResolvedValue({ data: new Blob([pdf]), error: null }) }) },
    } as never;
    const worker = createDocumentProcessingWorker(client, {
      ocrFactory: async () => ({ recognize, terminate }),
    });

    await expect(worker.runOnce()).resolves.toBe(true);
    expect(recognize).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("update_academic_document_processing_progress", {
      p_job_id: job.id,
      p_progress_percent: 95,
    });
    expect(rpc).toHaveBeenCalledWith("save_academic_document_processing_pages", {
      p_job_id: job.id,
      p_pages: [expect.objectContaining({ page_number: 1, extraction_method: "ocr" })],
    });
    expect(rpc).toHaveBeenCalledWith("complete_academic_document_processing", {
      p_job_id: job.id,
      p_success: true,
      p_error_code: null,
    });
    expect(terminate).toHaveBeenCalledOnce();
  });

  it("records a safe source error without persisting unverified content", async () => {
    const pdf = createPdf();
    const job = { ...jobBase, file_size: pdf.length, sha256: "f".repeat(64) };
    const rpc = vi.fn(async (name: string) =>
      name === "claim_academic_document_processing_job"
        ? { data: [job], error: null }
        : { data: null, error: null },
    );
    const client = {
      rpc,
      storage: { from: vi.fn().mockReturnValue({ download: vi.fn().mockResolvedValue({ data: new Blob([pdf]), error: null }) }) },
    } as never;
    const worker = createDocumentProcessingWorker(client, {
      ocrFactory: async () => ({ recognize: vi.fn(), terminate: vi.fn() }),
    });

    await expect(worker.runOnce()).resolves.toBe(true);
    expect(rpc).not.toHaveBeenCalledWith("save_academic_document_processing_pages", expect.anything());
    expect(rpc).toHaveBeenCalledWith("complete_academic_document_processing", {
      p_job_id: job.id,
      p_success: false,
      p_error_code: "source_unavailable",
    });
  });
});
