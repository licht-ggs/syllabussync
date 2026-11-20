import express from "express";
import request from "supertest";
import type { RequestHandler } from "express";
import { describe, expect, it, vi } from "vitest";
import { createDocumentRouter, inspectPdf } from "./documents.js";

function createPdf(pageCount: number, paddingBytes = 0) {
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];
  const kids = Array.from(
    { length: pageCount },
    (_, index) => `${index + 3} 0 R`,
  ).join(" ");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`,
    ...Array.from(
      { length: pageCount },
      (_, index) =>
        `${index + 3} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>\nendobj\n`,
    ),
  ];
  let offset = Buffer.byteLength(chunks[0]!);
  for (const object of objects) {
    offsets.push(offset);
    chunks.push(object);
    offset += Buffer.byteLength(object);
  }
  if (paddingBytes > 0) chunks.push(`%${"x".repeat(paddingBytes - 2)}\n`);
  const xrefOffset = offset;
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  for (const objectOffset of offsets.slice(1)) {
    chunks.push(`${String(objectOffset).padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
  return Buffer.from(chunks.join(""), "ascii");
}

describe("PDF validation", () => {
  it("accepts a structurally valid PDF and returns its page count", async () => {
    await expect(inspectPdf(createPdf(1))).resolves.toBe(1);
  });

  it("accepts the proposed 200-page boundary and rejects 201 pages", async () => {
    await expect(inspectPdf(createPdf(200))).resolves.toBe(200);
    await expect(inspectPdf(createPdf(201))).resolves.toBeNull();
  });

  it("parses a valid PDF at the proposed 20 MB size boundary", async () => {
    const base = createPdf(1);
    const padded = createPdf(1, 20 * 1024 * 1024 - base.length);
    expect(padded.length).toBe(20 * 1024 * 1024);
    await expect(inspectPdf(padded)).resolves.toBe(1);
  });

  it("rejects content that only claims to be a PDF", async () => {
    await expect(
      inspectPdf(Buffer.from("%PDF-1.7\nnot really a PDF", "ascii")),
    ).resolves.toBeNull();
  });

  it("rejects files above the upload byte limit before parsing", async () => {
    const data = Buffer.alloc(20 * 1024 * 1024 + 1);
    data.write("%PDF-", 0, "ascii");
    await expect(inspectPdf(data)).resolves.toBeNull();
  });
});

describe("document API authentication", () => {
  it("requires authentication before document reads or uploads", async () => {
    const app = express();
    app.use(express.raw({ type: "application/pdf", limit: "20mb" }));
    app.use("/api/documents", createDocumentRouter());

    const response = await request(app).get("/api/documents");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Authentication required" });
  });

  it("requires authentication before requirement candidates can be read", async () => {
    const app = express();
    app.use("/api/documents", createDocumentRouter());
    const response = await request(app).get(
      "/api/documents/11111111-1111-4111-8111-111111111111/candidates",
    );
    expect(response.status).toBe(401);
  });
});

