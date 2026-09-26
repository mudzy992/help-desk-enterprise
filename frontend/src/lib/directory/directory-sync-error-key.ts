import { ApiError } from "@/services/api";

/** Paket 1.8: backend DirectorySyncError codes that have their own message. */
const KNOWN_CODES = [
  "DIRECTORY_BACKOFF",
  "DIRECTORY_CONNECTION_FAILED",
  "DIRECTORY_NOT_CONFIGURED",
  "DIRECTORY_PLAN_ALREADY_APPLIED",
  "DIRECTORY_PLAN_EXPIRED",
  "DIRECTORY_PLAN_NOT_FOUND",
  "DIRECTORY_READ_DISABLED",
  "DIRECTORY_READ_THROTTLED",
  "DIRECTORY_SAFEGUARD_TRIPPED",
  "DIRECTORY_SOURCE_NOT_LDAPS",
  "DIRECTORY_SYNC_CLOCK",
  "DIRECTORY_SYNC_COOLDOWN",
  "DIRECTORY_SYNC_IN_PROGRESS",
  "DIRECTORY_SYNC_UNAVAILABLE",
] as const;

export type DirectorySyncErrorCode = (typeof KNOWN_CODES)[number];

export type DirectorySyncErrorKey =
  | `directory.ldaps.errors.${DirectorySyncErrorCode}`
  | "directory.ldaps.errors.unknown";

export function directorySyncErrorKey(error: unknown): DirectorySyncErrorKey {
  if (error instanceof ApiError && (KNOWN_CODES as readonly string[]).includes(error.code)) {
    return `directory.ldaps.errors.${error.code as DirectorySyncErrorCode}`;
  }
  return "directory.ldaps.errors.unknown";
}

export const directorySyncErrorCodes: readonly DirectorySyncErrorCode[] = KNOWN_CODES;
