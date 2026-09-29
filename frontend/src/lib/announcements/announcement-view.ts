import { ApiError } from "@/services/api";
import type { AnnouncementEffectiveStatus, AnnouncementSeverity } from "@/services/announcements-api";

/** Paket 2.9 (K2): pure helpers for the announcement banner and pages. */

export const announcementErrorKeys = {
  ANNOUNCEMENTS_DISABLED: "announcements.errors.disabled",
  ANNOUNCEMENT_NOT_FOUND: "announcements.errors.notFound",
  ANNOUNCEMENT_INVALID: "announcements.errors.invalid",
  ANNOUNCEMENT_INVALID_AUDIENCE: "announcements.errors.invalidAudience",
  ANNOUNCEMENT_INVALID_STATE: "announcements.errors.invalidState",
  ANNOUNCEMENT_NOT_ACTIVE: "announcements.errors.notActive",
  ANNOUNCEMENT_REMINDER_TOO_SOON: "announcements.errors.reminderTooSoon",
  ANNOUNCEMENT_FORBIDDEN: "announcements.errors.forbidden",
} as const;

export type AnnouncementErrorKey = (typeof announcementErrorKeys)[keyof typeof announcementErrorKeys];

export function mapAnnouncementError(error: unknown): AnnouncementErrorKey | null {
  if (!(error instanceof ApiError)) return null;
  return (announcementErrorKeys as Readonly<Record<string, AnnouncementErrorKey>>)[error.code] ?? null;
}

/** The server's detail for ANNOUNCEMENT_INVALID (e.g. "duration:90"). */
export function announcementErrorDetail(error: unknown): string | null {
  return error instanceof ApiError && error.code === "ANNOUNCEMENT_INVALID" ? error.message : null;
}

export type AnnouncementTone = "info" | "warning" | "danger";

export function severityTone(severity: AnnouncementSeverity): AnnouncementTone {
  if (severity === "CRITICAL") return "danger";
  if (severity === "WARNING") return "warning";
  return "info";
}

/** §3.2: only CRITICAL interrupts a screen reader; the rest is polite. */
export function severityRole(severity: AnnouncementSeverity): "alert" | "status" {
  return severity === "CRITICAL" ? "alert" : "status";
}

/** Tailwind classes per tone — tokens already contrast-checked in every palette (2.8). */
export const announcementToneClasses: Readonly<Record<AnnouncementTone, { readonly frame: string; readonly icon: string }>> = {
  info: { frame: "border-info/40 bg-info/10", icon: "text-info" },
  warning: { frame: "border-warning/40 bg-warning/10", icon: "text-warning" },
  danger: { frame: "border-danger/40 bg-danger/10", icon: "text-danger" },
};

export function statusTone(status: AnnouncementEffectiveStatus): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "PUBLISHED":
      return "success";
    case "SCHEDULED":
      return "info";
    case "WITHDRAWN":
      return "danger";
    case "ENDED":
      return "neutral";
    default:
      return "warning";
  }
}

/** §3.2: a modal returns on navigation at most this many times per session. */
export const modalShowsPerSession = 3;

type SessionStore = Pick<Storage, "getItem" | "setItem">;

const modalCounterKey = (id: string, version: number) => `announcement-modal:${id}:v${version}`;

export function modalShowsLeft(store: SessionStore | null, id: string, version: number): number {
  if (store === null) return modalShowsPerSession;
  try {
    const shown = Number(store.getItem(modalCounterKey(id, version)) ?? "0");
    return Math.max(0, modalShowsPerSession - (Number.isFinite(shown) ? shown : 0));
  } catch {
    return modalShowsPerSession;
  }
}

export function recordModalShown(store: SessionStore | null, id: string, version: number): void {
  if (store === null) return;
  try {
    const key = modalCounterKey(id, version);
    const shown = Number(store.getItem(key) ?? "0");
    store.setItem(key, String((Number.isFinite(shown) ? shown : 0) + 1));
  } catch {
    // Private mode / quota: the modal simply shows again.
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** ISO instant → value for `<input type="datetime-local">` in the browser's zone. */
export function toLocalInputValue(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `datetime-local` value (browser zone) → ISO instant; null when empty/invalid. */
export function fromLocalInputValue(value: string): string | null {
  if (value.trim().length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function acknowledgementPercent(acknowledged: number, audience: number): number {
  if (audience <= 0) return 0;
  return Math.min(100, Math.round((acknowledged / audience) * 100));
}

/**
 * Date + time with explicit fields: `dateStyle` in "bs" renders as
 * "2026 M09 29" in browsers without Bosnian CLDR data.
 */
export function announcementDateTimeFormatter(language: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "bs-BA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}
