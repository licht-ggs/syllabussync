import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  academicPeriodCreateSchema,
  academicPeriodSchema,
  academicPeriodUpdateSchema,
  academicWorkspaceSchema,
  academicYearInputSchema,
  subjectCreateSchema,
  subjectUpdateSchema,
  type AcademicPeriod,
  type AcademicWorkspace,
  type AcademicYear,
  type Subject,
} from "@syllabussync/shared";
import { FormMessage } from "../auth/components/AuthLayout";
import { useAuth } from "../auth/useAuth";

type RequestMethod = "DELETE" | "PATCH" | "POST";

type DeleteCandidate =
  | {
      kind: "year";
      year: AcademicYear;
      periodCount: number;
    }
  | {
      kind: "period";
      period: AcademicPeriod;
      yearName: string;
      subjectCount: number;
    }
  | {
      kind: "subject";
      subject: Subject;
      periodName: string;
      yearName: string;
    };

type DeletionResult = {
  status: "deleted" | "blocked" | "review_required";
  academic_year?: {
    id: string;
    name: string;
    period_count: number;
    updated_at: string;
  };
  academic_period?: {
    id: string;
    academic_year_id: string;
    name: string;
    subject_count: number;
    updated_at: string;
  };
  subject?: {
    id: string;
    name: string;
    subject_code: string | null;
    instructor: string | null;
    updated_at: string;
  };
};

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly result?: DeletionResult,
  ) {
    super(message);
  }
}

async function fetchWorkspace(accessToken: string): Promise<AcademicWorkspace> {
  const response = await fetch("/api/academic/workspace", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error("The academic workspace could not be loaded.");
  }

  const parsed = academicWorkspaceSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("The academic workspace response was invalid.");
  }

  return parsed.data;
}

async function sendRequest(
  accessToken: string,
  path: string,
  method: RequestMethod,
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    result?: DeletionResult;
  } | null;

  if (!response.ok) {
    throw new ApiRequestError(
      payload?.error ?? "The request could not be completed.",
      response.status,
      payload?.result,
    );
  }

  return payload;
}

