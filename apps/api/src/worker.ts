import { createDocumentProcessingWorker } from "./processing/document-processing-worker.js";

const worker = createDocumentProcessingWorker(undefined, {
  onError(error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";
    console.error(`Document worker iteration failed: ${message}`);
  },
});

worker.start();
console.log("SyllabusSync document processing worker started");

async function shutdown() {
  await worker.stop();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
