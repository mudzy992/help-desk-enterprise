import { ApiError } from "@/services/api";
import type { OnCallSegmentView } from "@/services/on-call-api";

/** Paket 2.9 (K3): pure helpers for the on-call page. */

export const onCallErrorKeys = {
  ON_CALL_DISABLED: "onCall.errors.disabled",
  ON_CALL_GROUP_NOT_FOUND: "onCall.errors.groupNotFound",
  ON_CALL_SCHEDULE_NOT_FOUND: "onCall.errors.scheduleNotFound",
  ON_CALL_INVALID_SCHEDULE: "onCall.errors.invalidSchedule",
  ON_CALL_INVALID_MEMBER: "onCall.errors.invalidMember",
  ON_CALL_INVALID_RANGE: "onCall.errors.invalidRange",
  ON_CALL_OVERRIDE_OVERLAP: "onCall.errors.overlap",
  ON_CALL_OVERRIDE_NOT_FOUND: "onCall.errors.overrideNotFound",
  ON_CALL_SWAP_NOT_FOUND: "onCall.errors.swapNotFound",
  ON_CALL_SWAP_NOT_ALLOWED: "onCall.errors.swapNotAllowed",
  ON_CALL_SWAP_NOT_PENDING: "onCall.errors.swapNotPending",
  ON_CALL_FORBIDDEN: "onCall.errors.forbidden",
} as const;

export type OnCallErrorKey = (typeof onCallErrorKeys)[keyof typeof onCallErrorKeys];

export function mapOnCallError(error: unknown): OnCallErrorKey | null {
  if (!(error instanceof ApiError)) return null;
  return (onCallErrorKeys as Readonly<Record<string, OnCallErrorKey>>)[error.code] ?? null;
}

export function isOnCallDisabledError(error: unknown): boolean {
  return mapOnCallError(error) === onCallErrorKeys.ON_CALL_DISABLED;
}

const dayMs = 86_400_000;

function civilDateKey(date: Date, timeZone: string): string {
  // en-CA gives YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export type OnCallDay = {
  readonly key: string;
  /** Local midnight of the day (approximate instant used only for labels). */
  readonly date: Date;
  readonly isToday: boolean;
  readonly entries: ReadonlyArray<{
    readonly segment: OnCallSegmentView;
    /** The segment started on this day (otherwise it continues from before). */
    readonly startsHere: boolean;
  }>;
};

/**
 * Days `[from, from + days)` in `timeZone` with every segment that overlaps
 * each day. A weekly shift therefore shows on seven days; the one where it
 * starts is marked so the handoff is visible.
 */
export function groupSegmentsByDay(
  segments: readonly OnCallSegmentView[],
  from: Date,
  days: number,
  timeZone: string,
  now: Date = new Date(),
): OnCallDay[] {
  const todayKey = civilDateKey(now, timeZone);
  const result: OnCallDay[] = [];
  const seen = new Set<string>();
  // Step in 12 h increments so DST days are never skipped or doubled.
  for (let cursor = from.getTime(); result.length < days && cursor < from.getTime() + (days + 2) * dayMs; cursor += dayMs / 2) {
    const key = civilDateKey(new Date(cursor), timeZone);
    if (seen.has(key)) continue;
    seen.add(key);
    const [year, month, day] = key.split("-").map(Number) as [number, number, number];
    const dayStart = zonedMidnight(year, month, day, timeZone);
    const dayEnd = zonedMidnight(year, month, day + 1, timeZone);
    const entries = segments
      .filter((segment) => Date.parse(segment.startsAt) < dayEnd.getTime() && Date.parse(segment.endsAt) > dayStart.getTime())
      .map((segment) => ({
        segment,
        startsHere: Date.parse(segment.startsAt) >= dayStart.getTime(),
      }));
    result.push({ key, date: dayStart, isToday: key === todayKey, entries });
  }
  return result;
}

function offsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour") % 24, value("minute"), value("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Local midnight of a civil date in `timeZone` (day overflow allowed). */
export function zonedMidnight(year: number, month: number, day: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - offsetMs(new Date(guess), timeZone);
  return new Date(guess - offsetMs(new Date(first), timeZone));
}

/** Start of the ISO week (Monday 00:00) containing `date`, in `timeZone`. */
export function startOfWeek(date: Date, timeZone: string): Date {
  const key = civilDateKey(date, timeZone);
  const [year, month, day] = key.split("-").map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const back = (weekday + 6) % 7;
  return zonedMidnight(year, month, day - back, timeZone);
}

/** `<input type="datetime-local">` value (browser-local) ↔ ISO instant. */
export function toDateTimeLocalValue(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDateTimeLocalValue(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatOnCallTime(iso: string, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "bs-BA", {
    ...(timeZone ? { timeZone } : {}),
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function formatOnCallClock(iso: string, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "bs-BA", {
    ...(timeZone ? { timeZone } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** Moves the item at `index` one place up (-1) or down (+1); out of range → unchanged copy. */
export function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  const copy = [...items];
  if (index < 0 || index >= copy.length || target < 0 || target >= copy.length) return copy;
  [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  return copy;
}
