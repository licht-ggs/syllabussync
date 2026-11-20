import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it, vi } from "vitest";
import { createLocalEnglishOcr, extractPdfPages } from "./pdf-processing.js";

function createPdf(pageCount: number) {
  const kids = Array.from({ length: pageCount }, (_, index) => `${index + 3} 0 R`).join(" ");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`,
    ...Array.from({ length: pageCount }, (_, index) =>
      `${index + 3} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>\nendobj\n`,
    ),
  ];
  const output = ["%PDF-1.4\n"];
  const offsets = [0];
  let offset = Buffer.byteLength(output[0]!);
  for (const object of objects) {
    offsets.push(offset);
    output.push(object);
    offset += Buffer.byteLength(object);
  }
  const xrefOffset = offset;
  output.push(`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n");
  for (const objectOffset of offsets.slice(1)) {
    output.push(`${String(objectOffset).padStart(10, "0")} 00000 n \n`);
  }
  output.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
  return Buffer.from(output.join(""), "ascii");
}

describe("PDF page extraction", () => {
  it("renders low-text pages for OCR and preserves page numbers and progress", async () => {
    const ocr = vi.fn().mockResolvedValue("Course project deadline: June 3");
    const progress = vi.fn();
    const pages = await extractPdfPages(createPdf(2), ocr, progress);

    expect(ocr).toHaveBeenCalledTimes(2);
    expect(ocr.mock.calls[0]?.[0]).toMatchObject({ constructor: Buffer });
    expect(pages).toEqual([
      {
        page_number: 1,
        extracted_text: "Course project deadline: June 3",
        extraction_method: "ocr",
        extraction_status: "completed",
        error_code: null,
      },
      {
        page_number: 2,
        extracted_text: "Course project deadline: June 3",
        extraction_method: "ocr",
        extraction_status: "completed",
        error_code: null,
      },
    ]);
    expect(progress).toHaveBeenNthCalledWith(2, 2, 2);
  });

  it("preserves a blank page and records OCR failure without losing page provenance", async () => {
    const pages = await extractPdfPages(createPdf(1), async () => {
      throw new Error("OCR unavailable");
    });

    expect(pages[0]).toMatchObject({
      page_number: 1,
      extraction_method: "none",
      extraction_status: "failed",
      error_code: "ocr_failed",
    });
  });

  it("rejects non-PDF content before opening it", async () => {
    await expect(extractPdfPages(Buffer.from("not a PDF"), async () => "")).rejects.toThrow("invalid_pdf");
  });

  it("recognizes synthetic English text using bundled local model files", async () => {
    const canvas = createCanvas(1200, 240);
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, 1200, 240);
    context.fillStyle = "black";
    context.font = "56px Arial";
    context.fillText("Assignment due June 3", 32, 150);

    const ocr = await createLocalEnglishOcr();
    try {
      const recognized = await ocr.recognize(canvas.toBuffer("image/png"));
      expect(recognized.toLowerCase()).toContain("assignment");
      expect(recognized.toLowerCase()).toContain("june 3");
    } finally {
      await ocr.terminate();
    }
  }, 30_000);
});
