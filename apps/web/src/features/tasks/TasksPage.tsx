import {
  academicWorkspaceSchema,
  taskHistoryListResponseSchema,
  taskListResponseSchema,
  taskSchema,
  taskStatusSchema,
  type AcademicWorkspace,
  type CreateTaskInput,
  type Task,
  type TaskHistoryEvent,
  type TaskStatus,
} from "@syllabussync/shared";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useNavigationType,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { NavigationGuardContext } from "../../app/NavigationGuardContext";
import { FormMessage } from "../auth/components/AuthLayout";
import { useAuth } from "../auth/useAuth";
import { TaskForm } from "./TaskForm";
import {
  deadlineChangeLabels,
  formatDateOnly,
  formatTaskDeadline,
  isTaskOverdue,
} from "./task-date-time.js";

type TaskFilters = {
  view: "active" | "completed";
  status: TaskStatus | "";
  subject_id: string;
  task_type: string;
  priority: string;
  search: string;
  sort: "due_date_asc" | "due_date_desc";
};

type Confirmation =
  | { kind: "deadline"; task: Task; input: CreateTaskInput }
  | { kind: "status"; task: Task; status: TaskStatus }
  | { kind: "delete"; task: Task };

class TaskApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly task?: Task,
  ) {
    super(message);
  }
}

async function apiRequest(
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    task?: unknown;
  } | null;
  if (!response.ok) {
    const task = taskSchema.safeParse(payload?.task);
    throw new TaskApiError(
      payload?.error ?? "The request could not be completed.",
      response.status,
      task.success ? task.data : undefined,
    );
  }
  return payload;
}

function filtersFromSearchParams(params: URLSearchParams): TaskFilters {
  const status = taskStatusSchema.safeParse(params.get("status"));
  return {
    view: params.get("view") === "completed" ? "completed" : "active",
    status: status.success ? status.data : "",
    subject_id: params.get("subject_id") ?? "",
    task_type: params.get("task_type") ?? "",
    priority: params.get("priority") ?? "",
    search: params.get("search") ?? "",
    sort:
      params.get("sort") === "due_date_desc" ? "due_date_desc" : "due_date_asc",
  };
}

function taskSearchParams(filters: TaskFilters, cursor?: string | null) {
  const params = new URLSearchParams({
    view: filters.view,
    sort: filters.sort,
  });
  if (filters.status) params.set("status", filters.status);
  if (filters.subject_id) params.set("subject_id", filters.subject_id);
  if (filters.task_type) params.set("task_type", filters.task_type);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.search) params.set("search", filters.search);
  if (cursor) params.set("cursor", cursor);
  return params;
}

function taskQueryString(filters: TaskFilters, cursor?: string | null) {
  return taskSearchParams(filters, cursor).toString();
}

async function fetchTaskPage(
  token: string,
  filters: TaskFilters,
  cursor?: string | null,
) {
  const response = await apiRequest(
    token,
    `/api/tasks?${taskQueryString(filters, cursor)}`,
  );
  const parsed = taskListResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new Error("The task list response was invalid.");
  }
  return parsed.data;
}

