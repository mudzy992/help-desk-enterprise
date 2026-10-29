import { applicationDateLocale, dateTimeFormatter } from "@/lib/date-time-formatter";

export const onCallCalendarDays = 28;
export const onCallDayMs = 86_400_000;

export type OnCallPendingDelete =
  { readonly kind: "schedule" } | { readonly kind: "override"; readonly id: string };

export function formatOnCallRange(start: Date, language: string, timeZone: string): string {
  const formatter = dateTimeFormatter(applicationDateLocale(language), {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const end = new Date(start.getTime() + (onCallCalendarDays - 1) * onCallDayMs + onCallDayMs / 2);
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

import type { OnCallOverview } from "@/services/on-call-api";

export function resolveSelectedOnCallGroupId(
  overview: OnCallOverview | null,
  requestedGroupId: string | null,
): string | null {
  return (
    overview?.groups.find((group) => group.groupId === requestedGroupId)?.groupId ??
    overview?.groups.find((group) => group.hasSchedule)?.groupId ??
    overview?.groups[0]?.groupId ??
    null
  );
}
