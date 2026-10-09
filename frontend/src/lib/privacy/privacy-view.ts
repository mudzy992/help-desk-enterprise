import type { BadgeTone } from "@/components/ui/badge";
import { ApiError } from "@/services/api";

/** Paket 2.6 (§11): pure helpers of the privacy screens. */

export const privacyTabs = ["requests", "anonymization", "exports", "retention", "holds", "notice", "record"] as const;
export type PrivacyTab = (typeof privacyTabs)[number];

export type PrivacyTabAccess = {
  readonly canManage: boolean;
  readonly canAnonymize: boolean;
};

export function visiblePrivacyTabs(access: PrivacyTabAccess): readonly PrivacyTab[] {
  return privacyTabs.filter((tab) => {
    if (tab === "anonymization") return access.canAnonymize;
    if (tab === "exports" || tab === "notice") return access.canManage;
    return true;
  });
}

/** Unknown or forbidden `?tab=` falls back to the first visible tab. */
export function readPrivacyTab(value: string | null, access: PrivacyTabAccess): PrivacyTab {
  const visible = visiblePrivacyTabs(access);
  return visible.find((tab) => tab === value) ?? visible[0] ?? "requests";
}

/** §11: green, yellow at ≤ 7 days, red when overdue; closed requests are neutral. */
export function deadlineTone(daysLeft: number | null): BadgeTone {
  if (daysLeft === null) return "neutral";
  if (daysLeft < 0) return "danger";
  if (daysLeft <= 7) return "warning";
  return "success";
}

/** 5.3.7: what the notice editor badge says about the active language. */
export type PrivacyNoticeState = "published" | "draft" | "disabled";

export function privacyNoticeState(enabled: boolean, savedText: string): PrivacyNoticeState {
  if (!enabled) return "disabled";
  return savedText.trim().length > 0 ? "published" : "draft";
}

export function privacyNoticeStateTone(state: PrivacyNoticeState): BadgeTone {
  if (state === "published") return "success";
  if (state === "draft") return "warning";
  return "danger";
}

const pseudonymPattern = /^Bivši korisnik #([0-9A-F]{4,6})$/;

/**
 * The stored pseudonym is Bosnian ("Bivši korisnik #<tag>", §6.3); English
 * readers see "Former user #<tag>". Any other name is returned unchanged.
 */
export function localizePersonName(name: string, language: string): string {
  if (!language.toLowerCase().startsWith("en")) return name;
  const tag = pseudonymPattern.exec(name)?.[1];
  return tag === undefined ? name : `Former user #${tag}`;
}

export function isPseudonym(name: string): boolean {
  return pseudonymPattern.test(name);
}

export const privacyErrorCodes = [
  "PRIVACY_DISABLED",
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID_INPUT",
  "INVALID_TRANSITION",
  "EXTENSION_NOT_ALLOWED",
  "IDENTITY_CONFIRMATION_REQUIRED",
  "IDENTITY_CONFIRMATION_FAILED",
  "ANONYMIZATION_BLOCKED",
  "APPROVAL_REQUIRED",
  "APPROVER_MUST_DIFFER",
  "CONFIRMATION_MISMATCH",
  "EXPORT_NOT_READY",
  "EXPORT_EXPIRED",
  "RETENTION_DISABLED",
  "LEGAL_HOLD_ACTIVE",
  "ALREADY_RUNNING",
] as const;
export type PrivacyErrorCode = (typeof privacyErrorCodes)[number];

export function readPrivacyErrorCode(error: unknown): PrivacyErrorCode | null {
  if (!(error instanceof ApiError)) return null;
  return (privacyErrorCodes as readonly string[]).includes(error.code) ? (error.code as PrivacyErrorCode) : null;
}

/** The action needs an MFA code (or a fresher session) — ask and retry. */
export function needsIdentityCode(error: unknown): boolean {
  return readPrivacyErrorCode(error) === "IDENTITY_CONFIRMATION_REQUIRED";
}

export function formatBytes(bytes: number | null, language: string): string {
  if (bytes === null) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}

/** `YYYY-MM-DD` of today in local time, for `<input type="date">`. */
export function todayInputValue(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * A date input (local calendar day) → ISO at local noon, so the day never
 * shifts by time zone. Never later than `now`: before noon, "today" would be
 * in the future and the API rejects future dates (found by E2E 20 in a morning run).
 */
export function dateInputToIso(value: string, now: Date = new Date()): string {
  const [year, month, day] = value.split("-").map(Number);
  const noon = new Date(year, month - 1, day, 12, 0, 0);
  return new Date(Math.min(noon.getTime(), now.getTime())).toISOString();
}

export function matchesPersonQuery(
  person: { readonly displayName: string; readonly email: string },
  query: string,
): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0) return true;
  return (
    person.displayName.toLocaleLowerCase().includes(needle) || person.email.toLocaleLowerCase().includes(needle)
  );
}
