import { useCallback, useEffect, useState } from "react";
import {
  academicWorkspaceSchema,
  documentLibrarySchema,
  documentPageListSchema,
  type AcademicDocument,
  type AcademicDocumentPage,
  type DocumentLibraryItem,
  type Subject,
} from "@syllabussync/shared";
import { useAuth } from "../auth/useAuth";
import { useNavigate } from "react-router-dom";

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ?? fallback;
}

export function DocumentsPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [documents, setDocuments] = useState<DocumentLibraryItem[]>([]);
  const [selectedPages, setSelectedPages] = useState<
    Record<string, AcademicDocumentPage[]>
  >({});
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    if (!accessToken) throw new Error("Your session is unavailable.");
    const [documentsResponse, workspaceResponse] = await Promise.all([
      fetch("/api/documents", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch("/api/academic/workspace", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);
    if (!documentsResponse.ok)
      throw new Error(
        await readError(documentsResponse, "Documents could not be loaded."),
      );
    if (!workspaceResponse.ok)
      throw new Error("Your academic subjects could not be loaded.");
    const [documentData, workspaceData] = await Promise.all([
      documentsResponse.json(),
      workspaceResponse.json(),
    ]);
    const parsedDocuments = documentLibrarySchema.safeParse(documentData);
    const parsedWorkspace = academicWorkspaceSchema.safeParse(workspaceData);
    if (!parsedDocuments.success || !parsedWorkspace.success)
      throw new Error("The document library response was invalid.");
    setDocuments(parsedDocuments.data);
    setSubjects(parsedWorkspace.data.subjects);
  }, [accessToken]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setErrorMessage(null);
    void loadDocuments()
      .catch((error: unknown) => {
        if (active)
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "The document library could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadDocuments]);

  const hasActiveProcessing = documents.some(
    (document) =>
      document.processing_status === "queued" ||
      document.processing_status === "processing",
  );

  useEffect(() => {
    if (!hasActiveProcessing) return;
    const interval = window.setInterval(() => {
      void loadDocuments().catch(() => undefined);
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [hasActiveProcessing, loadDocuments]);

  async function uploadDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !file) {
      setErrorMessage("Choose a PDF syllabus to upload.");
      return;
    }
    if (
      file.type !== "application/pdf" ||
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setErrorMessage("Only PDF files are supported.");
      return;
    }
    setIsUploading(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/pdf",
          "X-Document-Filename": encodeURIComponent(file.name),
          ...(selectedSubjectId ? { "X-Subject-Id": selectedSubjectId } : {}),
        },
        body: file,
      });
      if (!response.ok)
        throw new Error(
          await readError(response, "The PDF could not be uploaded."),
        );
      setFile(null);
      const input = document.getElementById(
        "syllabus-pdf",
      ) as HTMLInputElement | null;
      if (input) input.value = "";
      const uploaded = (await response.json()) as AcademicDocument;
      setNotice(
        uploaded.processing_status === "queued"
          ? "Syllabus uploaded. Page text extraction is queued."
          : "Syllabus uploaded. Start text extraction from the document list.",
      );
      await loadDocuments();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The PDF could not be uploaded.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function openDocument(item: AcademicDocument) {
    if (!accessToken) return;
    const openedWindow = window.open("about:blank", "_blank");
    if (!openedWindow) {
      setErrorMessage("Allow pop-ups to open this PDF.");
      return;
    }
    openedWindow.opener = null;
    setBusyDocumentId(item.id);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/documents/${item.id}/content`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok)
        throw new Error(
          await readError(response, "The PDF could not be opened."),
        );
      const objectUrl = URL.createObjectURL(await response.blob());
      openedWindow.location.replace(objectUrl);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      openedWindow.close();
      setErrorMessage(
        error instanceof Error ? error.message : "The PDF could not be opened.",
      );
    } finally {
      setBusyDocumentId(null);
    }
  }

  async function processDocument(item: DocumentLibraryItem) {
    if (!accessToken) return;
    setBusyDocumentId(item.id);
    setErrorMessage(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/documents/${item.id}/process`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok)
        throw new Error(
          await readError(response, "Text extraction could not be started."),
        );
      setNotice("Page text extraction has been queued.");
      await loadDocuments();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Text extraction could not be started.",
      );
    } finally {
      setBusyDocumentId(null);
    }
  }

  async function viewExtractedPages(item: DocumentLibraryItem) {
    if (!accessToken) return;
    setBusyDocumentId(item.id);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/documents/${item.id}/pages`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok)
        throw new Error(
          await readError(response, "Extracted text could not be loaded."),
        );
      const parsed = documentPageListSchema.safeParse(await response.json());
      if (!parsed.success)
        throw new Error("The extracted page response was invalid.");
      setSelectedPages((current) => ({ ...current, [item.id]: parsed.data }));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Extracted text could not be loaded.",
      );
    } finally {
      setBusyDocumentId(null);
    }
  }

  async function deleteDocument(item: DocumentLibraryItem) {
    if (
      !accessToken ||
      !window.confirm(`Delete ${item.filename}? This cannot be undone.`)
    )
      return;
    setBusyDocumentId(item.id);
    setErrorMessage(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/documents/${item.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok)
        throw new Error(
          await readError(response, "The document could not be deleted."),
        );
      setDocuments((current) =>
        current.filter((document) => document.id !== item.id),
      );
      setNotice("Document deleted.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The document could not be deleted.",
      );
      await loadDocuments().catch(() => undefined);
    } finally {
      setBusyDocumentId(null);
    }
  }

  async function retryUpload(
    item: AcademicDocument,
    retryFile: File | undefined,
  ) {
    if (!accessToken || !retryFile) return;
    if (
      retryFile.type !== "application/pdf" ||
      !retryFile.name.toLowerCase().endsWith(".pdf")
    ) {
      setErrorMessage("Choose the original PDF file to retry this upload.");
      return;
    }
    setBusyDocumentId(item.id);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/documents/${item.id}/retry-upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/pdf",
        },
        body: retryFile,
      });
      if (!response.ok)
        throw new Error(
          await readError(response, "The upload could not be retried."),
        );
      const parsed = (await response.json()) as AcademicDocument;
      setDocuments((current) =>
        current.map((document) =>
          document.id === item.id ? { ...document, ...parsed } : document,
        ),
      );
      setNotice("Syllabus upload completed.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The upload could not be retried.",
      );
    } finally {
      setBusyDocumentId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Syllabus documents
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Upload private PDFs and extract page text locally. AI requirement
            extraction is disabled until a provider and informed-consent
            disclosure are configured.
          </p>
        </header>

        {errorMessage && (
          <p
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            role="alert"
          >
            {errorMessage}
          </p>
        )}
        {notice && (
          <p
            className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800"
            role="status"
          >
            {notice}
          </p>
        )}

        <section
          aria-labelledby="upload-syllabus-heading"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <h2
            className="text-lg font-semibold text-slate-900"
            id="upload-syllabus-heading"
          >
            Upload a syllabus
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            PDFs up to 20 MB and 200 pages are supported. Your document stays
            private and can be deleted at any time.
          </p>
          <form
            className="mt-4 grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => void uploadDocument(event)}
          >
            <label
              className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2"
              htmlFor="syllabus-pdf"
            >
              PDF file
              <input
                accept="application/pdf,.pdf"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                id="syllabus-pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                required
                type="file"
              />
            </label>
            <label
              className="grid gap-1 text-sm font-medium text-slate-700"
              htmlFor="syllabus-subject"
            >
              Subject (optional)
              <select
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                id="syllabus-subject"
                onChange={(event) => setSelectedSubjectId(event.target.value)}
                value={selectedSubjectId}
              >
                <option value="">Choose later</option>
                {subjects
                  .filter((subject) => subject.is_active)
                  .map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                className="w-full rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-60 sm:w-auto"
                disabled={isUploading}
                type="submit"
              >
                {isUploading ? "Uploading…" : "Upload PDF"}
              </button>
            </div>
          </form>
        </section>

        <section
          aria-labelledby="document-list-heading"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <h2
            className="text-lg font-semibold text-slate-900"
            id="document-list-heading"
          >
            Your documents
          </h2>
          {isLoading ? (
            <p className="mt-4 text-sm text-slate-600" role="status">
              Loading documents…
            </p>
          ) : documents.length === 0 ? (
            <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
              You haven’t uploaded a syllabus yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-200">
              {documents.map((item) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0"
                  key={item.id}
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium text-slate-900">
                      {item.filename}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {item.page_count} pages ·{" "}
                      {(item.file_size / (1024 * 1024)).toFixed(1)} MB ·{" "}
                      {new Date(item.created_at).toLocaleDateString()}
                    </p>
                    <p className="mt-1 text-xs text-slate-600" role="status">
                      {item.processing_status === "uploaded"
                        ? "Uploaded · text extraction not started"
                        : item.processing_status.replaceAll("_", " ")}
                    </p>
                    {(item.processing_status === "queued" ||
                      item.processing_status === "processing") && (
                      <div className="mt-2 max-w-sm">
                        <div
                          aria-label={`Text extraction progress for ${item.filename}`}
                          aria-valuemax={100}
                          aria-valuemin={0}
                          aria-valuenow={item.processing_progress_percent ?? 0}
                          className="h-2 overflow-hidden rounded bg-slate-200"
                          role="progressbar"
                        >
                          <div
                            className="h-full bg-indigo-600 transition-all"
                            style={{
                              width: `${item.processing_progress_percent ?? 0}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.processing_progress_percent ?? 0}% complete
                        </p>
                      </div>
                    )}
                    {item.processing_error_code && (
                      <p className="mt-1 text-xs text-amber-700">
                        Processing needs attention (
                        {item.processing_error_code.replaceAll("_", " ")}).
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {item.processing_status === "upload_failed" ? (
                      <label className="cursor-pointer rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
                        Retry upload
                        <input
                          accept="application/pdf,.pdf"
                          className="sr-only"
                          disabled={busyDocumentId === item.id}
                          onChange={(event) =>
                            void retryUpload(item, event.target.files?.[0])
                          }
                          type="file"
                        />
                      </label>
                    ) : (
                      <>
                        <button
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          disabled={
                            busyDocumentId === item.id ||
                            ["uploading", "deletion_pending"].includes(
                              item.processing_status,
                            )
                          }
                          onClick={() => void openDocument(item)}
                          type="button"
                        >
                          {busyDocumentId === item.id ? "Working…" : "Open PDF"}
                        </button>
                        {(item.processing_status === "uploaded" ||
                          item.processing_status === "processing_failed") && (
                          <button
                            className="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                            disabled={busyDocumentId === item.id}
                            onClick={() => void processDocument(item)}
                            type="button"
                          >
                            {item.processing_status === "processing_failed"
                              ? "Retry extraction"
                              : "Extract text"}
                          </button>
                        )}
                        {(item.processing_status === "text_extracted" ||
                          item.processing_status === "processing_failed") && (
                          <>
                            <button
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                              disabled={busyDocumentId === item.id}
                              onClick={() => void viewExtractedPages(item)}
                              type="button"
                            >
                              View page text
                            </button>
                            <button
                              className="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                              onClick={() =>
                                navigate(`/documents/${item.id}/review`)
                              }
                              type="button"
                            >
                              Review requirements
                            </button>
                          </>
                        )}
                      </>
                    )}
                    <button
                      className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      disabled={busyDocumentId === item.id}
                      onClick={() => void deleteDocument(item)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                  {selectedPages[item.id] && (
                    <div className="w-full basis-full rounded-lg bg-slate-50 p-4">
                      <h3 className="font-semibold text-slate-800">
                        Extracted page text
                      </h3>
                      <div className="mt-3 space-y-4">
                        {(selectedPages[item.id] ?? []).map((page) => (
                          <section key={page.page_number}>
                            <h4 className="text-sm font-medium text-slate-700">
                              Page {page.page_number}
                            </h4>
                            <p className="text-xs text-slate-500">
                              {page.extraction_method.replaceAll("_", " ")} ·{" "}
                              {page.extraction_status}
                            </p>
                            <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm text-slate-800">
                              {page.extracted_text ||
                                "No text found on this page."}
                            </pre>
                          </section>
                        ))}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
