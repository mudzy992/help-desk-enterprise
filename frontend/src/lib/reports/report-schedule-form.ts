import type { ReportScheduleFrequency, ReportScheduleSection } from "@/services/report-schedules-api";

/** Paket 2.5 (design §7.3): client-side checks and the „next send” preview. */
export type ReportScheduleFormValues = {
  readonly name: string;
  readonly frequency: ReportScheduleFrequency;
  readonly sendTime: string;
  readonly organizationalUnitId: string;
  readonly sections: readonly ReportScheduleSection[];
  readonly recipientUserIds: readonly string[];
};

export type ReportScheduleFormError = "name" | "sendTime" | "unit" | "sections" | "recipients" | "recipientLimit";

export const reportScheduleNameMaxLength = 120;

export function isValidSendTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match !== null && Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

export function validateReportScheduleForm(
  values: ReportScheduleFormValues,
  maxRecipients: number,
): readonly ReportScheduleFormError[] {
  const errors: ReportScheduleFormError[] = [];
  const name = values.name.trim();
  if (name.length === 0 || name.length > reportScheduleNameMaxLength) errors.push("name");
  if (!isValidSendTime(values.sendTime)) errors.push("sendTime");
  if (values.organizationalUnitId.length === 0) errors.push("unit");
  if (values.sections.length === 0) errors.push("sections");
  if (values.recipientUserIds.length === 0) errors.push("recipients");
  if (values.recipientUserIds.length > maxRecipients) errors.push("recipientLimit");
  return errors;
}

/**
 * Next send in the viewer's clock — weekly on Monday, monthly on the 1st
 * (design §5.1). Strictly after `now`. The saved schedule shows the server's
 * `nextRunAt`; this is only the preview while editing (same zone in practice).
 */
export function previewNextReportRun(frequency: ReportScheduleFrequency, sendTime: string, now: Date): Date | null {
  if (!isValidSendTime(sendTime)) return null;
  const [hours, minutes] = sendTime.split(":").map(Number) as [number, number];
  if (frequency === "WEEKLY") {
    const daysToMonday = (8 - now.getDay()) % 7;
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToMonday, hours, minutes);
    return candidate.getTime() > now.getTime()
      ? candidate
      : new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate() + 7, hours, minutes);
  }
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1, hours, minutes);
  return thisMonth.getTime() > now.getTime() ? thisMonth : new Date(now.getFullYear(), now.getMonth() + 1, 1, hours, minutes);
}
