import type { Task } from "@syllabussync/shared";

type LocalTimeResolution =
  { kind: "resolved"; instants: string[] } | { kind: "invalid_timezone" };

function localParts(instant: Date, formatter: Intl.DateTimeFormat) {
  const parts = formatter.formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second")),
  };
}

function sameWallTime(
  left: ReturnType<typeof localParts>,
  right: ReturnType<typeof localParts>,
) {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second
  );
}

export function resolveLocalDateTime(
  date: string,
  time: string,
  timeZone: string,
): LocalTimeResolution {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const safeYear = year ?? Number.NaN;
  const safeMonth = month ?? Number.NaN;
  const safeDay = day ?? Number.NaN;
  const safeHour = hour ?? Number.NaN;
  const safeMinute = minute ?? Number.NaN;
  const target = {
    year: safeYear,
    month: safeMonth,
    day: safeDay,
    hour: safeHour,
    minute: safeMinute,
    second: 0,
  };
  const wallTimeAsUtc = Date.UTC(
    safeYear,
    safeMonth - 1,
    safeDay,
    safeHour,
    safeMinute,
  );
  let formatter: Intl.DateTimeFormat;

  try {
    formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch (error) {
    if (error instanceof RangeError) {
      return { kind: "invalid_timezone" };
    }
    throw error;
  }

  const offsets = new Set<number>();
  const sampleWindow = 36 * 60 * 60 * 1000;
  const sampleStep = 30 * 60 * 1000;

  for (
    let sample = wallTimeAsUtc - sampleWindow;
    sample <= wallTimeAsUtc + sampleWindow;
    sample += sampleStep
  ) {
    const instant = new Date(sample);
    const parts = localParts(instant, formatter);
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    offsets.add(representedAsUtc - sample);
  }

  const instants = [...offsets]
    .map((offset) => new Date(wallTimeAsUtc - offset))
    .filter((instant) => sameWallTime(localParts(instant, formatter), target))
    .map((instant) => instant.toISOString())
    .sort();

  return { kind: "resolved", instants };
}

export function dateInTimeZone(instant: Date, timeZone: string) {
  const parts = localParts(
    instant,
    new Intl.DateTimeFormat("en-CA-u-ca-gregory-nu-latn", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }),
  );
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function formatDateOnly(date: string, locale?: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(
    new Date(
      Date.UTC(
        year ?? Number.NaN,
        (month ?? Number.NaN) - 1,
        day ?? Number.NaN,
      ),
    ),
  );
}

export function formatTaskDeadline(task: Task, locale?: string) {
  const date = formatDateOnly(task.due_date, locale);
  if (!task.due_time || !task.due_at || !task.due_timezone) {
    return date;
  }

  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: task.due_timezone,
    timeZoneName: "short",
  }).format(new Date(task.due_at));
  return `${date} at ${time}`;
}

export function deadlineChangeLabels(
  task: Task,
  input: {
    due_date: string;
    due_time: string | null;
    due_timezone: string | null;
    due_at: string | null;
  },
) {
  const changedTask: Task = {
    ...task,
    ...input,
  };
  return {
    oldDeadline: formatTaskDeadline(task),
    newDeadline: formatTaskDeadline(changedTask),
  };
}

export function isTaskOverdue(
  task: Task,
  preferredTimezone: string,
  now = new Date(),
) {
  if (task.status === "Completed") {
    return false;
  }
  if (task.due_at) {
    return Date.parse(task.due_at) < now.getTime();
  }
  return task.due_date < dateInTimeZone(now, preferredTimezone);
}