describe("document API operations", () => {
  const ownerId = "13131313-1313-4131-8131-131313131313";

  function authenticatedApp(client: unknown) {
    const authenticate: RequestHandler = (req, _res, next) => {
      req.authUser = { id: ownerId } as never;
      req.supabaseAccessToken = "test-token";
      next();
    };
    const app = express();
    app.use(express.raw({ type: "application/pdf", limit: "20mb" }));
    app.use(
      "/api/documents",
      createDocumentRouter(authenticate, () => client as never),
    );
    return app;
  }

  it("loads candidates only through the authenticated owner-scoped document route", async () => {
    const documentId = "11111111-1111-4111-8111-111111111111";
    const candidate = {
      id: "33333333-3333-4333-8333-333333333333",
      document_id: documentId,
      owner_id: ownerId,
      subject_id: null,
      title: "Assignment one",
      description: "Submit the first assignment.",
      category: "assignment",
      source_page: 1,
      evidence_excerpt: "Assignment one is due June 3.",
      original_date_expression: "June 3",
      normalized_due_date: null,
      normalized_due_time: null,
      deadline_certainty: "ambiguous",
      confidence: 0.8,
      ambiguity_notes: ["The source does not name a year."],
      review_status: "pending_review",
      extraction_provider: "synthetic-test",
      extraction_model: "fixture-v1",
      created_task_id: null,
      created_at: "2026-11-20T00:00:00.000Z",
      updated_at: "2026-11-20T00:00:00.000Z",
      reviewed_at: null,
    };
    const documentQuery = {
      data: { processing_status: "text_extracted" },
      error: null,
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { processing_status: "text_extracted" },
        error: null,
      }),
    };
    documentQuery.select.mockReturnValue(documentQuery);
    documentQuery.eq.mockReturnValue(documentQuery);
    const candidateQuery = {
      data: [candidate],
      error: null,
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    };
    candidateQuery.select.mockReturnValue(candidateQuery);
    candidateQuery.eq.mockReturnValue(candidateQuery);
    candidateQuery.order.mockReturnValue(candidateQuery);
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(documentQuery)
        .mockReturnValueOnce(candidateQuery),
    };
    const response = await request(authenticatedApp(client)).get(
      `/api/documents/${documentId}/candidates`,
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual([candidate]);
    expect(documentQuery.eq).toHaveBeenCalledWith("owner_id", ownerId);
    expect(candidateQuery.eq).toHaveBeenCalledWith("owner_id", ownerId);
    expect(candidateQuery.eq).toHaveBeenCalledWith("document_id", documentId);
  });

  it("queues text extraction through the owner-scoped processing RPC", async () => {
    const job = {
      id: "33333333-3333-4333-8333-333333333333",
      document_id: "11111111-1111-4111-8111-111111111111",
      owner_id: ownerId,
      generation: 1,
      status: "queued",
      progress_percent: 0,
      attempt_count: 0,
      error_code: null,
      created_at: "2026-11-20T00:00:00.000Z",
      updated_at: "2026-11-20T00:00:00.000Z",
      started_at: null,
      completed_at: null,
    };
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: job, error: null }),
    };
    const response = await request(authenticatedApp(client))
      .post(`/api/documents/${job.document_id}/process`)
      .send({});

    expect(response.status).toBe(202);
    expect(response.body).toEqual(job);
    expect(client.rpc).toHaveBeenCalledWith(
      "queue_academic_document_processing",
      {
        p_document_id: job.document_id,
      },
    );
  });

  it("deletes the private object before completing owner metadata cleanup", async () => {
    const document = {
      id: "11111111-1111-4111-8111-111111111111",
      owner_id: ownerId,
      subject_id: null,
      filename: "Syllabus.pdf",
      content_type: "application/pdf",
      file_size: 1024,
      sha256: "a".repeat(64),
      page_count: 1,
      processing_status: "deletion_pending",
      created_at: "2026-11-20T00:00:00.000Z",
      updated_at: "2026-11-20T00:00:00.000Z",
      storage_path: `${ownerId}/11111111-1111-4111-8111-111111111111.pdf`,
    };
    const rpc = vi.fn().mockResolvedValue({ data: document, error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const client = {
      rpc,
      storage: { from: vi.fn().mockReturnValue({ remove }) },
    };

    const response = await request(authenticatedApp(client)).delete(
      `/api/documents/${document.id}`,
    );

    expect(response.status).toBe(204);
    expect(remove).toHaveBeenCalledWith([document.storage_path]);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "mark_academic_document_deletion_pending",
      "complete_academic_document_deletion",
    ]);
  });

  it("registers the file under an owner-scoped private storage path", async () => {
    const uploading = {
      id: "",
      owner_id: ownerId,
      subject_id: null,
      filename: "Syllabus.pdf",
      content_type: "application/pdf",
      file_size: createPdf(1).length,
      sha256: "a".repeat(64),
      page_count: 1,
      processing_status: "uploading",
      created_at: "2026-11-20T00:00:00.000Z",
      updated_at: "2026-11-20T00:00:00.000Z",
      storage_path: "",
    };
    const uploaded = { ...uploading, processing_status: "uploaded" };
    const duplicateQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    duplicateQuery.select.mockReturnValue(duplicateQuery);
    duplicateQuery.eq.mockReturnValue(duplicateQuery);
    const client = {
      from: vi.fn().mockReturnValue(duplicateQuery),
      rpc: vi
        .fn()
        .mockImplementation(
          async (functionName: string, args: Record<string, unknown>) => {
            const data =
              functionName === "register_academic_document"
                ? uploading
                : uploaded;
            return {
              data: {
                ...data,
                id: args.p_id,
                storage_path: args.p_storage_path,
              },
              error: null,
            };
          },
        ),
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null }),
        }),
      },
    };

    const response = await request(authenticatedApp(client))
      .post("/api/documents")
      .set("Content-Type", "application/pdf")
      .set("X-Document-Filename", "Syllabus.pdf")
      .send(createPdf(1));

    expect(response.status).toBe(201);
    expect(response.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body.processing_status).toBe("queued");
    const registration = client.rpc.mock.calls[0];
    expect(registration?.[0]).toBe("register_academic_document");
    expect(registration?.[1]).toMatchObject({
      p_id: response.body.id,
      p_storage_path: `${ownerId}/${response.body.id}.pdf`,
    });
    expect(duplicateQuery.eq).toHaveBeenCalledWith("owner_id", ownerId);
    expect(client.storage.from).toHaveBeenCalledWith("academic-documents");
  });
});
