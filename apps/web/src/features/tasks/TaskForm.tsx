import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createTaskInputSchema,
  taskPrioritySchema,
  taskTypeSchema,
  type CreateTaskInput,
  type Task,
} from "@syllabussync/shared";
import type { AcademicPeriod, Subject } from "@syllabussync/shared";
import { FormMessage } from "../auth/components/AuthLayout";
import { resolveLocalDateTime } from "./task-date-time.js";

type TaskFormValues = {
  subject_id: string;
  title: string;
  description: string;
  task_type: string;
  custom_type: string;
  due_date: string;
  due_time: string;
  due_timezone: string;
  priority: string;
  estimated_duration_minutes: string;
  reference_url: string;
};

type TaskFormProps = {
  task?: Task;
  subjects: Subject[];
  periods: AcademicPeriod[];
  preferredTimezone: string;
  isSaving: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onSubmit: (input: CreateTaskInput, deadlineChanged: boolean) => void;
};

function initialValues(
  task: Task | undefined,
  subjects: Subject[],
  preferredTimezone: string,
): TaskFormValues {
  const firstAvailable = subjects.find((subject) => subject.is_active)?.id;
  return {
    subject_id: task?.subject_id ?? firstAvailable ?? "",
    title: task?.title ?? "",
    description: task?.description ?? "",
    task_type: task?.task_type ?? "Assignment",
    custom_type: task?.custom_type ?? "",
    due_date:
      task?.due_date ??
      new Intl.DateTimeFormat("en-CA", {
        timeZone: preferredTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    due_time: task?.due_time?.slice(0, 5) ?? "",
    due_timezone: task?.due_timezone ?? preferredTimezone,
    priority: task?.priority ?? "Normal",
    estimated_duration_minutes:
      task?.estimated_duration_minutes?.toString() ?? "",
    reference_url: task?.reference_url ?? "",
  };
}

function periodFor(subject: Subject, periods: AcademicPeriod[]) {
  return periods.find((period) => period.id === subject.academic_period_id);
}

function candidateLabel(instant: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "long",
  }).format(new Date(instant));
}