export function AcademicWorkspace({ view = "workspace" }: { view?: "workspace" | "archive" }) {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [workspace, setWorkspace] = useState<AcademicWorkspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [yearName, setYearName] = useState("");
  const [editingYearId, setEditingYearId] = useState<string | null>(null);
  const [periodName, setPeriodName] = useState("");
  const [periodYearId, setPeriodYearId] = useState("");
  const [periodStartDate, setPeriodStartDate] = useState("");
  const [periodEndDate, setPeriodEndDate] = useState("");
  const [makeFirstPeriodCurrent, setMakeFirstPeriodCurrent] = useState(false);
  const [isYearFormOpen, setIsYearFormOpen] = useState(true);
  const [isPeriodFormOpen, setIsPeriodFormOpen] = useState(true);
  const [isSubjectFormOpen, setIsSubjectFormOpen] = useState(true);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [instructor, setInstructor] = useState("");
  const [units, setUnits] = useState("");
  const [scheduleText, setScheduleText] = useState("");
  const [room, setRoom] = useState("");
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [archiveCategory, setArchiveCategory] = useState<
    "periods" | "subjects"
  >("periods");
  const [deletion, setDeletion] = useState<DeleteCandidate | null>(null);
  const [deletionReviewVersion, setDeletionReviewVersion] = useState(0);
  const deletionTrigger = useRef<HTMLElement | null>(null);
  const archiveHeading = useRef<HTMLHeadingElement>(null);

  const reloadWorkspace = useCallback(async () => {
    if (!accessToken) {
      throw new Error("Your session is unavailable.");
    }
    setWorkspace(await fetchWorkspace(accessToken));
  }, [accessToken]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setErrorMessage(null);

    if (!accessToken) {
      setWorkspace(null);
      setErrorMessage(
        "Your academic workspace is unavailable. Please sign in again.",
      );
      setIsLoading(false);
      return;
    }

    void fetchWorkspace(accessToken)
      .then((data) => {
        if (active) {
          setWorkspace(data);
        }
      })
      .catch(() => {
        if (active) {
          setErrorMessage(
            "Your academic workspace could not be loaded. Please try again.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken]);

  const years = workspace?.academic_years ?? [];
  const periods = useMemo(() => workspace?.academic_periods ?? [], [workspace]);
  const subjects = workspace?.subjects ?? [];
  const periodsByYear = useMemo(() => {
    const groups = new Map<string, AcademicPeriod[]>();
    for (const period of periods) {
      const group = groups.get(period.academic_year_id) ?? [];
      group.push(period);
      groups.set(period.academic_year_id, group);
    }
    return groups;
  }, [periods]);

  const currentPeriod = periods.find(
    (period) =>
      period.id === workspace?.current_academic_period_id &&
      period.archived_at === null,
  );
  const currentSubjects = subjects.filter(
    (subject) =>
      subject.academic_period_id === currentPeriod?.id && subject.is_active,
  );
  const archivedPeriods = periods.filter(
    (period) => period.archived_at !== null,
  );
  const individuallyArchivedSubjects = subjects.filter((subject) => {
    const parentPeriod = periods.find(
      (period) => period.id === subject.academic_period_id,
    );
    return !subject.is_active && parentPeriod?.archived_at === null;
  });

  async function performMutation(
    path: string,
    method: RequestMethod,
    body: unknown,
    successMessage: string,
  ): Promise<boolean> {
    if (!accessToken) {
      setErrorMessage("Your session is unavailable. Please sign in again.");
      return false;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      await sendRequest(accessToken, path, method, body);
      try {
        await reloadWorkspace();
        setNotice(successMessage);
      } catch {
        setErrorMessage(
          "The change was saved, but the workspace could not be refreshed. Reload the page before trying again.",
        );
      }
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof ApiRequestError
          ? error.message
          : "The request could not be completed. Please try again.",
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleYearSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = academicYearInputSchema.safeParse({ name: yearName });
    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ?? "Enter a valid academic year name.",
      );
      return;
    }

    const path = editingYearId
      ? `/api/academic/years/${editingYearId}`
      : "/api/academic/years";
    const method = editingYearId ? "PATCH" : "POST";
    const saved = await performMutation(
      path,
      method,
      parsed.data,
      editingYearId ? "Academic year updated." : "Academic year created.",
    );
    if (saved) {
      setYearName("");
      setEditingYearId(null);
      setIsYearFormOpen(false);
    }
  }

  async function handlePeriodSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const periodFields = {
      name: periodName,
      start_date: periodStartDate || null,
      end_date: periodEndDate || null,
    };

    const academicYearId = periodYearId || years[0]?.id;
    if (!editingPeriodId && !academicYearId) {
      setErrorMessage("Create an academic year before adding a period.");
      return;
    }
    const parsed = editingPeriodId
      ? academicPeriodUpdateSchema.safeParse(periodFields)
      : academicPeriodCreateSchema.safeParse({
          ...periodFields,
          academic_year_id: academicYearId,
        });
    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ??
          "Enter valid academic period details.",
      );
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setNotice(null);
    let createdPeriod: AcademicPeriod | null = null;
    let currentSelectionCompleted = false;
    try {
      if (!accessToken) {
        throw new Error("Your session is unavailable.");
      }

      const path = editingPeriodId
        ? `/api/academic/periods/${editingPeriodId}`
        : "/api/academic/periods";
      const result = await sendRequest(
        accessToken,
        path,
        editingPeriodId ? "PATCH" : "POST",
        parsed.data,
      );

      if (!editingPeriodId) {
        createdPeriod = academicPeriodSchema.parse(result);
      }
      if (createdPeriod && makeFirstPeriodCurrent) {
        await sendRequest(
          accessToken,
          `/api/academic/periods/${createdPeriod.id}/current`,
          "POST",
        );
        currentSelectionCompleted = true;
      }
      await reloadWorkspace();
      setNotice(
        editingPeriodId
          ? "Academic period updated."
          : "Academic period created.",
      );
      setEditingPeriodId(null);
      setPeriodName("");
      setPeriodStartDate("");
      setPeriodEndDate("");
      setMakeFirstPeriodCurrent(false);
      setIsPeriodFormOpen(false);
    } catch (error) {
      const creationCompleted = createdPeriod !== null;
      const currentSelectionFailed =
        creationCompleted &&
        makeFirstPeriodCurrent &&
        !currentSelectionCompleted;
      setErrorMessage(
        currentSelectionFailed
          ? "The period was created, but it could not be confirmed as current. Reload the workspace before trying again."
          : creationCompleted
            ? "The period was created, but the workspace could not be refreshed. Reload the page before trying again."
            : error instanceof ApiRequestError
              ? error.message
              : "The request could not be completed. Please try again.",
      );
      if (creationCompleted) {
        setPeriodName("");
        setPeriodStartDate("");
        setPeriodEndDate("");
        setMakeFirstPeriodCurrent(false);
      }
      try {
        await reloadWorkspace();
      } catch {
        setErrorMessage(
          "The request could not be completed and the workspace could not be refreshed.",
        );
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSubjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentPeriod && !editingSubjectId) {
      setErrorMessage("Select a current period before adding a subject.");
      return;
    }

    const subjectFields = {
      name: subjectName,
      subject_code: subjectCode.trim() || null,
      instructor: instructor.trim() || null,
      units: units.trim() ? Number(units) : null,
      schedule_text: scheduleText.trim() || null,
      room: room.trim() || null,
    };
    const parsed = editingSubjectId
      ? subjectUpdateSchema.safeParse(subjectFields)
      : subjectCreateSchema.safeParse({
          ...subjectFields,
          academic_period_id: currentPeriod?.id,
        });
    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ?? "Enter valid subject details.",
      );
      return;
    }
    const saved = await performMutation(
      editingSubjectId
        ? `/api/academic/subjects/${editingSubjectId}`
        : "/api/academic/subjects",
      editingSubjectId ? "PATCH" : "POST",
      parsed.data,
      editingSubjectId ? "Subject updated." : "Subject created.",
    );
    if (saved) {
      resetSubjectForm();
    }
  }

  function resetSubjectForm() {
    setSubjectName("");
    setSubjectCode("");
    setInstructor("");
    setUnits("");
    setScheduleText("");
    setRoom("");
    setEditingSubjectId(null);
  }

  function beginEditYear(year: AcademicYear) {
    setIsYearFormOpen(true);
    setEditingYearId(year.id);
    setYearName(year.name);
  }

  function beginEditPeriod(period: AcademicPeriod) {
    setIsPeriodFormOpen(true);
    setEditingPeriodId(period.id);
    setPeriodName(period.name);
    setPeriodYearId(period.academic_year_id);
    setPeriodStartDate(period.start_date ?? "");
    setPeriodEndDate(period.end_date ?? "");
  }

  function beginEditSubject(subject: Subject) {
    setIsSubjectFormOpen(true);
    setEditingSubjectId(subject.id);
    setSubjectName(subject.name);
    setSubjectCode(subject.subject_code ?? "");
    setInstructor(subject.instructor ?? "");
    setUnits(subject.units?.toString() ?? "");
    setScheduleText(subject.schedule_text ?? "");
    setRoom(subject.room ?? "");
  }

  function beginDeletion(
    candidate: DeleteCandidate,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    deletionTrigger.current = event.currentTarget;
    setDeletion(candidate);
  }

  function closeDeletion() {
    setDeletion(null);
    queueMicrotask(() => deletionTrigger.current?.focus());
  }

  async function handleDelete() {
    if (!deletion || !accessToken) {
      return;
    }

    const target =
      deletion.kind === "year"
        ? {
            path: `/api/academic/years/${deletion.year.id}`,
            method: "DELETE" as const,
          }
        : deletion.kind === "period"
          ? {
              path: `/api/academic/periods/${deletion.period.id}`,
              method: "DELETE" as const,
            }
          : {
              path: `/api/academic/subjects/${deletion.subject.id}`,
              method: "DELETE" as const,
            };
    const body =
      deletion.kind === "year"
        ? {
            expected_period_count: deletion.periodCount,
            expected_updated_at: deletion.year.updated_at,
          }
        : deletion.kind === "period"
          ? {
              expected_subject_count: deletion.subjectCount,
              expected_updated_at: deletion.period.updated_at,
            }
          : { expected_updated_at: deletion.subject.updated_at };

    setIsSaving(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      await sendRequest(accessToken, target.path, target.method, body);
      setDeletion(null);
      setNotice("The archived record was permanently deleted.");
      try {
        await reloadWorkspace();
        archiveHeading.current?.focus();
      } catch {
        setErrorMessage(
          "The record was deleted, but the workspace could not be refreshed. Reload the page.",
        );
      }
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        error.status === 409 &&
        error.result?.status === "review_required"
      ) {
        const updated = error.result;
        if (deletion.kind === "year" && updated.academic_year) {
          setDeletion({
            kind: "year",
            periodCount: updated.academic_year.period_count,
            year: { ...deletion.year, ...updated.academic_year },
          });
        } else if (deletion.kind === "period" && updated.academic_period) {
          setDeletion({
            kind: "period",
            subjectCount: updated.academic_period.subject_count,
            period: { ...deletion.period, ...updated.academic_period },
            yearName: deletion.yearName,
          });
        } else if (deletion.kind === "subject" && updated.subject) {
          setDeletion({
            kind: "subject",
            subject: { ...deletion.subject, ...updated.subject },
            periodName: deletion.periodName,
            yearName: deletion.yearName,
          });
        }
        setDeletionReviewVersion((value) => value + 1);
        await reloadWorkspace();
      } else {
        setErrorMessage(
          error instanceof ApiRequestError
            ? error.message
            : "The record could not be deleted. Please try again.",
        );
        setDeletion(null);
        try {
          await reloadWorkspace();
          archiveHeading.current?.focus();
        } catch {
          setErrorMessage(
            "The record could not be deleted and the workspace could not be refreshed.",
          );
        }
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <p role="status">Loading your academic records…</p>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      {errorMessage && <FormMessage kind="error">{errorMessage}</FormMessage>}
      {notice && <FormMessage kind="success">{notice}</FormMessage>}

      {view === "workspace" && (
        <>
      <section
        aria-labelledby="years-heading"
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <h2 className="text-xl font-semibold text-slate-900" id="years-heading">
          Academic years and periods
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Organize your subjects in the academic periods that work for you.
        </p>

        <details className="mt-5" open={isYearFormOpen} onToggle={(event) => setIsYearFormOpen(event.currentTarget.open)}>
          <summary className="mb-3 w-fit cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">{editingYearId ? "Edit academic year" : "Add an academic year"}</summary>
        <form className="flex flex-wrap gap-3" onSubmit={handleYearSubmit}>
          <label className="sr-only" htmlFor="academic-year-name">
            Academic year name
          </label>
          <input
            className="min-w-52 flex-1 rounded-lg border border-slate-300 px-3 py-2"
            id="academic-year-name"
            maxLength={120}
            onChange={(event) => setYearName(event.target.value)}
            placeholder="For example, 2026–2027"
            required
            value={yearName}
          />
          <button
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={isSaving}
          >
            {isSaving
              ? "Saving…"
              : editingYearId
                ? "Save academic year"
                : "Add academic year"}
          </button>
          {editingYearId && (
            <button
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              onClick={() => {
                setEditingYearId(null);
                setYearName("");
              }}
              type="button"
            >
              Cancel edit
            </button>
          )}
        </form>
        </details>

        {years.length === 0 ? (
          <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            Create an academic year to start organizing your periods. No school
            or institution details are required.
          </p>
        ) : (
          <ul className="mt-5 space-y-4">
            {years.map((year) => {
              const yearPeriods = periodsByYear.get(year.id) ?? [];
              const activeYearPeriods = yearPeriods.filter(
                (period) => period.archived_at === null,
              );
              return (
                <li
                  className="rounded-lg border border-slate-200 p-4"
                  key={year.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {year.name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {yearPeriods.length}{" "}
                        {yearPeriods.length === 1 ? "period" : "periods"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                        onClick={() => beginEditYear(year)}
                        type="button"
                      >
                        Edit year
                      </button>
                      {yearPeriods.length === 0 && (
                        <button
                          className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-800"
                          onClick={(event) =>
                            beginDeletion(
                              {
                                kind: "year",
                                year,
                                periodCount: 0,
                              },
                              event,
                            )
                          }
                          type="button"
                        >
                          Permanently delete
                        </button>
                      )}
                    </div>
                  </div>

                  {activeYearPeriods.length > 0 && (
                    <ul className="mt-4 space-y-2">
                      {activeYearPeriods.map((period) => {
                        const isCurrent =
                          workspace?.current_academic_period_id === period.id;
                        return (
                          <li
                            className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3"
                            key={period.id}
                          >
                            <div>
                              <p className="font-medium text-slate-800">
                                {period.name}
                                {isCurrent && (
                                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                                    Current
                                  </span>
                                )}
                              </p>
                              <p className="text-sm text-slate-600">
                                {formatPeriodDates(period)}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {!isCurrent && (
                                <button
                                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                                  disabled={isSaving}
                                  onClick={() =>
                                    void performMutation(
                                      `/api/academic/periods/${period.id}/current`,
                                      "POST",
                                      null,
                                      "Current period updated.",
                                    )
                                  }
                                  type="button"
                                >
                                  Set current
                                </button>
                              )}
                              <button
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                                onClick={() => beginEditPeriod(period)}
                                type="button"
                              >
                                Edit
                              </button>
                              <button
                                className="rounded-md border border-amber-300 px-3 py-1.5 text-sm text-amber-900"
                                disabled={isSaving}
                                onClick={() =>
                                  void performMutation(
                                    `/api/academic/periods/${period.id}/archive`,
                                    "POST",
                                    null,
                                    "Academic period archived.",
                                  )
                                }
                                type="button"
                              >
                                Archive
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {years.length > 0 && (
          <details className="mt-6" open={isPeriodFormOpen} onToggle={(event) => setIsPeriodFormOpen(event.currentTarget.open)}>
          <summary className="mb-3 w-fit cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">{editingPeriodId ? "Edit academic period" : "Add a period"}</summary>
          <form
            className="grid gap-3 rounded-lg border border-dashed border-slate-300 p-4 sm:grid-cols-2"
            onSubmit={handlePeriodSubmit}
          >
            <h3 className="font-medium sm:col-span-2">
              {editingPeriodId ? "Edit academic period" : "Add a period"}
            </h3>
            {editingPeriodId ? (
              <p className="text-sm text-slate-700">
                Academic year:{" "}
                {years.find((year) => year.id === periodYearId)?.name}
              </p>
            ) : (
              <label className="text-sm font-medium text-slate-700">
                Academic year
                <select
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                  onChange={(event) => setPeriodYearId(event.target.value)}
                  required
                  value={periodYearId || years[0]?.id}
                >
                  {years.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-sm font-medium text-slate-700">
              Period name
              <input
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                maxLength={120}
                onChange={(event) => setPeriodName(event.target.value)}
                required
                value={periodName}
              />
            </label>
            <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:max-w-md">
              <label className="text-sm font-medium text-slate-700">
                Start date
                <input
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                  onChange={(event) => setPeriodStartDate(event.target.value)}
                  type="date"
                  value={periodStartDate}
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                End date
                <input
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                  onChange={(event) => setPeriodEndDate(event.target.value)}
                  type="date"
                  value={periodEndDate}
                />
              </label>
            </div>
            {!editingPeriodId &&
              periods.length === 0 &&
              workspace?.current_academic_period_id === null && (
                <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                  <input
                    checked={makeFirstPeriodCurrent}
                    onChange={(event) =>
                      setMakeFirstPeriodCurrent(event.target.checked)
                    }
                    type="checkbox"
                  />
                  Set this first period as current
                </label>
              )}
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={isSaving}
              >
                {isSaving
                  ? "Saving…"
                  : editingPeriodId
                    ? "Save period"
                    : "Add period"}
              </button>
              {editingPeriodId && (
                <button
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                  onClick={() => {
                    setEditingPeriodId(null);
                    setPeriodName("");
                    setPeriodStartDate("");
                    setPeriodEndDate("");
                  }}
                  type="button"
                >
                  Cancel edit
                </button>
              )}
            </div>
          </form>
          </details>
        )}
      </section>

      <section
        aria-labelledby="subjects-heading"
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <h2
          className="text-xl font-semibold text-slate-900"
          id="subjects-heading"
        >
          Current Active Period
        </h2>
        {currentPeriod ? (
          <>
            <p className="mt-1 text-sm text-slate-600">
              {yearNameFor(currentPeriod, years)} · {currentPeriod.name}
            </p>
            {currentSubjects.length === 0 ? (
              <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                No active subjects in this period yet. Add a subject below.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-200">
                {currentSubjects.map((subject) => (
                  <SubjectRow
                    key={subject.id}
                    onArchive={() =>
                      void performMutation(
                        `/api/academic/subjects/${subject.id}/archive`,
                        "POST",
                        null,
                        "Subject archived.",
                      )
                    }
                    onEdit={() => beginEditSubject(subject)}
                    subject={subject}
                  />
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="mt-4 rounded-lg bg-slate-50 p-4">
            <p className="text-sm text-slate-700">
              Choose a period to make it current. SyllabusSync will not select
              one automatically based on dates.
            </p>
            {periods.filter((period) => period.archived_at === null).length ===
            0 ? (
              <p className="mt-2 text-sm text-slate-600">
                Create an academic period to get started.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {periods
                  .filter((period) => period.archived_at === null)
                  .map((period) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3"
                      key={period.id}
                    >
                      <span>
                        {yearNameFor(period, years)} · {period.name}
                      </span>
                      <button
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                        disabled={isSaving}
                        onClick={() =>
                          void performMutation(
                            `/api/academic/periods/${period.id}/current`,
                            "POST",
                            null,
                            "Current period updated.",
                          )
                        }
                        type="button"
                      >
                        Set current
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        {(currentPeriod || editingSubjectId) && (
          <details className="mt-5" open={isSubjectFormOpen} onToggle={(event) => setIsSubjectFormOpen(event.currentTarget.open)}>
          <summary className="mb-3 w-fit cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">{editingSubjectId ? "Edit subject" : "Add a subject"}</summary>
          <form
            className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-2"
            onSubmit={handleSubjectSubmit}
          >
            <h3 className="font-medium sm:col-span-2">
              {editingSubjectId ? "Edit subject" : "Add a subject"}
              {editingSubjectId && (
                <button
                  className="ml-3 text-sm font-normal text-slate-600 underline"
                  onClick={resetSubjectForm}
                  type="button"
                >
                  Cancel edit
                </button>
              )}
            </h3>
            <TextInput
              label="Subject name"
              maxLength={160}
              onChange={setSubjectName}
              required
              value={subjectName}
            />
            <TextInput
              label="Subject code (optional)"
              maxLength={40}
              onChange={setSubjectCode}
              value={subjectCode}
            />
            <TextInput
              label="Instructor (optional)"
              maxLength={120}
              onChange={setInstructor}
              value={instructor}
            />
            <TextInput
              label="Units or credits (optional)"
              min="0"
              onChange={setUnits}
              step="0.01"
              type="number"
              value={units}
            />
            <TextInput
              label="Class schedule (optional)"
              maxLength={2000}
              onChange={setScheduleText}
              value={scheduleText}
            />
            <TextInput
              label="Room or location (optional)"
              maxLength={120}
              onChange={setRoom}
              value={room}
            />
            <button
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2 sm:justify-self-start"
              disabled={isSaving}
            >
              {isSaving
                ? "Saving…"
                : editingSubjectId
                  ? "Save subject"
                  : "Add subject"}
            </button>
          </form>
          </details>
        )}
      </section>

        </>
      )}

      {view === "archive" && (
        <>
      <section
        aria-labelledby="archive-heading"
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <h2
          className="text-xl font-semibold text-slate-900"
          id="archive-heading"
          ref={archiveHeading}
          tabIndex={-1}
        >
          Archive
        </h2>
        <div
          aria-label="Archive categories"
          className="mt-4 flex flex-wrap gap-2"
          role="group"
        >
          <button
            aria-pressed={archiveCategory === "periods"}
            className={`rounded-lg px-4 py-2 text-sm ${archiveCategory === "periods" ? "bg-slate-900 text-white" : "border border-slate-300"}`}
            onClick={() => setArchiveCategory("periods")}
            type="button"
          >
            Academic periods
          </button>
          <button
            aria-pressed={archiveCategory === "subjects"}
            className={`rounded-lg px-4 py-2 text-sm ${archiveCategory === "subjects" ? "bg-slate-900 text-white" : "border border-slate-300"}`}
            onClick={() => setArchiveCategory("subjects")}
            type="button"
          >
            Subjects
          </button>
        </div>

        {archiveCategory === "periods" ? (
          archivedPeriods.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">
              Archived academic periods will appear here.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {years.map((year) => {
                const yearArchivedPeriods = archivedPeriods.filter(
                  (period) => period.academic_year_id === year.id,
                );
                if (yearArchivedPeriods.length === 0) {
                  return null;
                }
                return (
                  <li key={year.id}>
                    <h3 className="font-medium text-slate-800">{year.name}</h3>
                    <ul className="mt-2 space-y-2">
                      {yearArchivedPeriods.map((period) => {
                        const periodSubjects = subjects.filter(
                          (subject) => subject.academic_period_id === period.id,
                        );
                        return (
                          <li
                            className="rounded-lg border border-slate-200 p-4"
                            key={period.id}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <h4 className="font-semibold">{period.name}</h4>
                                <p className="text-sm text-slate-600">
                                  {periodSubjects.length}{" "}
                                  {periodSubjects.length === 1
                                    ? "subject"
                                    : "subjects"}{" "}
                                  will be included in period deletion.
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                                  disabled={isSaving}
                                  onClick={() => beginEditPeriod(period)}
                                  type="button"
                                >
                                  Edit period
                                </button>
                                <button
                                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                                  disabled={isSaving}
                                  onClick={() =>
                                    void performMutation(
                                      `/api/academic/periods/${period.id}/restore`,
                                      "POST",
                                      null,
                                      "Academic period restored.",
                                    )
                                  }
                                  type="button"
                                >
                                  Restore period
                                </button>
                                <button
                                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-800"
                                  onClick={(event) =>
                                    beginDeletion(
                                      {
                                        kind: "period",
                                        period,
                                        yearName: year.name,
                                        subjectCount: periodSubjects.length,
                                      },
                                      event,
                                    )
                                  }
                                  type="button"
                                >
                                  Permanently delete
                                </button>
                              </div>
                            </div>
                            {periodSubjects.length > 0 && (
                              <ul className="mt-3 divide-y divide-slate-200 border-t border-slate-200">
                                {periodSubjects.map((subject) => (
                                  <SubjectRow
                                    key={subject.id}
                                    onDelete={(event) =>
                                      beginDeletion(
                                        {
                                          kind: "subject",
                                          subject,
                                          periodName: period.name,
                                          yearName: year.name,
                                        },
                                        event,
                                      )
                                    }
                                    onEdit={() => beginEditSubject(subject)}
                                    subject={subject}
                                  />
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )
        ) : individuallyArchivedSubjects.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">
            Individually archived subjects from active periods will appear here.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200">
            {individuallyArchivedSubjects.map((subject) => {
              const parentPeriod = periods.find(
                (period) => period.id === subject.academic_period_id,
              );
              return (
                <SubjectRow
                  key={subject.id}
                  {...(parentPeriod
                    ? {
                        context: `${yearNameFor(parentPeriod, years)} · ${parentPeriod.name}`,
                      }
                    : {})}
                  onDelete={(event) =>
                    parentPeriod &&
                    beginDeletion(
                      {
                        kind: "subject",
                        subject,
                        periodName: parentPeriod.name,
                        yearName: yearNameFor(parentPeriod, years),
                      },
                      event,
                    )
                  }
                  onEdit={() => beginEditSubject(subject)}
                  onRestore={() =>
                    void performMutation(
                      `/api/academic/subjects/${subject.id}/restore`,
                      "POST",
                      null,
                      "Subject restored.",
                    )
                  }
                  subject={subject}
                />
              );
            })}
          </ul>
        )}
      </section>

        </>
      )}

      {deletion && (
        <DeletionDialog
          candidate={deletion}
          isSaving={isSaving}
          onCancel={closeDeletion}
          onConfirm={() => void handleDelete()}
          onReviewVersion={deletionReviewVersion}
        />
      )}
    </div>
  );
}

function formatPeriodDates(period: AcademicPeriod) {
  if (period.start_date && period.end_date) {
    return `${period.start_date} – ${period.end_date}`;
  }
  if (period.start_date) {
    return `Starts ${period.start_date}`;
  }
  if (period.end_date) {
    return `Ends ${period.end_date}`;
  }
  return "Dates not set";
}

function yearNameFor(period: AcademicPeriod, years: AcademicYear[]) {
  return years.find((year) => year.id === period.academic_year_id)?.name ?? "";
}

function TextInput({
  label,
  maxLength,
  min,
  onChange,
  required = false,
  step,
  type = "text",
  value,
}: {
  label: string;
  maxLength?: number;
  min?: string;
  onChange: (value: string) => void;
  required?: boolean;
  step?: string;
  type?: "number" | "text";
  value: string;
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
        max={type === "number" ? "9999.99" : undefined}
        maxLength={maxLength}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        step={step}
        type={type}
        value={value}
      />
    </label>
  );
}

function SubjectRow({
  context,
  onArchive,
  onDelete,
  onEdit,
  onRestore,
  subject,
}: {
  context?: string;
  onArchive?: () => void;
  onDelete?: (event: MouseEvent<HTMLButtonElement>) => void;
  onEdit: () => void;
  onRestore?: () => void;
  subject: Subject;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div>
        <p className="font-medium text-slate-900">{subject.name}</p>
        <p className="break-words text-sm text-slate-600">
          {[subject.subject_code, subject.instructor, context]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {(subject.schedule_text || subject.room || subject.units !== null) && (
          <p className="mt-1 text-sm text-slate-600">
            {[
              subject.units !== null ? `${subject.units} units` : null,
              subject.schedule_text,
              subject.room,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          onClick={onEdit}
          type="button"
        >
          Edit
        </button>
        {onArchive && (
          <button
            className="rounded-md border border-amber-300 px-3 py-1.5 text-sm text-amber-900"
            onClick={onArchive}
            type="button"
          >
            Archive
          </button>
        )}
        {onRestore && (
          <button
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            onClick={onRestore}
            type="button"
          >
            Restore
          </button>
        )}
        {onDelete && (
          <button
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-800"
            onClick={onDelete}
            type="button"
          >
            Permanently delete
          </button>
        )}
      </div>
    </li>
  );
}

function DeletionDialog({
  candidate,
  isSaving,
  onCancel,
  onConfirm,
  onReviewVersion,
}: {
  candidate: DeleteCandidate;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onReviewVersion: number;
}) {
  const [secondsRemaining, setSecondsRemaining] = useState(5);
  const dialogRef = useRef<HTMLDivElement>(null);
  const yearIsBlocked = candidate.kind === "year" && candidate.periodCount > 0;

  useEffect(() => {
    dialogRef.current?.focus();
    setSecondsRemaining(5);
    const timer = window.setInterval(() => {
      setSecondsRemaining((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [onReviewVersion]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) {
      return;
    }

    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === dialogRef.current)
    ) {
      event.preventDefault();
      last?.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        document.activeElement === dialogRef.current)
    ) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div
        aria-describedby="delete-description"
        aria-labelledby="delete-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="alertdialog"
        tabIndex={-1}
      >
        <h2 className="text-xl font-semibold text-slate-900" id="delete-title">
          Permanently delete {candidate.kind}?
        </h2>
        <div
          className="mt-4 space-y-2 text-sm text-slate-700"
          id="delete-description"
        >
          {candidate.kind === "year" ? (
            <>
              <p>
                Delete academic year <strong>{candidate.year.name}</strong>.
              </p>
              <p>This year currently contains no academic periods.</p>
            </>
          ) : candidate.kind === "period" ? (
            <>
              <p>
                Delete <strong>{candidate.period.name}</strong> from{" "}
                {candidate.yearName}.
              </p>
              <p>
                This will also permanently delete {candidate.subjectCount}{" "}
                {candidate.subjectCount === 1 ? "subject" : "subjects"} in the
                period.
              </p>
            </>
          ) : (
            <>
              <p>
                Delete <strong>{candidate.subject.name}</strong> from{" "}
                {candidate.periodName} ({candidate.yearName}).
              </p>
              <p>
                {[candidate.subject.subject_code, candidate.subject.instructor]
                  .filter(Boolean)
                  .join(" · ") || "No additional subject details"}
              </p>
            </>
          )}
          <p className="font-semibold text-red-800">
            This action is permanent and cannot be undone.
          </p>
          {yearIsBlocked && (
            <p className="text-red-800">
              This year now contains periods and cannot be deleted.
            </p>
          )}
        </div>
        <p aria-live="polite" className="mt-4 text-sm text-slate-600">
          {yearIsBlocked
            ? "Review the updated summary, then cancel."
            : secondsRemaining > 0
              ? `You can confirm in ${secondsRemaining} seconds.`
              : "You may now choose whether to confirm deletion."}
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
            disabled={isSaving}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSaving || secondsRemaining > 0 || yearIsBlocked}
            onClick={onConfirm}
            type="button"
          >
            {isSaving ? "Deleting…" : "Permanently delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
