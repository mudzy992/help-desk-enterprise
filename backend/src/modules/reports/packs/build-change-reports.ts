import type { ReportExportRow } from '../reports.types';

/**
 * Paket 3.4 (§18): change report packs. Pure builders over pre-loaded rows,
 * scoped to the report units by the change's unit.
 */

export type ChangeOutcomeRecord = {
  readonly type: string;
  readonly outcome: string | null;
};

export type ChangeScheduleRecord = {
  readonly number: string;
  readonly title: string;
  readonly type: string;
  readonly risk: string;
  readonly status: string;
  readonly plannedStart: Date | null;
  readonly plannedEnd: Date | null;
  readonly outcome: string | null;
  readonly cabGroupName: string | null;
};

export type ChangeReportData = {
  /** Changes closed in the report period. */
  readonly outcomes: readonly ChangeOutcomeRecord[];
  /** Changes whose planned window touches the report period. */
  readonly schedule: readonly ChangeScheduleRecord[];
};

export const emptyChangeReportData: ChangeReportData = { outcomes: [], schedule: [] };

const changeTypeOrder = ['STANDARD', 'NORMAL', 'EMERGENCY'] as const;

function formatTimestamp(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 16).replace('T', ' ');
}

function percent(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 1000) / 10;
}

export const changeOutcomeColumns = [
  'changeType',
  'closed',
  'successful',
  'partial',
  'failed',
  'rolledBack',
  'successRatePercent',
  'sharePercent',
] as const;

/**
 * One row per type plus a total ("ALL"). The share of the EMERGENCY row is
 * the emergency share of all closed changes; a change closed without an
 * outcome counts as closed only.
 */
export function buildChangeOutcomesReport(data: ChangeReportData): ReportExportRow[] {
  const total = data.outcomes.length;
  const row = (label: string, records: readonly ChangeOutcomeRecord[]): ReportExportRow => {
    const count = (outcome: string) => records.filter((record) => record.outcome === outcome).length;
    const successful = count('SUCCESSFUL');
    return {
      changeType: label,
      closed: records.length,
      successful,
      partial: count('PARTIAL'),
      failed: count('FAILED'),
      rolledBack: count('ROLLED_BACK'),
      successRatePercent: percent(successful, records.length),
      sharePercent: percent(records.length, total),
    };
  };
  const rows = changeTypeOrder.map((type) => row(type, data.outcomes.filter((record) => record.type === type)));
  return [...rows, row('ALL', data.outcomes)];
}

export const changeScheduleColumns = [
  'changeNumber',
  'title',
  'changeType',
  'risk',
  'status',
  'plannedStart',
  'plannedEnd',
  'outcome',
  'cabGroup',
] as const;

export function buildChangeScheduleReport(data: ChangeReportData): ReportExportRow[] {
  return [...data.schedule]
    .sort((left, right) => (left.plannedStart?.getTime() ?? 0) - (right.plannedStart?.getTime() ?? 0) || left.number.localeCompare(right.number))
    .map((record) => ({
      changeNumber: record.number,
      title: record.title,
      changeType: record.type,
      risk: record.risk,
      status: record.status,
      plannedStart: formatTimestamp(record.plannedStart),
      plannedEnd: formatTimestamp(record.plannedEnd),
      outcome: record.outcome,
      cabGroup: record.cabGroupName,
    }));
}
