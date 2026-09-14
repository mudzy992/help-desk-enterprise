import { isTimestampInWindow } from '../resolve-report-window';
import type { ReportExportRow, ReportPackBuildInput } from '../reports.types';

export const topCloseCodesColumns = [
  'closeCodeKey',
  'closeCodeName',
  'count',
] as const;

export function buildTopCloseCodesReport(
  input: ReportPackBuildInput,
): readonly ReportExportRow[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const ticket of input.tickets) {
    if (ticket.closeCodeId === null) {
      continue;
    }
    if (
      !isTimestampInWindow(ticket.resolvedAt, input.window) &&
      !isTimestampInWindow(ticket.closedAt, input.window)
    ) {
      continue;
    }
    const code = input.closeCodesById.get(ticket.closeCodeId);
    if (code === undefined) {
      continue;
    }
    const current = counts.get(code.key) ?? { name: code.name, count: 0 };
    counts.set(code.key, { name: current.name, count: current.count + 1 });
  }
  return [...counts.entries()]
    .map(([closeCodeKey, value]) => ({
      closeCodeKey,
      closeCodeName: value.name,
      count: value.count,
    }))
    .sort((left, right) => {
      const byCount = Number(right.count) - Number(left.count);
      return byCount !== 0
        ? byCount
        : String(left.closeCodeKey).localeCompare(String(right.closeCodeKey));
    });
}
