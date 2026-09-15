import type { HorizontalBarItem } from "@/components/charts/h-bars";
import {
  isTimestampInWindow,
  type ReportWindow,
} from "@/lib/reports/report-window";
import {
  elapsedHours,
  isReportOpenTicket,
  roundToOneDecimal,
  ticketResolvedAt,
} from "@/lib/reports/report-ticket-fields";
import { truncateIdentifier } from "@/lib/tickets/ticket-display";
import { SEMANTIC_DOT_HEX } from "@/lib/theme/semantic-meta";
import type { TicketResponse } from "@/services/tickets-api";

export const reportChartBarLimit = 8;
export const reportHoursSuffix = "h";

export type ReportBottleneckChart = {
  readonly items: readonly HorizontalBarItem[];
  readonly bottleneckLabel: string | null;
};

export type ReportAgingChart = {
  readonly items: readonly HorizontalBarItem[];
  readonly waitingOverSevenDays: number;
};

export type ReportAgingLabels = {
  readonly lessThanOneDay: string;
  readonly oneToThreeDays: string;
  readonly threeToSevenDays: string;
  readonly moreThanSevenDays: string;
};

export function buildBottleneckChart(
  tickets: readonly TicketResponse[],
  window: ReportWindow,
  groupNames: ReadonlyMap<string, string>,
  unroutedLabel: string,
): ReportBottleneckChart {
  const totals = new Map<string, { hours: number; count: number }>();
  for (const ticket of tickets) {
    const resolvedAt = ticketResolvedAt(ticket);
    if (resolvedAt === null || !isTimestampInWindow(resolvedAt, window)) {
      continue;
    }
    const hours = elapsedHours(ticket.createdAt, resolvedAt);
    if (hours === null) {
      continue;
    }
    const key = ticket.assignedGroupId ?? "";
    const current = totals.get(key) ?? { hours: 0, count: 0 };
    totals.set(key, {
      hours: current.hours + hours,
      count: current.count + 1,
    });
  }
  const ranked = [...totals.entries()]
    .map(([key, total]) => ({
      label:
        key.length === 0
          ? unroutedLabel
          : (groupNames.get(key) ?? truncateIdentifier(key)),
      value: roundToOneDecimal(total.hours / total.count),
    }))
    .sort(
      (left, right) =>
        right.value - left.value || left.label.localeCompare(right.label),
    )
    .slice(0, reportChartBarLimit);
  const max = ranked[0]?.value;
  return {
    bottleneckLabel: ranked[0]?.label ?? null,
    items: ranked.map((row) => ({
      label: row.label,
      value: row.value,
      suffix: reportHoursSuffix,
      color:
        max !== undefined && row.value === max
          ? SEMANTIC_DOT_HEX.warning
          : SEMANTIC_DOT_HEX.primary,
    })),
  };
}

export function buildServiceVolumeItems(
  tickets: readonly TicketResponse[],
  window: ReportWindow,
  serviceNames: ReadonlyMap<string, string>,
): readonly HorizontalBarItem[] {
  const counts = new Map<string, number>();
  for (const ticket of tickets) {
    if (!isTimestampInWindow(ticket.createdAt, window)) {
      continue;
    }
    counts.set(ticket.serviceId, (counts.get(ticket.serviceId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([serviceId, count]) => ({
      label: serviceNames.get(serviceId) ?? truncateIdentifier(serviceId),
      value: count,
      color: SEMANTIC_DOT_HEX.primary,
    }))
    .sort(
      (left, right) =>
        right.value - left.value || left.label.localeCompare(right.label),
    )
    .slice(0, reportChartBarLimit);
}

export function buildAgingChart(
  tickets: readonly TicketResponse[],
  now: Date,
  labels: ReportAgingLabels,
): ReportAgingChart {
  const buckets = {
    lessThanOneDay: 0,
    oneToThreeDays: 0,
    threeToSevenDays: 0,
    moreThanSevenDays: 0,
  };
  let waitingOverSevenDays = 0;
  for (const ticket of tickets) {
    if (!isReportOpenTicket(ticket)) {
      continue;
    }
    const ageHours = elapsedHours(ticket.createdAt, now.toISOString());
    if (ageHours === null) {
      continue;
    }
    const days = ageHours / 24;
    if (days < 1) {
      buckets.lessThanOneDay += 1;
    } else if (days < 3) {
      buckets.oneToThreeDays += 1;
    } else if (days < 7) {
      buckets.threeToSevenDays += 1;
    } else {
      buckets.moreThanSevenDays += 1;
      if (ticket.status === "WAITING_FOR_USER") {
        waitingOverSevenDays += 1;
      }
    }
  }
  return {
    waitingOverSevenDays,
    items: [
      {
        label: labels.lessThanOneDay,
        value: buckets.lessThanOneDay,
        color: SEMANTIC_DOT_HEX.success,
      },
      {
        label: labels.oneToThreeDays,
        value: buckets.oneToThreeDays,
        color: SEMANTIC_DOT_HEX.primary,
      },
      {
        label: labels.threeToSevenDays,
        value: buckets.threeToSevenDays,
        color: SEMANTIC_DOT_HEX.warning,
      },
      {
        label: labels.moreThanSevenDays,
        value: buckets.moreThanSevenDays,
        color: SEMANTIC_DOT_HEX.danger,
      },
    ],
  };
}
