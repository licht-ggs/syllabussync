import { useCallback, useContext, useEffect, useState } from "react";
import {
  academicWorkspaceSchema,
  candidateTaskCreationSchema,
  documentSchema,
  requirementCandidateListSchema,
  taskListResponseSchema,
  updateRequirementCandidateSchema,
  type RequirementCandidate,
  type Subject,
} from "@syllabussync/shared";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { resolveLocalDateTime } from "../tasks/task-date-time.js";
import { NavigationGuardContext } from "../../app/NavigationGuardContext";

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ?? fallback;
}

type CandidateDraft = {
  title: string;
  description: string;
  category: RequirementCandidate["category"];
  subject_id: string;
  original_date_expression: string;
  normalized_due_date: string;
  normalized_due_time: string;
  deadline_certainty: RequirementCandidate["deadline_certainty"];
};

function draftFromCandidate(candidate: RequirementCandidate): CandidateDraft {
  return {
    title: candidate.title,
    description: candidate.description,
    category: candidate.category,
    subject_id: candidate.subject_id ?? "",
    original_date_expression: candidate.original_date_expression ?? "",
    normalized_due_date: candidate.normalized_due_date ?? "",
    normalized_due_time: candidate.normalized_due_time?.slice(0, 5) ?? "",
    deadline_certainty: candidate.deadline_certainty,
  };
}

