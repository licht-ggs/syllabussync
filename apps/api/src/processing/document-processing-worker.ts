import { createHash } from "node:crypto";
import { createDocumentWorkerClient } from "../services/supabase.js";
import {
  createLocalEnglishOcr,
  extractPdfPages,
  type OcrPage,
} from "./pdf-processing.js";

const BUCKET = "academic-documents";
const POLL_INTERVAL_MS = 5_000;

type ProcessingJob = {
  id: string;
  document_id: string;
  owner_id: string;
  generation: number;
  attempt_count: number;
  storage_path: string;
  file_size: number;
  sha256: string;
  page_count: number;
};

type ProcessingClient = ReturnType<typeof createDocumentWorkerClient>;
type OcrEngine = Awaited<ReturnType<typeof createLocalEnglishOcr>>;

function getErrorCode(error: unknown) {
  const allowed = [
    "source_unavailable",
    "invalid_pdf",
    "page_limit_exceeded",
    "render_failed",
    "ocr_failed",
    "partial_page_failure",
    "worker_error",
  ];
  if (error instanceof Error && allowed.includes(error.message)) return error.message;
  return "worker_error";
}

export function createDocumentProcessingWorker(
  client: ProcessingClient = createDocumentWorkerClient(),
  options: {
    pollIntervalMs?: number;
    ocrFactory?: () => Promise<OcrEngine>;
    onError?: (error: unknown) => void;
  } = {},
) {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const interval = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const ocrFactory = options.ocrFactory ?? createLocalEnglishOcr;

  async function runOnce(): Promise<boolean> {
    const { data, error } = await client.rpc("claim_academic_document_processing_job");
    if (error) throw new Error("Unable to claim a document processing job.");
    const job = (Array.isArray(data) ? data[0] : data) as ProcessingJob | null;
    if (!job) return false;

    const engines: OcrEngine[] = [];
    const ocrPage: OcrPage = async (image) => {
      engines[0] ??= await ocrFactory();
      return engines[0].recognize(image);
    };
    try {
      const download = await client.storage.from(BUCKET).download(job.storage_path);
      if (download.error || !download.data) throw new Error("source_unavailable");
      const bytes = Buffer.from(await download.data.arrayBuffer());
      if (
        bytes.length !== job.file_size ||
        createHash("sha256").update(bytes).digest("hex") !== job.sha256
      ) {
        throw new Error("source_unavailable");
      }

      const pages = await extractPdfPages(bytes, ocrPage, async (completed, total) => {
        const progress = Math.min(99, Math.floor((completed / total) * 95));
        const update = await client.rpc("update_academic_document_processing_progress", {
          p_job_id: job.id,
          p_progress_percent: progress,
        });
        if (update.error) throw new Error("worker_error");
      });
      if (pages.length !== job.page_count) throw new Error("invalid_pdf");

      const saved = await client.rpc("save_academic_document_processing_pages", {
        p_job_id: job.id,
        p_pages: pages,
      });
      if (saved.error) throw new Error(saved.error.code === "P0002" ? "source_unavailable" : "worker_error");

      const hasFailedPage = pages.some((page) => page.extraction_status !== "completed");
      const completed = await client.rpc("complete_academic_document_processing", {
        p_job_id: job.id,
        p_success: !hasFailedPage,
        p_error_code: hasFailedPage ? "partial_page_failure" : null,
      });
      if (completed.error) throw new Error("worker_error");
    } catch (error) {
      const completion = await client.rpc("complete_academic_document_processing", {
        p_job_id: job.id,
        p_success: false,
        p_error_code: getErrorCode(error),
      });
      if (completion.error) throw new Error("Unable to record document processing failure.");
    } finally {
      await engines[0]?.terminate();
    }
    return true;
  }

  async function poll() {
    if (stopped) return;
    try {
      const processed = await runOnce();
      if (processed) {
        void poll();
        return;
      }
    } catch (error) {
      options.onError?.(error);
    }
    if (!stopped) timer = setTimeout(() => void poll(), interval);
  }

  return {
    runOnce,
    start() {
      stopped = false;
      void poll();
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
