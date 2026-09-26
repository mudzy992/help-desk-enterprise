import { ApiError } from "@/services/api";

/* Paket 2.1: server password-policy violations → i18n keys. */
const VIOLATION_KEYS = {
  TOO_SHORT: "auth.passwordPolicy.TOO_SHORT",
  TOO_LONG: "auth.passwordPolicy.TOO_LONG",
  BLANK: "auth.passwordPolicy.BLANK",
  SAME_AS_EMAIL: "auth.passwordPolicy.SAME_AS_EMAIL",
  COMMON_PASSWORD: "auth.passwordPolicy.COMMON_PASSWORD",
  CONTAINS_ORGANISATION_WORD: "auth.passwordPolicy.CONTAINS_ORGANISATION_WORD",
  CONTAINS_EMAIL_NAME: "auth.passwordPolicy.CONTAINS_EMAIL_NAME",
} as const;

export type PasswordFeedbackKey =
  | (typeof VIOLATION_KEYS)[keyof typeof VIOLATION_KEYS]
  | "auth.passwordPolicy.reused"
  | "auth.passwordPolicy.currentInvalid"
  | "auth.passwordPolicy.generic";

export function readPasswordFeedbackKeys(error: unknown): PasswordFeedbackKey[] | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === "PASSWORD_REUSED") return ["auth.passwordPolicy.reused"];
  if (error.code === "CURRENT_PASSWORD_INVALID") return ["auth.passwordPolicy.currentInvalid"];
  if (error.code !== "INVALID_PASSWORD") return null;
  const raw = error.details?.["violations"];
  const keys = (Array.isArray(raw) ? raw : [])
    .map((value) => VIOLATION_KEYS[String(value) as keyof typeof VIOLATION_KEYS])
    .filter((key): key is (typeof VIOLATION_KEYS)[keyof typeof VIOLATION_KEYS] => key !== undefined);
  return keys.length > 0 ? keys : ["auth.passwordPolicy.generic"];
}