export function RequirementReviewPage() {
  const { documentId = "" } = useParams();
  const navigate = useNavigate();
  const registerNavigationGuard = useContext(NavigationGuardContext);
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [filename, setFilename] = useState("");
  const [candidates, setCandidates] = useState<RequirementCandidate[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [drafts, setDrafts] = useState<Record<string, CandidateDraft>>({});
  const [timezones, setTimezones] = useState<Record<string, string>>({});
  const [selectedInstants, setSelectedInstants] = useState<
    Record<string, string>
  >({});
  const [preferredTimezone, setPreferredTimezone] = useState("Asia/Manila");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) throw new Error("Your session is unavailable.");
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [
      documentResponse,
      candidateResponse,
      workspaceResponse,
      taskResponse,
    ] = await Promise.all([
      fetch(`/api/documents/${documentId}`, { headers }),
      fetch(`/api/documents/${documentId}/candidates`, { headers }),
      fetch("/api/academic/workspace", { headers }),
      fetch("/api/tasks?limit=1", { headers }),
    ]);
    if (!documentResponse.ok)
      throw new Error(
        await readError(documentResponse, "The syllabus could not be loaded."),
      );
    if (!candidateResponse.ok)
      throw new Error(
        await readError(candidateResponse, "Requirements could not be loaded."),
      );
    if (!workspaceResponse.ok)
      throw new Error("Your academic subjects could not be loaded.");
    if (!taskResponse.ok)
      throw new Error("Your task deadline preferences could not be loaded.");
    const [documentData, candidateData, workspaceData, taskData] =
      await Promise.all([
        documentResponse.json(),
        candidateResponse.json(),
        workspaceResponse.json(),
        taskResponse.json(),
      ]);
    const parsedDocument = documentSchema.safeParse(documentData);
    const parsedCandidates =
      requirementCandidateListSchema.safeParse(candidateData);
    const parsedWorkspace = academicWorkspaceSchema.safeParse(workspaceData);
    const parsedTasks = taskListResponseSchema.safeParse(taskData);
    if (
      !parsedDocument.success ||
      !parsedCandidates.success ||
      !parsedWorkspace.success ||
      !parsedTasks.success
    )
      throw new Error("The review data was invalid.");
    setFilename(parsedDocument.data.filename);
    setCandidates(parsedCandidates.data);
    setSubjects(parsedWorkspace.data.subjects);
    setPreferredTimezone(parsedTasks.data.preferred_timezone);
    setDrafts(
      Object.fromEntries(
        parsedCandidates.data.map((candidate) => [
          candidate.id,
          draftFromCandidate(candidate),
        ]),
      ),
    );
    setTimezones((current) =>
      Object.fromEntries(
        parsedCandidates.data.map((candidate) => [
          candidate.id,
          current[candidate.id] ?? parsedTasks.data.preferred_timezone,
        ]),
      ),
    );
  }, [accessToken, documentId]);

  useEffect(() => {
    let active = true;
    void load().catch((cause: unknown) => {
      if (active)
        setError(
          cause instanceof Error
            ? cause.message
            : "Requirements could not be loaded.",
        );
    });
    return () => {
      active = false;
    };
  }, [load]);

  const hasUnsavedChanges = candidates.some((candidate) => {
    const current = drafts[candidate.id];
    return Boolean(
      current &&
      JSON.stringify(current) !== JSON.stringify(draftFromCandidate(candidate)),
    );
  });

  useEffect(() => {
    if (!registerNavigationGuard) return;
    registerNavigationGuard(
      hasUnsavedChanges
        ? () => window.confirm("Discard your unsaved requirement changes?")
        : null,
    );
    return () => registerNavigationGuard(null);
  }, [hasUnsavedChanges, registerNavigationGuard]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  function updateDraft(
    candidateId: string,
    field: keyof CandidateDraft,
    value: string,
  ) {
    setSelectedInstants((current) => ({ ...current, [candidateId]: "" }));
    setDrafts((current) => ({
      ...current,
      [candidateId]: {
        ...current[candidateId]!,
        [field]: value,
      } as CandidateDraft,
    }));
  }

  async function openSourcePage(page: number) {
    if (!accessToken) return;
    const opened = window.open("about:blank", "_blank", "noopener,noreferrer");
    if (!opened) {
      setError("Allow pop-ups to open the cited PDF page.");
      return;
    }
    try {
      const response = await fetch(`/api/documents/${documentId}/content`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok)
        throw new Error(
          await readError(response, "The syllabus could not be opened."),
        );
      const url = URL.createObjectURL(await response.blob());
      opened.location.replace(`${url}#page=${page}`);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      opened.close();
      setError(
        cause instanceof Error
          ? cause.message
          : "The syllabus could not be opened.",
      );
    }
  }

  async function saveCandidate(candidate: RequirementCandidate) {
    if (!accessToken) return;
    const draft = drafts[candidate.id];
    if (!draft) return;
    setBusyId(candidate.id);
    setError(null);
    setNotice(null);
    try {
      const normalizedDate = draft.normalized_due_date || null;
      const normalizedTime = draft.normalized_due_time || null;
      const body = updateRequirementCandidateSchema.safeParse({
        title: draft.title,
        description: draft.description,
        category: draft.category,
        subject_id: draft.subject_id || null,
        original_date_expression: draft.original_date_expression || null,
        normalized_due_date: normalizedDate,
        normalized_due_time: normalizedDate ? normalizedTime : null,
        deadline_certainty: normalizedDate ? "exact" : draft.deadline_certainty,
      });
      if (!body.success)
        throw new Error(
          body.error.issues[0]?.message ?? "Review the candidate details.",
        );
      const response = await fetch(
        `/api/documents/${documentId}/candidates/${candidate.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...body.data,
            expected_updated_at: candidate.updated_at,
          }),
        },
      );
      if (!response.ok)
        throw new Error(
          await readError(response, "The requirement could not be saved."),
        );
      setNotice("Requirement saved.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The requirement could not be saved.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function rejectCandidate(candidate: RequirementCandidate) {
    if (
      !accessToken ||
      !window.confirm(
        "Reject this requirement? It will remain in the review history.",
      )
    )
      return;
    setBusyId(candidate.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/documents/${documentId}/candidates/${candidate.id}/reject`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!response.ok)
        throw new Error(
          await readError(response, "The requirement could not be rejected."),
        );
      setNotice("Requirement rejected.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The requirement could not be rejected.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function approveCandidate(candidate: RequirementCandidate) {
    if (!accessToken) return;
    const draft = drafts[candidate.id];
    if (
      !draft?.subject_id ||
      !draft.normalized_due_date ||
      draft.deadline_certainty !== "exact"
    ) {
      setError(
        "Save an exact deadline and choose a subject before creating a task.",
      );
      return;
    }
    let dueAt: string | null = null;
    const dueTime = draft.normalized_due_time || null;
    const dueTimezone = dueTime
      ? timezones[candidate.id]?.trim() || preferredTimezone
      : null;
    if (dueTime && dueTimezone) {
      const resolution = resolveLocalDateTime(
        draft.normalized_due_date,
        dueTime,
        dueTimezone,
      );
      if (resolution.kind === "invalid_timezone") {
        setError("Enter a valid IANA timezone.");
        return;
      }
      if (resolution.instants.length === 0) {
        setError(
          "That local time does not exist because of a daylight-saving transition.",
        );
        return;
      }
      if (resolution.instants.length > 1) {
        const selected = selectedInstants[candidate.id];
        if (!selected || !resolution.instants.includes(selected)) {
          setError(
            "Choose which occurrence of this repeated local time to use.",
          );
          return;
        }
        dueAt = selected;
      } else dueAt = resolution.instants[0] ?? null;
    }
    const input = candidateTaskCreationSchema.safeParse({
      subject_id: draft.subject_id,
      due_date: draft.normalized_due_date,
      due_time: dueTime,
      due_timezone: dueTimezone,
      due_at: dueAt,
      priority: "Normal",
      estimated_duration_minutes: null,
      reference_url: null,
    });
    if (!input.success) {
      setError(input.error.issues[0]?.message ?? "Review the task deadline.");
      return;
    }
    setBusyId(candidate.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/documents/${documentId}/candidates/${candidate.id}/approve`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input.data),
        },
      );
      if (!response.ok)
        throw new Error(
          await readError(response, "The task could not be created."),
        );
      setNotice("Approved requirement created as a task.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The task could not be created.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        className="text-sm font-semibold text-indigo-700 hover:underline"
        to="/documents"
      >
        ← Back to documents
      </Link>
      <header className="mt-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">
          Requirement review
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          {filename || "Syllabus requirements"}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Candidates are suggestions. Check each source excerpt, correct
          details, then approve only the requirements you want as tasks. Dates
          are not treated as confirmed until you explicitly save them.
        </p>
      </header>
      {error && (
        <p
          className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
          role="status"
        >
          {notice}
        </p>
      )}
      {candidates.length === 0 ? (
        <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <h2 className="font-semibold">
            No requirements are available to review yet
          </h2>
          <p className="mt-1 text-sm">
            Page text extraction is available. AI requirement extraction remains
            paused until a provider is selected and its privacy disclosure and
            consent safeguards are configured. No syllabus content has been sent
            to an external AI provider.
          </p>
        </section>
      ) : (
        <div className="mt-8 space-y-5">
          {candidates.map((candidate) => {
            const draft = drafts[candidate.id];
            const isEditable =
              ["pending_review", "edited"].includes(candidate.review_status) &&
              !candidate.created_task_id;
            return (
              <article
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                key={candidate.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                      {candidate.review_status.replaceAll("_", " ")}
                    </span>
                    <h2 className="mt-1 text-xl font-semibold text-slate-900">
                      {candidate.title}
                    </h2>
                  </div>
                  <button
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                    onClick={() => void openSourcePage(candidate.source_page)}
                    type="button"
                  >
                    Open PDF · page {candidate.source_page}
                  </button>
                </div>
                <blockquote className="mt-4 border-l-4 border-indigo-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  “{candidate.evidence_excerpt}”
                </blockquote>
                <p className="mt-2 text-xs text-slate-500">
                  {Math.round(candidate.confidence * 100)}% extraction
                  confidence · {candidate.extraction_provider}/
                  {candidate.extraction_model}. Confidence is not proof of
                  correctness.
                </p>
                {candidate.ambiguity_notes.length > 0 && (
                  <ul className="mt-3 list-disc pl-5 text-sm text-amber-800">
                    {candidate.ambiguity_notes.map((note, index) => (
                      <li key={`${index}-${note}`}>{note}</li>
                    ))}
                  </ul>
                )}
                {draft && (
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">
                      Title
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        disabled={!isEditable}
                        onChange={(event) =>
                          updateDraft(candidate.id, "title", event.target.value)
                        }
                        value={draft.title}
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Category
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                        disabled={!isEditable}
                        onChange={(event) =>
                          updateDraft(
                            candidate.id,
                            "category",
                            event.target.value,
                          )
                        }
                        value={draft.category}
                      >
                        {[
                          "assignment",
                          "examination",
                          "quiz",
                          "project",
                          "presentation",
                          "laboratory",
                          "report",
                          "activity",
                          "other",
                        ].map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                      Description
                      <textarea
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        disabled={!isEditable}
                        onChange={(event) =>
                          updateDraft(
                            candidate.id,
                            "description",
                            event.target.value,
                          )
                        }
                        rows={3}
                        value={draft.description}
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Subject
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                        disabled={!isEditable}
                        onChange={(event) =>
                          updateDraft(
                            candidate.id,
                            "subject_id",
                            event.target.value,
                          )
                        }
                        value={draft.subject_id}
                      >
                        <option value="">Choose a subject</option>
                        {subjects.map((subject) => (
                          <option key={subject.id} value={subject.id}>
                            {subject.name}
                            {subject.is_active ? "" : " (Archived)"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Deadline certainty
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                        disabled={
                          !isEditable || Boolean(draft.normalized_due_date)
                        }
                        onChange={(event) =>
                          updateDraft(
                            candidate.id,
                            "deadline_certainty",
                            event.target.value,
                          )
                        }
                        value={draft.deadline_certainty}
                      >
                        {["exact", "ambiguous", "relative", "unspecified"].map(
                          (certainty) => (
                            <option key={certainty} value={certainty}>
                              {certainty}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Confirmed due date
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        disabled={!isEditable}
                        onChange={(event) => {
                          updateDraft(
                            candidate.id,
                            "normalized_due_date",
                            event.target.value,
                          );
                          if (event.target.value)
                            updateDraft(
                              candidate.id,
                              "deadline_certainty",
                              "exact",
                            );
                          else {
                            updateDraft(
                              candidate.id,
                              "normalized_due_time",
                              "",
                            );
                            updateDraft(
                              candidate.id,
                              "deadline_certainty",
                              draft.original_date_expression
                                ? "ambiguous"
                                : "unspecified",
                            );
                          }
                        }}
                        type="date"
                        value={draft.normalized_due_date}
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Due time (optional)
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        disabled={!isEditable}
                        onChange={(event) =>
                          updateDraft(
                            candidate.id,
                            "normalized_due_time",
                            event.target.value,
                          )
                        }
                        type="time"
                        value={draft.normalized_due_time}
                      />
                    </label>
                    {draft.normalized_due_time && (
                      <label className="text-sm font-medium text-slate-700">
                        IANA timezone
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                          disabled={!isEditable}
                          onChange={(event) => {
                            setSelectedInstants((current) => ({
                              ...current,
                              [candidate.id]: "",
                            }));
                            setTimezones((current) => ({
                              ...current,
                              [candidate.id]: event.target.value,
                            }));
                          }}
                          placeholder="e.g. Asia/Manila"
                          value={timezones[candidate.id] ?? preferredTimezone}
                        />
                      </label>
                    )}
                    {draft.normalized_due_time &&
                      draft.normalized_due_date &&
                      (() => {
                        const timezone =
                          timezones[candidate.id] ?? preferredTimezone;
                        const resolution = resolveLocalDateTime(
                          draft.normalized_due_date,
                          draft.normalized_due_time,
                          timezone,
                        );
                        if (
                          resolution.kind !== "resolved" ||
                          resolution.instants.length < 2
                        )
                          return null;
                        return (
                          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                            This local time occurs twice. Choose one
                            <select
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              disabled={!isEditable}
                              onChange={(event) =>
                                setSelectedInstants((current) => ({
                                  ...current,
                                  [candidate.id]: event.target.value,
                                }))
                              }
                              value={selectedInstants[candidate.id] ?? ""}
                            >
                              <option value="">Choose occurrence</option>
                              {resolution.instants.map((instant, index) => (
                                <option key={instant} value={instant}>
                                  Occurrence {index + 1} ·{" "}
                                  {new Intl.DateTimeFormat(undefined, {
                                    timeZone: timezone,
                                    timeStyle: "long",
                                  }).format(new Date(instant))}
                                </option>
                              ))}
                            </select>
                          </label>
                        );
                      })()}
                    {draft.original_date_expression && (
                      <p className="text-sm text-slate-600 sm:col-span-2">
                        Source date expression: {draft.original_date_expression}
                      </p>
                    )}
                  </div>
                )}
                {draft && isEditable && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      disabled={busyId === candidate.id}
                      onClick={() => void saveCandidate(candidate)}
                      type="button"
                    >
                      Save corrections
                    </button>
                    <button
                      className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-60"
                      disabled={
                        busyId === candidate.id ||
                        draft.deadline_certainty !== "exact" ||
                        !draft.normalized_due_date ||
                        !draft.subject_id ||
                        candidate.deadline_certainty !== "exact" ||
                        !candidate.normalized_due_date ||
                        !candidate.subject_id
                      }
                      onClick={() => void approveCandidate(candidate)}
                      type="button"
                    >
                      Approve and create task
                    </button>
                    <button
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-60"
                      disabled={busyId === candidate.id}
                      onClick={() => void rejectCandidate(candidate)}
                      type="button"
                    >
                      Reject
                    </button>
                  </div>
                )}
                {candidate.review_status === "approved" &&
                  candidate.created_task_id && (
                    <button
                      className="mt-4 text-sm font-semibold text-indigo-700 hover:underline"
                      onClick={() =>
                        navigate(`/tasks/${candidate.created_task_id}`)
                      }
                      type="button"
                    >
                      Open created task
                    </button>
                  )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
