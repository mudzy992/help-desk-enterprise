import { ApiError } from "@/services/api";

/** Package 1.3: server codes → `tickets.timeTracking.errors.*` keys. */
const codeKeys = {
  ACTIVE_TIMER_ELSEWHERE: "tickets.timeTracking.errors.activeElsewhere",
  OVERLAPPING_TIMER: "tickets.timeTracking.errors.overlap",
  TIME_LOG_OVERLAP: "tickets.timeTracking.errors.overlap",
  TIME_TRACKING_NOT_ALLOWED_IN_STATUS: "tickets.timeTracking.errors.status",
  MANUAL_TIME_DISABLED: "tickets.timeTracking.errors.manualDisabled",
  TIME_LOG_EDIT_WINDOW_EXPIRED: "tickets.timeTracking.errors.window",
  TIME_LOG_ENDED_AT_INVALID: "tickets.timeTracking.errors.range",
  TIME_LOG_INVALID_RANGE: "tickets.timeTracking.errors.range",
  TIME_LOG_NOTE_REQUIRED: "tickets.timeTracking.errors.noteRequired",
  TIME_LOG_REASON_REQUIRED: "tickets.timeTracking.errors.reasonRequired",
  TIME_LOG_IMMUTABLE: "tickets.timeTracking.errors.running",
  TIME_LOG_NOT_ACTIVE: "tickets.timeTracking.errors.notActive",
  TIME_LOG_NOT_FOUND: "tickets.timeTracking.errors.notFound",
  FORBIDDEN: "tickets.timeTracking.errors.forbidden",
} as const;

export type TimeTrackingErrorKey =
  | (typeof codeKeys)[keyof typeof codeKeys]
  | "tickets.timeTracking.errors.generic";

export function mapTimeTrackingError(error: unknown): TimeTrackingErrorKey {
  if (error instanceof ApiError && error.code in codeKeys) {
    return codeKeys[error.code as keyof typeof codeKeys];
  }
  return "tickets.timeTracking.errors.generic";
}

export function isActiveElsewhere(error: unknown): boolean {
  return error instanceof ApiError && error.code === "ACTIVE_TIMER_ELSEWHERE";
}
