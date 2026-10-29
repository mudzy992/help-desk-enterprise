import type { TrendsFilterOption } from "@/components/reports/trends/report-trends-panel";
import type { ReportScheduleFormError } from "@/lib/reports/report-schedule-form";
import type { ReportSchedule, ReportScheduleList } from "@/services/report-schedules-api";
import type { ReportTrendPriority } from "@/services/report-trends-api";

export type ReportScheduleDraft = {
  readonly organizationalUnitId: string | null;
  readonly serviceId: string | null;
  readonly groupId: string | null;
  readonly priority: ReportTrendPriority | null;
};

export interface ReportScheduleSheetProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly list: ReportScheduleList;
  readonly schedule: ReportSchedule | null;
  readonly draft: ReportScheduleDraft | null;
  readonly units: readonly TrendsFilterOption[];
  readonly services: readonly TrendsFilterOption[];
  readonly groups: readonly TrendsFilterOption[] | null;
  readonly onSaved: (schedule: ReportSchedule) => void;
}

export const frequencyKeys = {
  WEEKLY: "reports.schedules.frequency.WEEKLY",
  MONTHLY: "reports.schedules.frequency.MONTHLY",
} as const;

export const sectionKeys = {
  kpi: "reports.schedules.sections.kpi",
  trend: "reports.schedules.sections.trend",
  topServices: "reports.schedules.sections.topServices",
  overdue: "reports.schedules.sections.overdue",
} as const;

export const priorityKeys = {
  LOW: "reports.trends.priority.LOW",
  MEDIUM: "reports.trends.priority.MEDIUM",
  HIGH: "reports.trends.priority.HIGH",
  CRITICAL: "reports.trends.priority.CRITICAL",
} as const;

export const formErrorKeys = {
  name: "reports.schedules.form.errors.name",
  sendTime: "reports.schedules.form.errors.sendTime",
  unit: "reports.schedules.form.errors.unit",
  sections: "reports.schedules.form.errors.sections",
  recipients: "reports.schedules.form.errors.recipients",
  recipientLimit: "reports.schedules.form.errors.recipientLimit",
} as const satisfies Record<ReportScheduleFormError, string>;