function ConfirmationDialog({
  title,
  children,
  confirmLabel,
  isPending,
  onCancel,
  onConfirm,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      aria-labelledby="task-confirmation-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
    >
      <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2
          className="text-xl font-semibold text-slate-900"
          id="task-confirmation-title"
        >
          {title}
        </h2>
        <div className="mt-3 text-sm leading-6 text-slate-700">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
            disabled={isPending}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={isPending}
            onClick={onConfirm}
            type="button"
          >
            {isPending ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function historyDescription(
  entry: TaskHistoryEvent,
  workspace: AcademicWorkspace | null,
) {
  if (entry.event_type === "status_changed") {
    return `Status changed from ${String(entry.old_values.status ?? "unknown")} to ${String(entry.new_values.status ?? "unknown")}.`;
  }
  if (entry.event_type === "subject_reassigned") {
    const oldSubjectId = String(entry.old_values.subject_id ?? "");
    const newSubjectId = String(entry.new_values.subject_id ?? "");
    const oldSubject =
      workspace?.subjects.find((subject) => subject.id === oldSubjectId)
        ?.name ?? oldSubjectId;
    const newSubject =
      workspace?.subjects.find((subject) => subject.id === newSubjectId)
        ?.name ?? newSubjectId;
    return `Subject changed from ${oldSubject} to ${newSubject}.`;
  }

  const oldDate = String(entry.old_values.due_date ?? "unknown");
  const newDate = String(entry.new_values.due_date ?? "unknown");
  const oldTime = entry.old_values.due_time
    ? ` at ${String(entry.old_values.due_time)}`
    : "";
  const newTime = entry.new_values.due_time
    ? ` at ${String(entry.new_values.due_time)}`
    : "";
  return `Deadline changed from ${formatDateOnly(oldDate)}${oldTime} to ${formatDateOnly(newDate)}${newTime}.`;
}

const taskTypes = [
  "Assignment",
  "Quiz",
  "Examination",
  "Project",
  "Activity",
  "Laboratory",
  "Practical Exam",
  "Other",
] as const;
const priorities = ["Low", "Normal", "High", "Urgent"] as const;
const statuses = ["Not Started", "In Progress", "Completed"] as const;

export function TasksPage() {
  const { session } = useAuth();
  const { taskId } = useParams();
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const registerNavigationGuard = useContext(NavigationGuardContext);
  const isEditRoute = Boolean(taskId && location.pathname.endsWith("/edit"));
  const accessToken = session?.access_token;
  const [workspace, setWorkspace] = useState<AcademicWorkspace | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [preferredTimezone, setPreferredTimezone] = useState("Asia/Manila");
  const [filters, setFilters] = useState<TaskFilters>(() =>
    filtersFromSearchParams(searchParams),
  );
  const [searchText, setSearchText] = useState(
    () => filtersFromSearchParams(searchParams).search,
  );
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [routeTask, setRouteTask] = useState<Task | null>(null);
  const [isTaskLoading, setIsTaskLoading] = useState(Boolean(taskId));
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const [formDirty, setFormDirty] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [statusChoice, setStatusChoice] = useState<TaskStatus>("In Progress");
  const [history, setHistory] = useState<TaskHistoryEvent[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const nextCursorRef = useRef<string | null>(null);
  const skipCursorFetchRef = useRef<string | null>(null);
  const selectedTask =
    (taskId ? tasks.find((task) => task.id === taskId) : undefined) ??
    (routeTask?.id === taskId ? routeTask : null);

  const loadTasks = useCallback(
    async (append = false) => {
      if (!accessToken) {
        setTasks([]);
        setErrorMessage("Your session is unavailable. Please sign in again.");
        setIsLoading(false);
        return;
      }

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);
      try {
        const cursorUsed = append
          ? nextCursorRef.current
          : searchParams.get("cursor");
        const page = await fetchTaskPage(accessToken, filters, cursorUsed);
        setTasks((current) =>
          append ? [...current, ...page.tasks] : page.tasks,
        );
        nextCursorRef.current = page.next_cursor;
        setNextCursor(page.next_cursor);
        setPreferredTimezone(page.preferred_timezone);
        if (append && cursorUsed) {
          skipCursorFetchRef.current = cursorUsed;
          setSearchParams(taskSearchParams(filters, cursorUsed));
        }
      } catch (error) {
        setErrorMessage(
          error instanceof TaskApiError
            ? error.message
            : "Tasks could not be loaded. Please try again.",
        );
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [accessToken, filters, searchParams, setSearchParams],
  );

  useEffect(() => {
    if (taskId) return;
    if (
      skipCursorFetchRef.current !== null &&
      skipCursorFetchRef.current === searchParams.get("cursor")
    ) {
      skipCursorFetchRef.current = null;
      return;
    }
    void loadTasks();
  }, [filters, loadTasks, reloadKey, searchParams, taskId]);

  useEffect(() => {
    if (navigationType !== "POP") return;
    const nextFilters = filtersFromSearchParams(searchParams);
    setFilters((current) =>
      JSON.stringify(current) === JSON.stringify(nextFilters)
        ? current
        : nextFilters,
    );
    setSearchText(nextFilters.search);
    nextCursorRef.current = searchParams.get("cursor");
  }, [navigationType, searchParams]);

  useEffect(() => {
    if (!taskId || !accessToken) {
      setRouteTask(null);
      setIsTaskLoading(false);
      return;
    }
    let active = true;
    setIsTaskLoading(true);
    void apiRequest(accessToken, `/api/tasks/${taskId}`)
      .then((response) => {
        const parsed = taskSchema.safeParse(response);
        if (!parsed.success) throw new Error("The task response was invalid.");
        if (active) {
          setRouteTask(parsed.data);
          if (isEditRoute) setEditingTask((current) => current ?? parsed.data);
        }
      })
      .catch(() => {
        if (active)
          setErrorMessage(
            "This task could not be loaded. It may have been deleted.",
          );
      })
      .finally(() => {
        if (active) setIsTaskLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, isEditRoute, taskId]);

  useEffect(() => {
    if (!accessToken) {
      setWorkspace(null);
      return;
    }

    let active = true;
    void apiRequest(accessToken, "/api/academic/workspace")
      .then((response) => {
        const parsed = academicWorkspaceSchema.safeParse(response);
        if (!parsed.success) {
          throw new Error("The academic workspace response was invalid.");
        }
        if (active) {
          setWorkspace(parsed.data);
        }
      })
      .catch(() => {
        if (active) {
          setErrorMessage(
            "Subjects could not be loaded. Please try again before creating a task.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !taskId || isEditRoute) {
      setHistory([]);
      setHistoryCursor(null);
      return;
    }

    let active = true;
    setIsHistoryLoading(true);
    void apiRequest(accessToken, `/api/tasks/${taskId}/history?limit=20`)
      .then((response) => {
        const parsed = taskHistoryListResponseSchema.safeParse(response);
        if (!parsed.success) {
          throw new Error("Task history response was invalid.");
        }
        if (active) {
          setHistory(parsed.data.history);
          setHistoryCursor(parsed.data.next_cursor);
        }
      })
      .catch(() => {
        if (active) {
          setErrorMessage("Task history could not be loaded.");
        }
      })
      .finally(() => {
        if (active) {
          setIsHistoryLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, taskId, isEditRoute, historyPage]);

  const availableSubjects = useMemo(() => {
    if (!workspace) return [];
    return workspace.subjects.filter((subject) => {
      const period = workspace.academic_periods.find(
        (candidate) => candidate.id === subject.academic_period_id,
      );
      return subject.is_active && period?.archived_at === null;
    });
  }, [workspace]);
  const formSubjects = useMemo(() => {
    if (!workspace || !editingTask) return availableSubjects;
    const currentSubject = workspace.subjects.find(
      (subject) => subject.id === editingTask.subject_id,
    );
    if (
      currentSubject &&
      !availableSubjects.some((subject) => subject.id === currentSubject.id)
    ) {
      return [...availableSubjects, currentSubject];
    }
    return availableSubjects;
  }, [availableSubjects, editingTask, workspace]);

  function applyFilterUpdate(next: TaskFilters) {
    setFilters(next);
    setNextCursor(null);
    nextCursorRef.current = null;
    setSearchParams(taskSearchParams(next));
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilterUpdate({ ...filters, search: searchText.trim() });
  }

  function setFilter<K extends keyof TaskFilters>(
    key: K,
    value: TaskFilters[K],
  ) {
    applyFilterUpdate({ ...filters, [key]: value });
  }

  function openTaskDetail(task: Task) {
    setRouteTask(task);
    setIsFormOpen(false);
    setEditingTask(undefined);
  }

  function openCreateForm() {
    setEditingTask(undefined);
    setIsFormOpen(true);
    setErrorMessage(null);
    setNotice(null);
  }

  function openEditForm(task: Task) {
    setEditingTask(task);
    setRouteTask(task);
    setErrorMessage(null);
    setNotice(null);
    navigate(`/tasks/${task.id}/edit${location.search}`);
  }

  function closeForm() {
    setIsFormOpen(false);
    setFormDirty(false);
    if (isEditRoute && taskId) {
      navigate(`/tasks/${taskId}${location.search}`);
      return;
    }
    setEditingTask(undefined);
  }

  async function saveTask(input: CreateTaskInput, task?: Task) {
    if (!accessToken) {
      setErrorMessage("Your session is unavailable. Please sign in again.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const response = await apiRequest(
        accessToken,
        task ? `/api/tasks/${task.id}` : "/api/tasks",
        task ? "PATCH" : "POST",
        task ? { ...input, expected_version: task.version } : input,
      );
      const parsed = taskSchema.safeParse(response);
      if (!parsed.success) {
        throw new Error("The saved task response was invalid.");
      }
      closeForm();
      setRouteTask(parsed.data);
      setNotice(task ? "Task changes saved." : "Task created.");
      setReloadKey((value) => value + 1);
      navigate(`/tasks/${parsed.data.id}${location.search}`);
    } catch (error) {
      if (error instanceof TaskApiError && error.task) {
        setTasks((current) =>
          current.map((item) =>
            item.id === error.task?.id ? error.task : item,
          ),
        );
        if (error.task.id === taskId) setRouteTask(error.task);
      }
      setErrorMessage(
        error instanceof TaskApiError
          ? error.message
          : "The task could not be saved. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handleFormSubmit(input: CreateTaskInput, deadlineChanged: boolean) {
    if (editingTask && deadlineChanged) {
      setConfirmation({ kind: "deadline", task: editingTask, input });
      return;
    }
    void saveTask(input, editingTask);
  }

  async function changeStatus(task: Task, status: TaskStatus) {
    if (!accessToken) {
      setErrorMessage("Your session is unavailable. Please sign in again.");
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const response = await apiRequest(
        accessToken,
        `/api/tasks/${task.id}/status`,
        "PATCH",
        { status, expected_version: task.version },
      );
      const parsed = taskSchema.safeParse(response);
      if (!parsed.success) {
        throw new Error("The updated task response was invalid.");
      }
      setNotice(`Task status changed to ${status}.`);
      setRouteTask(parsed.data);
      setReloadKey((value) => value + 1);
      setHistoryPage((value) => value + 1);
    } catch (error) {
      if (error instanceof TaskApiError && error.task) {
        setTasks((current) =>
          current.map((item) =>
            item.id === error.task?.id ? error.task : item,
          ),
        );
      }
      setErrorMessage(
        error instanceof TaskApiError
          ? error.message
          : "Task status could not be changed.",
      );
    } finally {
      setIsSaving(false);
      setConfirmation(null);
    }
  }

  async function deleteTask(task: Task) {
    if (!accessToken) {
      setErrorMessage("Your session is unavailable. Please sign in again.");
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      await apiRequest(accessToken, `/api/tasks/${task.id}`, "DELETE", {
        expected_version: task.version,
      });
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setRouteTask(null);
      setConfirmation(null);
      navigate(`/tasks${location.search}`);
      setNotice("Task deleted.");
    } catch (error) {
      if (error instanceof TaskApiError && error.task) {
        setTasks((current) =>
          current.map((item) =>
            item.id === error.task?.id ? error.task : item,
          ),
        );
      }
      setErrorMessage(
        error instanceof TaskApiError
          ? error.message
          : "The task could not be deleted.",
      );
      setConfirmation(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function loadMoreHistory() {
    if (!accessToken || !taskId || !historyCursor) return;
    setIsHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "20",
        cursor: historyCursor,
      });
      const response = await apiRequest(
        accessToken,
        `/api/tasks/${taskId}/history?${params.toString()}`,
      );
      const parsed = taskHistoryListResponseSchema.safeParse(response);
      if (!parsed.success) {
        throw new Error("Task history response was invalid.");
      }
      setHistory((current) => [...current, ...parsed.data.history]);
      setHistoryCursor(parsed.data.next_cursor);
    } catch {
      setErrorMessage("Older task history could not be loaded.");
    } finally {
      setIsHistoryLoading(false);
    }
  }

  async function confirmAction() {
    if (!confirmation) return;
    if (confirmation.kind === "deadline") {
      await saveTask(confirmation.input, confirmation.task);
      setConfirmation(null);
    } else if (confirmation.kind === "status") {
      await changeStatus(confirmation.task, confirmation.status);
    } else {
      await deleteTask(confirmation.task);
    }
  }

  useEffect(() => {
    if (!registerNavigationGuard) return;
    registerNavigationGuard(
      formDirty
        ? () => window.confirm("Discard your unsaved task changes?")
        : null,
    );
    return () => registerNavigationGuard(null);
  }, [formDirty, registerNavigationGuard]);

  const selectedSubject = selectedTask
    ? workspace?.subjects.find(
        (subject) => subject.id === selectedTask.subject_id,
      )
    : undefined;
  const returnToTaskList = () => {
    if (formDirty && !window.confirm("Discard your unsaved task changes?"))
      return;
    setFormDirty(false);
    setEditingTask(undefined);
    setIsFormOpen(false);
    navigate(`/tasks${location.search}`);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 pb-24 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-wide text-slate-500">
              SYLLABUSSYNC
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              {isEditRoute
                ? `Edit ${selectedTask?.title ?? "task"}`
                : taskId
                  ? "Task details"
                  : "Tasks"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Keep track of academic work and deadlines across your subjects.
            </p>
          </div>
          <div className="flex gap-3">
            {taskId && (
              <button
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                onClick={returnToTaskList}
                type="button"
              >
                Back to tasks
              </button>
            )}
          </div>
        </header>

        {errorMessage && <FormMessage kind="error">{errorMessage}</FormMessage>}
        {notice && <FormMessage kind="success">{notice}</FormMessage>}

        <section aria-label="Task management" className="mt-6 space-y-6">
          {!taskId && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2" role="group" aria-label="Task view">
                  {(["active", "completed"] as const).map((view) => (
                    <button
                      aria-pressed={filters.view === view}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        filters.view === view
                          ? "bg-indigo-700 text-white"
                          : "border border-slate-300 bg-white text-slate-700"
                      }`}
                      key={view}
                      onClick={() => {
                        applyFilterUpdate({
                          ...filters,
                          view,
                          status:
                            view === "completed" &&
                            filters.status !== "Completed"
                              ? ""
                              : view === "active" &&
                                  filters.status === "Completed"
                                ? ""
                                : filters.status,
                        });
                      }}
                      type="button"
                    >
                      {view === "active" ? "Active tasks" : "Completed"}
                    </button>
                  ))}
                </div>
                <button
                  className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-60"
                  disabled={
                    !workspace ||
                    (availableSubjects.length === 0 && !isFormOpen)
                  }
                  onClick={openCreateForm}
                  type="button"
                >
                  New task
                </button>
              </div>

              <form
                aria-label="Search and filter tasks"
                className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
                onSubmit={applyFilters}
              >
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                  Search task titles
                  <input
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                    onChange={(event) => setSearchText(event.target.value)}
                    value={searchText}
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Subject
                  <select
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    onChange={(event) =>
                      setFilter("subject_id", event.target.value)
                    }
                    value={filters.subject_id}
                  >
                    <option value="">All subjects</option>
                    {workspace?.academic_periods.map((period) => {
                      const year = workspace.academic_years.find(
                        (item) => item.id === period.academic_year_id,
                      );
                      const periodSubjects = workspace.subjects.filter(
                        (subject) => subject.academic_period_id === period.id,
                      );
                      return periodSubjects.length ? (
                        <optgroup
                          key={period.id}
                          label={`${year?.name ?? "Academic year"} · ${period.name}`}
                        >
                          {periodSubjects.map((subject) => (
                            <option key={subject.id} value={subject.id}>
                              {subject.name}
                            </option>
                          ))}
                        </optgroup>
                      ) : null;
                    })}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Status
                  <select
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    onChange={(event) =>
                      setFilter("status", event.target.value as TaskStatus | "")
                    }
                    value={filters.status}
                  >
                    <option value="">Any status</option>
                    {statuses
                      .filter((status) =>
                        filters.view === "completed"
                          ? status === "Completed"
                          : status !== "Completed",
                      )
                      .map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Task type
                  <select
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    onChange={(event) =>
                      setFilter("task_type", event.target.value)
                    }
                    value={filters.task_type}
                  >
                    <option value="">All types</option>
                    {taskTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Priority
                  <select
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    onChange={(event) =>
                      setFilter("priority", event.target.value)
                    }
                    value={filters.priority}
                  >
                    <option value="">All priorities</option>
                    {priorities.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Sort by deadline
                  <select
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    onChange={(event) =>
                      setFilter(
                        "sort",
                        event.target.value as TaskFilters["sort"],
                      )
                    }
                    value={filters.sort}
                  >
                    <option value="due_date_asc">Soonest first</option>
                    <option value="due_date_desc">Latest first</option>
                  </select>
                </label>
                <div className="flex items-end">
                  <button
                    className="w-full rounded-lg border border-indigo-700 px-4 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-50"
                    type="submit"
                  >
                    Search tasks
                  </button>
                </div>
              </form>
            </>
          )}

          {isFormOpen && !taskId && workspace && (
            <TaskForm
              isSaving={isSaving}
              key={editingTask?.id ?? "new-task"}
              onCancel={closeForm}
              onDirtyChange={setFormDirty}
              onSubmit={handleFormSubmit}
              periods={workspace.academic_periods}
              preferredTimezone={preferredTimezone}
              subjects={formSubjects}
              {...(editingTask ? { task: editingTask } : {})}
            />
          )}

          {isEditRoute &&
            routeTask &&
            editingTask &&
            routeTask.version !== editingTask.version && (
              <p
                className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
                role="status"
              >
                Latest server version: <strong>{routeTask.title}</strong>. Your
                draft is still open for review.
              </p>
            )}

          {isEditRoute && selectedTask && workspace && (
            <TaskForm
              isSaving={isSaving}
              key={selectedTask.id}
              onCancel={closeForm}
              onDirtyChange={setFormDirty}
              onSubmit={handleFormSubmit}
              periods={workspace.academic_periods}
              preferredTimezone={preferredTimezone}
              subjects={formSubjects}
              task={editingTask ?? selectedTask}
            />
          )}

          {taskId && !isEditRoute && isTaskLoading && (
            <p
              className="rounded-xl bg-white p-5 text-sm text-slate-600"
              role="status"
            >
              Loading task…
            </p>
          )}

          <div className="space-y-6">
            {!taskId && (
              <section aria-label="Task list" className="space-y-3">
                {isLoading ? (
                  <p
                    className="rounded-xl bg-white p-5 text-sm text-slate-600"
                    role="status"
                  >
                    Loading tasks…
                  </p>
                ) : tasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                    No tasks match these filters.
                  </div>
                ) : (
                  tasks.map((task) => {
                    const subject = workspace?.subjects.find(
                      (item) => item.id === task.subject_id,
                    );
                    const overdue = isTaskOverdue(task, preferredTimezone);
                    return (
                      <article
                        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                        key={task.id}
                      >
                        <Link
                          aria-label={`View ${task.title}`}
                          className="block w-full text-left"
                          to={`/tasks/${task.id}${location.search}`}
                          onClick={() => openTaskDetail(task)}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <h2 className="font-semibold text-slate-900">
                              {task.title}
                            </h2>
                            {overdue && (
                              <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
                                Overdue
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-slate-600">
                            {subject?.name ?? "Subject unavailable"} ·{" "}
                            {task.task_type} · {task.priority}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className="font-medium text-slate-800">
                              {formatTaskDeadline(task)}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                              {task.status}
                            </span>
                          </div>
                        </Link>
                      </article>
                    );
                  })
                )}
                {nextCursor && (
                  <button
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 disabled:opacity-60"
                    disabled={isLoadingMore || isLoading}
                    onClick={() => void loadTasks(true)}
                    type="button"
                  >
                    {isLoadingMore ? "Loading…" : "Load more tasks"}
                  </button>
                )}
              </section>
            )}

            {selectedTask && !isEditRoute && (
              <section
                aria-label="Task details"
                className="w-full space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="text-xl font-semibold text-slate-900">
                      {selectedTask.title}
                    </h2>
                    <Link
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold"
                      onClick={(event) => {
                        event.preventDefault();
                        openEditForm(selectedTask);
                      }}
                      to={`/tasks/${selectedTask.id}/edit${location.search}`}
                    >
                      Edit
                    </Link>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {selectedSubject?.name ?? "Subject unavailable"} ·{" "}
                    {selectedTask.task_type}
                    {selectedTask.custom_type
                      ? ` — ${selectedTask.custom_type}`
                      : ""}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-800">
                    {formatTaskDeadline(selectedTask)}
                    {selectedTask.due_timezone
                      ? ` (${selectedTask.due_timezone})`
                      : ""}
                  </p>
                  {selectedTask.description && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                      {selectedTask.description}
                    </p>
                  )}
                  {selectedTask.estimated_duration_minutes && (
                    <p className="mt-3 text-sm text-slate-600">
                      Estimated duration:{" "}
                      {selectedTask.estimated_duration_minutes} minutes
                    </p>
                  )}
                  {selectedTask.reference_url && (
                    <a
                      className="mt-3 block break-all text-sm text-indigo-700 underline"
                      href={selectedTask.reference_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open reference
                    </a>
                  )}
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <label className="block text-sm font-medium text-slate-700">
                    Change status
                    <select
                      className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                      onChange={(event) =>
                        setStatusChoice(event.target.value as TaskStatus)
                      }
                      value={statusChoice}
                    >
                      {taskStatusSchema.options.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      disabled={
                        isSaving || statusChoice === selectedTask.status
                      }
                      onClick={() =>
                        setConfirmation({
                          kind: "status",
                          task: selectedTask,
                          status: statusChoice,
                        })
                      }
                      type="button"
                    >
                      Update status
                    </button>
                    <button
                      className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-800"
                      onClick={() =>
                        setConfirmation({ kind: "delete", task: selectedTask })
                      }
                      type="button"
                    >
                      Delete task
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <h3 className="font-semibold text-slate-900">Task history</h3>
                  {isHistoryLoading && (
                    <p className="mt-2 text-sm text-slate-600" role="status">
                      Loading task history…
                    </p>
                  )}
                  {!isHistoryLoading && history.length === 0 && (
                    <p className="mt-2 text-sm text-slate-600">
                      No tracked changes yet.
                    </p>
                  )}
                  <ol className="mt-3 space-y-3">
                    {history.map((entry) => (
                      <li
                        className="border-l-2 border-indigo-200 pl-3"
                        key={entry.id}
                      >
                        <p className="text-sm text-slate-800">
                          {historyDescription(entry, workspace)}
                        </p>
                        <time
                          className="mt-1 block text-xs text-slate-500"
                          dateTime={entry.changed_at}
                        >
                          {new Intl.DateTimeFormat(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(entry.changed_at))}
                        </time>
                      </li>
                    ))}
                  </ol>
                  {historyCursor && (
                    <button
                      className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-60"
                      disabled={isHistoryLoading}
                      onClick={() => void loadMoreHistory()}
                      type="button"
                    >
                      Load older history
                    </button>
                  )}
                </div>
              </section>
            )}
          </div>
        </section>
      </div>

      {confirmation?.kind === "deadline" &&
        (() => {
          const labels = deadlineChangeLabels(
            confirmation.task,
            confirmation.input,
          );
          return (
            <ConfirmationDialog
              confirmLabel="Confirm deadline change"
              isPending={isSaving}
              onCancel={() => setConfirmation(null)}
              onConfirm={() => void confirmAction()}
              title="Confirm deadline change"
            >
              <p>This task currently has a confirmed deadline of:</p>
              <p className="mt-2 font-semibold">{labels.oldDeadline}</p>
              <p className="mt-3">The new deadline will be:</p>
              <p className="mt-2 font-semibold">{labels.newDeadline}</p>
              <p className="mt-3">
                This change will be recorded in task history.
              </p>
            </ConfirmationDialog>
          );
        })()}

      {confirmation?.kind === "status" && (
        <ConfirmationDialog
          confirmLabel="Confirm status change"
          isPending={isSaving}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void confirmAction()}
          title="Confirm status change"
        >
          <p>
            Change <strong>{confirmation.task.title}</strong> from{" "}
            <strong>{confirmation.task.status}</strong> to{" "}
            <strong>{confirmation.status}</strong>?
          </p>
          <p className="mt-2">
            The task will update only after the server confirms the change.
          </p>
        </ConfirmationDialog>
      )}

      {confirmation?.kind === "delete" && (
        <ConfirmationDialog
          confirmLabel="Delete task"
          isPending={isSaving}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void confirmAction()}
          title="Delete task?"
        >
          <p>
            Delete <strong>{confirmation.task.title}</strong> and its associated
            task history? This cannot be undone.
          </p>
        </ConfirmationDialog>
      )}
    </main>
  );
}
