import { apiRequest } from "@/services/api";
import type { ReportTrendPriority } from "@/services/report-trends-api";

/** `/reports/schedules` (`reports.schedule.manage`). */
export const reportScheduleFrequencies = ["WEEKLY", "MONTHLY"] as const;
export type ReportScheduleFrequency = (typeof reportScheduleFrequencies)[number];

export const reportScheduleSections = ["kpi", "trend", "topServices", "overdue"] as const;
export type ReportScheduleSection = (typeof reportScheduleSections)[number];

export type ReportScheduleRunStatus = "RUNNING" | "SENT" | "PARTIAL" | "FAILED" | "SKIPPED";

export type ReportScheduleRecipient = {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly isActive?: boolean;
};

export type ReportSchedule = {
  readonly id: string;
  readonly name: string;
  readonly frequency: ReportScheduleFrequency;
  readonly sendTime: string;
  readonly organizationalUnit: { readonly id: string; readonly name: string };
  readonly service: { readonly id: string; readonly name: string } | null;
  readonly group: { readonly id: string; readonly name: string } | null;
  readonly priority: ReportTrendPriority | null;
  readonly sections: readonly ReportScheduleSection[];
  readonly packKeys: readonly string[];
  readonly enabled: boolean;
  /** W7.95 (`BA-reports-05`): the token sent back as `If-Match: "vN"` on update/enable/delete. */
  readonly version: number;
  readonly nextRunAt: string;
  readonly lastRunAt: string | null;
  readonly createdBy: { readonly id: string; readonly displayName: string } | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly recipients: readonly ReportScheduleRecipient[];
  readonly lastRun: {
    readonly id: string;
    readonly status: ReportScheduleRunStatus;
    readonly trigger: string;
    readonly createdAt: string;
    readonly sentCount: number;
    readonly recipientCount: number;
  } | null;
};

export type ReportScheduleList = {
  readonly schedules: readonly ReportSchedule[];
  readonly settings: {
    readonly enabled: boolean;
    readonly maxSchedules: number;
    readonly maxRecipients: number;
    readonly defaultSendTime: string;
    readonly attachmentMaxRows: number;
    readonly timeZone: string;
    readonly total: number;
  };
  readonly sections: readonly ReportScheduleSection[];
  readonly packs: readonly string[];
};

export type ReportScheduleRun = {
  readonly id: string;
  readonly trigger: string;
  readonly status: ReportScheduleRunStatus;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly recipientCount: number;
  readonly sentCount: number;
  readonly skipped: readonly {
    /** `null` after the recipient's account was anonymised (the reason is kept). */
    readonly userId: string | null;
    readonly reason: string;
    readonly displayName: string | null;
  }[];
  readonly omittedAttachments: readonly { readonly pack: string; readonly reason: string }[];
  readonly errorCode: string | null;
  readonly durationMs: number | null;
  readonly createdAt: string;
  readonly finishedAt: string | null;
  readonly triggeredBy: { readonly id: string; readonly displayName: string } | null;
};

export type SaveReportScheduleInput = {
  readonly name: string;
  readonly frequency: ReportScheduleFrequency;
  readonly sendTime: string;
  readonly organizationalUnitId: string;
  readonly serviceId?: string;
  readonly groupId?: string;
  readonly priority?: ReportTrendPriority;
  readonly sections: readonly ReportScheduleSection[];
  readonly packKeys: readonly string[];
  readonly recipientUserIds: readonly string[];
  readonly enabled?: boolean;
};

const base = "/reports/schedules";

export function listReportSchedules(): Promise<ReportScheduleList> {
  return apiRequest(base);
}

export function createReportSchedule(input: SaveReportScheduleInput): Promise<ReportSchedule> {
  return apiRequest(base, { method: "POST", body: JSON.stringify(input) });
}

/**
 * W7.95 (`BA-reports-05`): admin writes are conditional. `version` is the value the editor loaded, so a save based
 * on a stale read is answered with 412 (`OPTIMISTIC_STALE_WRITE`) instead of overwriting somebody else's change.
 */
const ifMatch = (version: number): RequestInit => ({ headers: { "If-Match": `"v${version}"` } });

export function updateReportSchedule(
  id: string,
  input: SaveReportScheduleInput,
  version: number,
): Promise<ReportSchedule> {
  return apiRequest(`${base}/${encodeURIComponent(id)}`, {
    ...ifMatch(version),
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function setReportScheduleEnabled(
  id: string,
  enabled: boolean,
  version: number,
): Promise<ReportSchedule> {
  return apiRequest(`${base}/${encodeURIComponent(id)}/enabled`, {
    ...ifMatch(version),
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export function deleteReportSchedule(id: string, version: number): Promise<void> {
  return apiRequest(`${base}/${encodeURIComponent(id)}`, { ...ifMatch(version), method: "DELETE" });
}

export function listReportScheduleRuns(
  id: string,
): Promise<{ readonly runs: readonly ReportScheduleRun[] }> {
  return apiRequest(`${base}/${encodeURIComponent(id)}/runs`);
}

export function sendReportScheduleTest(
  id: string,
): Promise<{ readonly sent: boolean; readonly reason?: string }> {
  return apiRequest(`${base}/${encodeURIComponent(id)}/send-test`, { method: "POST" });
}

/**
 * W7.106 (`BA-reports-16`): „send now” is a command, so it carries an `Idempotency-Key`.
 *
 * The caller owns the key and reuses it for the **same intent**: a retry after a timeout must replay the first
 * request instead of queueing a second report, and a second click must not become a second e-mail. A new key means a
 * new, deliberate command.
 */
export function runReportScheduleNow(
  id: string,
  idempotencyKey: string,
): Promise<{ readonly queued: boolean }> {
  return apiRequest(`${base}/${encodeURIComponent(id)}/run-now`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

/**
 * A key for one „send now” intent. `crypto.randomUUID()` is not available in every context the panel can run in
 * (older browsers, some test environments), so the fallback keeps the shape the API validates: 8–128 characters of
 * letters, digits, dot, colon, underscore and dash.
 */
export function createReportCommandKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (typeof uuid === "string" && uuid.length > 0) return `run-now-${uuid}`;
  const random = Math.random().toString(36).slice(2, 12);
  return `run-now-${Date.now().toString(36)}-${random}`;
}

export function listReportRecipientCandidates(
  organizationalUnitId: string,
  q: string,
): Promise<{ readonly users: readonly ReportScheduleRecipient[] }> {
  const params = new URLSearchParams({ organizationalUnitId });
  if (q.trim().length > 0) params.set("q", q.trim());
  return apiRequest(`${base}/recipient-candidates?${params.toString()}`);
}
