import type {
  ReportScheduleFrequency,
  ReportScheduleSection,
} from "@/services/report-schedules-api";
import {
  addCivilDays,
  addCivilMonths,
  civilParts,
  zonedInstant,
} from "@/lib/reports/report-civil-time";

export type ReportScheduleFormValues = {
  readonly name: string;
  readonly frequency: ReportScheduleFrequency;
  readonly sendTime: string;
  readonly organizationalUnitId: string;
  readonly sections: readonly ReportScheduleSection[];
  readonly recipientUserIds: readonly string[];
};

export type ReportScheduleFormError =
  "name" | "sendTime" | "unit" | "sections" | "recipients" | "recipientLimit";

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

/** Same civil-calendar contract as backend `nextReportRunAt`. */
export function previewNextReportRun(
  frequency: ReportScheduleFrequency,
  sendTime: string,
  timeZone: string,
  after: Date,
): Date | null {
  if (!isValidSendTime(sendTime)) return null;
  const [hours, minutes] = sendTime.split(":").map(Number) as [number, number];
  const minute = hours * 60 + minutes;
  const today = civilParts(after, timeZone);
  let candidate =
    frequency === "WEEKLY" ? addCivilDays(today, -((today.weekday + 6) % 7)) : { ...today, day: 1 };
  for (let guard = 0; guard < 4; guard += 1) {
    const slot = zonedInstant(timeZone, candidate.year, candidate.month, candidate.day, minute);
    if (slot.getTime() > after.getTime()) return slot;
    candidate = frequency === "WEEKLY" ? addCivilDays(candidate, 7) : addCivilMonths(candidate, 1);
  }
  return null;
}