export function TaskForm({
  task,
  subjects,
  periods,
  preferredTimezone,
  isSaving,
  onDirtyChange,
  onCancel,
  onSubmit,
}: TaskFormProps) {
  const initial = useMemo(
    () => initialValues(task, subjects, preferredTimezone),
    [preferredTimezone, subjects, task],
  );
  const [values, setValues] = useState(initial);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ambiguousInstants, setAmbiguousInstants] = useState<string[] | null>(
    null,
  );
  const [selectedInstant, setSelectedInstant] = useState("");

  useEffect(() => {
    setValues(initial);
    setErrorMessage(null);
    setAmbiguousInstants(null);
    setSelectedInstant("");
  }, [initial]);

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) {
      return;
    }

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  function updateField<K extends keyof TaskFormValues>(
    field: K,
    value: TaskFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    setAmbiguousInstants(null);
    setSelectedInstant("");
    setErrorMessage(null);
  }

  function handleCancel() {
    if (dirty && !window.confirm("Discard your unsaved task changes?")) {
      return;
    }
    onCancel();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const formDueTime = values.due_time || null;
    const dueTimezone = formDueTime
      ? values.due_timezone.trim() || preferredTimezone
      : null;
    const deadlineUnchanged =
      task !== undefined &&
      task.due_date === values.due_date &&
      task.due_time?.slice(0, 5) === formDueTime &&
      task.due_timezone === dueTimezone;
    const dueTime =
      deadlineUnchanged && task.due_time ? task.due_time : formDueTime;
    let dueAt: string | null = null;

    if (dueTime) {
      if (deadlineUnchanged) {
        dueAt = task.due_at;
      } else if (ambiguousInstants && selectedInstant) {
        dueAt = selectedInstant;
      } else if (dueTimezone) {
        const resolution = resolveLocalDateTime(
          values.due_date,
          dueTime,
          dueTimezone,
        );
        if (resolution.kind === "invalid_timezone") {
          setErrorMessage("Enter a supported IANA timezone.");
          return;
        }
        if (resolution.instants.length === 0) {
          setErrorMessage(
            "That local time does not exist because of a daylight-saving transition.",
          );
          return;
        }
        if (resolution.instants.length > 1) {
          setAmbiguousInstants(resolution.instants);
          setErrorMessage(
            "This local time occurs twice. Choose which occurrence to use.",
          );
          return;
        }
        dueAt = resolution.instants[0] ?? null;
      } else {
        setErrorMessage("Enter a timezone for the timed deadline.");
        return;
      }
    }

    const duration = values.estimated_duration_minutes.trim()
      ? Number(values.estimated_duration_minutes)
      : null;
    const parsedPriority = taskPrioritySchema.safeParse(values.priority);
    const parsedType = taskTypeSchema.safeParse(values.task_type);
    if (!parsedPriority.success || !parsedType.success) {
      setErrorMessage("Choose a valid task type and priority.");
      return;
    }

    const parsed = createTaskInputSchema.safeParse({
      subject_id: values.subject_id,
      title: values.title,
      description: values.description.trim() || null,
      task_type: parsedType.data,
      custom_type:
        parsedType.data === "Other" ? values.custom_type.trim() || null : null,
      due_date: values.due_date,
      due_time: dueTime,
      due_timezone: dueTimezone,
      due_at: dueAt,
      priority: parsedPriority.data,
      estimated_duration_minutes: duration,
      reference_url: values.reference_url.trim() || null,
    });

    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ?? "Review the task details.",
      );
      return;
    }

    const deadlineChanged =
      task !== undefined &&
      (task.due_date !== parsed.data.due_date ||
        task.due_time !== parsed.data.due_time ||
        task.due_timezone !== parsed.data.due_timezone ||
        task.due_at !== parsed.data.due_at);

    onSubmit(parsed.data, deadlineChanged);
  }

  const selectableSubjects = subjects.filter((subject) => {
    if (subject.id === task?.subject_id) {
      return true;
    }
    const period = periodFor(subject, periods);
    return subject.is_active && period?.archived_at === null;
  });

  return (
    <form
      aria-label={task ? "Edit task" : "Create task"}
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      onSubmit={handleSubmit}
    >
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          {task ? "Edit task" : "Create a task"}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Required fields are marked with an asterisk.
        </p>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        Subject <span aria-hidden="true">*</span>
        <select
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          onChange={(event) => updateField("subject_id", event.target.value)}
          required
          value={values.subject_id}
        >
          <option value="">Choose a subject</option>
          {selectableSubjects.map((subject) => {
            const period = periodFor(subject, periods);
            const archived = !subject.is_active || period?.archived_at !== null;
            return (
              <option key={subject.id} value={subject.id}>
                {subject.name}
                {archived ? " (Archived — existing task)" : ""}
              </option>
            );
          })}
        </select>
        {selectableSubjects.length === 0 && (
          <span className="mt-1 block text-sm text-amber-800">
            Add an active subject in your academic workspace before creating a
            task.
          </span>
        )}
      </label>

      <label className="block text-sm font-medium text-slate-700">
        Task title <span aria-hidden="true">*</span>
        <input
          autoFocus
          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
          onChange={(event) => updateField("title", event.target.value)}
          required
          value={values.title}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Task type <span aria-hidden="true">*</span>
          <select
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            onChange={(event) => updateField("task_type", event.target.value)}
            value={values.task_type}
          >
            {taskTypeSchema.options.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Priority <span aria-hidden="true">*</span>
          <select
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            onChange={(event) => updateField("priority", event.target.value)}
            value={values.priority}
          >
            {taskPrioritySchema.options.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>
      </div>

      {values.task_type === "Other" && (
        <label className="block text-sm font-medium text-slate-700">
          Custom task type <span aria-hidden="true">*</span>
          <input
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
            onChange={(event) => updateField("custom_type", event.target.value)}
            required
            value={values.custom_type}
          />
        </label>
      )}

      <label className="block text-sm font-medium text-slate-700">
        Description
        <textarea
          className="mt-1 block min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
          onChange={(event) => updateField("description", event.target.value)}
          value={values.description}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Due date <span aria-hidden="true">*</span>
          <input
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
            onChange={(event) => updateField("due_date", event.target.value)}
            required
            type="date"
            value={values.due_date}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Due time (optional)
          <input
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
            onChange={(event) => updateField("due_time", event.target.value)}
            type="time"
            value={values.due_time}
          />
        </label>
      </div>

      {values.due_time && (
        <label className="block text-sm font-medium text-slate-700">
          IANA timezone
          <input
            autoComplete="off"
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
            list="task-timezones"
            onChange={(event) =>
              updateField("due_timezone", event.target.value)
            }
            required
            value={values.due_timezone}
          />
          <datalist id="task-timezones">
            {[
              preferredTimezone,
              "UTC",
              "America/New_York",
              "Europe/London",
            ].map((timeZone) => (
              <option key={timeZone} value={timeZone} />
            ))}
          </datalist>
          <span className="mt-1 block text-xs text-slate-500">
            The saved deadline keeps this timezone if your preference changes.
          </span>
        </label>
      )}

      {ambiguousInstants && (
        <fieldset className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <legend className="px-1 text-sm font-semibold text-amber-900">
            Choose the intended occurrence
          </legend>
          <div className="mt-2 space-y-2">
            {ambiguousInstants.map((instant) => (
              <label className="flex items-center gap-2 text-sm" key={instant}>
                <input
                  checked={selectedInstant === instant}
                  name="ambiguous-deadline"
                  onChange={() => setSelectedInstant(instant)}
                  type="radio"
                  value={instant}
                />
                {candidateLabel(instant, values.due_timezone)}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Estimated duration (minutes)
          <input
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
            min="1"
            onChange={(event) =>
              updateField("estimated_duration_minutes", event.target.value)
            }
            type="number"
            value={values.estimated_duration_minutes}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Reference URL
          <input
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
            onChange={(event) =>
              updateField("reference_url", event.target.value)
            }
            type="url"
            value={values.reference_url}
          />
        </label>
      </div>

      {errorMessage && <FormMessage kind="error">{errorMessage}</FormMessage>}

      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-60"
          disabled={isSaving || selectableSubjects.length === 0}
          type="submit"
        >
          {isSaving ? "Saving…" : task ? "Save changes" : "Create task"}
        </button>
        <button
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
          onClick={handleCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
