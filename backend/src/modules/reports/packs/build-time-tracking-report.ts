import type { ReportExportRow, ReportPackBuildInput, TimeTrackingReportEntry } from '../reports.types';

export const timeTrackingColumns = [
  'rowType',
  'agent',
  'service',
  'entries',
  'totalHours',
  'tickets',
  'averageHoursPerTicket',
  'manualShare',
  'autoIdleShare',
  'autoMaxDurationShare',
  'corrections',
] as const;

/** Stable row markers; the UI translates them, files carry them verbatim. */
export const timeTrackingRowTypes = {
  detail: 'agent_service',
  agentTotal: 'agent_total',
  grandTotal: 'total',
} as const;

/**
 * Package 1.3 (T9): agent × service rows, each agent followed by its subtotal,
 * one grand total at the end. Shares are percentages of the entry count; a high
 * share is a signal for a conversation, not a penalty.
 */
export function buildTimeTrackingReport(
  input: Pick<ReportPackBuildInput, 'timeEntries'>,
): readonly ReportExportRow[] {
  const entries = input.timeEntries ?? [];
  if (entries.length === 0) {
    return [];
  }
  const byAgent = groupBy(entries, (entry) => entry.userId);
  const agents = [...byAgent.values()].sort((left, right) =>
    left[0]!.userName.localeCompare(right[0]!.userName),
  );
  const rows: ReportExportRow[] = [];
  for (const agentEntries of agents) {
    const agentName = agentEntries[0]!.userName;
    const byService = [...groupBy(agentEntries, (entry) => entry.serviceId).values()].sort(
      (left, right) => (left[0]!.serviceName ?? '').localeCompare(right[0]!.serviceName ?? ''),
    );
    for (const serviceEntries of byService) {
      rows.push(
        summarize(
          timeTrackingRowTypes.detail,
          agentName,
          serviceEntries[0]!.serviceName,
          serviceEntries,
        ),
      );
    }
    rows.push(summarize(timeTrackingRowTypes.agentTotal, agentName, null, agentEntries));
  }
  rows.push(summarize(timeTrackingRowTypes.grandTotal, null, null, entries));
  return rows;
}

function summarize(
  rowType: string,
  agent: string | null,
  service: string | null,
  entries: readonly TimeTrackingReportEntry[],
): ReportExportRow {
  const seconds = entries.reduce((sum, entry) => sum + entry.durationSeconds, 0);
  const tickets = new Set(entries.map((entry) => entry.ticketId)).size;
  const share = (predicate: (entry: TimeTrackingReportEntry) => boolean) =>
    round((entries.filter(predicate).length / entries.length) * 100, 1);
  return {
    rowType,
    agent,
    service,
    entries: entries.length,
    totalHours: round(seconds / 3600, 2),
    tickets,
    averageHoursPerTicket: tickets === 0 ? 0 : round(seconds / 3600 / tickets, 2),
    manualShare: share((entry) => entry.isManual),
    autoIdleShare: share((entry) => entry.stopReason === 'AUTO_IDLE'),
    autoMaxDurationShare: share((entry) => entry.stopReason === 'AUTO_MAX_DURATION'),
    corrections: entries.filter((entry) => entry.isCorrected).length,
  };
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(key(item)) ?? [];
    list.push(item);
    groups.set(key(item), list);
  }
  return groups;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
