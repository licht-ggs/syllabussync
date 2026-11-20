import { createCanvas } from "@napi-rs/canvas";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import Tesseract from "tesseract.js";

const require = createRequire(import.meta.url);
const tesseractEntry = require.resolve("tesseract.js");
const tesseractRequire = createRequire(tesseractEntry);
const languagePackageEntry = require.resolve("@tesseract.js-data/eng");
const coreEntry = tesseractRequire.resolve("tesseract.js-core");
const workerEntry = tesseractRequire.resolve(
  "tesseract.js/src/worker-script/node/index.js",
);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 200;
const MIN_NATIVE_TEXT_CHARACTERS = 30;
const MAX_RENDER_DIMENSION = 2400;

export type ExtractedDocumentPage = {
  page_number: number;
  extracted_text: string;
  extraction_method: "native_text" | "ocr" | "mixed" | "none";
  extraction_status: "completed" | "partial" | "failed";
  error_code: "native_extraction_failed" | "render_failed" | "ocr_failed" | null;
};

export type OcrPage = (image: Buffer) => Promise<string>;
export type ProgressHandler = (completedPages: number, totalPages: number) => void | Promise<void>;

export async function extractPdfPages(
  data: Buffer,
  ocrPage: OcrPage,
  onProgress: ProgressHandler = () => undefined,
): Promise<ExtractedDocumentPage[]> {
  if (data.length < 8 || data.length > MAX_FILE_BYTES || data.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error("invalid_pdf");
  }

  const loadingTask = getDocument({ data: new Uint8Array(data), stopAtErrors: true });
  try {
    const pdf = await loadingTask.promise;
    if (pdf.numPages < 1 || pdf.numPages > MAX_PAGES) throw new Error("page_limit_exceeded");
    const pages: ExtractedDocumentPage[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      let nativeText = "";
      let nativeFailed = false;
      try {
        const content = await page.getTextContent();
        nativeText = content.items
          .filter((item) => "str" in item)
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
      } catch {
        nativeFailed = true;
      }

      const usefulNativeText = nativeText.replace(/[^\p{L}\p{N}]/gu, "").length >= MIN_NATIVE_TEXT_CHARACTERS;
      let result: ExtractedDocumentPage;
      if (usefulNativeText) {
        result = {
          page_number: pageNumber,
          extracted_text: nativeText,
          extraction_method: "native_text",
          extraction_status: "completed",
          error_code: null,
        };
      } else {
        let errorCode: ExtractedDocumentPage["error_code"] = null;
        let renderedImage: Buffer | null = null;
        let ocrText = "";
        try {
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(1.5, MAX_RENDER_DIMENSION / Math.max(baseViewport.width, baseViewport.height));
          const viewport = page.getViewport({ scale });
          const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          const context = canvas.getContext("2d");
          await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: context as unknown as CanvasRenderingContext2D, viewport }).promise;
          renderedImage = canvas.toBuffer("image/png");
        } catch {
          errorCode = "render_failed";
        }
        if (renderedImage) {
          try {
            ocrText = (await ocrPage(renderedImage)).replace(/\s+/g, " ").trim();
          } catch {
            errorCode = "ocr_failed";
          }
        }

        const hasNative = nativeText.length > 0;
        const hasOcr = ocrText.length > 0;
        if (nativeFailed && !hasNative && errorCode) errorCode = "native_extraction_failed";
        result = {
          page_number: pageNumber,
          extracted_text: hasNative && hasOcr ? `${nativeText}\n${ocrText}` : hasNative ? nativeText : ocrText,
          extraction_method: hasNative && hasOcr ? "mixed" : hasNative ? "native_text" : hasOcr ? "ocr" : "none",
          extraction_status: errorCode ? (hasNative ? "partial" : "failed") : "completed",
          error_code: errorCode,
        };
      }
      pages.push(result);
      page.cleanup();
      await onProgress(pageNumber, pdf.numPages);
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

export async function createLocalEnglishOcr(): Promise<{
  recognize(image: Buffer): Promise<string>;
  terminate(): Promise<unknown>;
}> {
  const languagePath = path.join(path.dirname(languagePackageEntry), "4.0.0_best_int");
  const worker = await Tesseract.createWorker("eng", undefined, {
    corePath: path.dirname(coreEntry),
    workerPath: workerEntry,
    langPath: languagePath,
    cachePath: path.join(tmpdir(), "syllabussync-tesseract-cache"),
    gzip: true,
  });
  return {
    async recognize(image) {
      const result = await worker.recognize(image);
      return result.data.text;
    },
    terminate: () => worker.terminate(),
  };
}
