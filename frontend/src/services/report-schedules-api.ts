import { apiRequest } from "@/services/api";
import type { ReportTrendPriority } from "@/services/report-trends-api";

/** Paket 2.5 (design §5.5): `/reports/schedules` (`reports.schedule.manage`). */
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
  readonly skipped: readonly { readonly userId: string; readonly reason: string; readonly displayName: string | null }[];
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

export function updateReportSchedule(id: string, input: SaveReportScheduleInput): Promise<ReportSchedule> {
  return apiRequest(`${base}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) });
}

export function setReportScheduleEnabled(id: string, enabled: boolean): Promise<ReportSchedule> {
  return apiRequest(`${base}/${encodeURIComponent(id)}/enabled`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export function deleteReportSchedule(id: string): Promise<void> {
  return apiRequest(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function listReportScheduleRuns(id: string): Promise<{ readonly runs: readonly ReportScheduleRun[] }> {
  return apiRequest(`${base}/${encodeURIComponent(id)}/runs`);
}

export function sendReportScheduleTest(id: string): Promise<{ readonly sent: boolean; readonly reason?: string }> {
  return apiRequest(`${base}/${encodeURIComponent(id)}/send-test`, { method: "POST" });
}

export function runReportScheduleNow(id: string): Promise<{ readonly queued: boolean }> {
  return apiRequest(`${base}/${encodeURIComponent(id)}/run-now`, { method: "POST" });
}

export function listReportRecipientCandidates(
  organizationalUnitId: string,
  q: string,
): Promise<{ readonly users: readonly ReportScheduleRecipient[] }> {
  const params = new URLSearchParams({ organizationalUnitId });
  if (q.trim().length > 0) params.set("q", q.trim());
  return apiRequest(`${base}/recipient-candidates?${params.toString()}`);
}
