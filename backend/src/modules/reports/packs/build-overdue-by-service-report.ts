import type { ReportExportRow, ReportPackBuildInput } from '../reports.types';

export const overdueByServiceColumns = [
  'serviceId',
  'overdueCount',
] as const;

export function buildOverdueByServiceReport(
  input: ReportPackBuildInput,
): readonly ReportExportRow[] {
  const counts = new Map<string, number>();
  for (const ticket of input.tickets) {
    if (!ticket.isOverdue) {
      continue;
    }
    counts.set(ticket.serviceId, (counts.get(ticket.serviceId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([serviceId, overdueCount]) => ({ serviceId, overdueCount }))
    .sort((left, right) => {
      const byCount = Number(right.overdueCount) - Number(left.overdueCount);
      return byCount !== 0
        ? byCount
        : String(left.serviceId).localeCompare(String(right.serviceId));
    });
}
