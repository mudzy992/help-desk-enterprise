import { percentileCont } from '../trends/in-memory-report-trend-source';
import type { ReportExportRow } from '../reports.types';

/**
 * Paket 3.3 P6 (§15): problem report packs. Pure builders over pre-loaded
 * rows, scoped to the report units by the problem's unit. "Top", timing and
 * recurrence use the report period; the backlog is a snapshot.
 */

export type ProblemTopRecord = {
  readonly number: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly serviceName: string | null;
  readonly rootCauseCategory: string | null;
  readonly groupName: string | null;
  readonly ticketsInPeriod: number;
  readonly ticketsTotal: number;
  readonly openTickets: number;
};

export type ProblemTimingRecord = {
  readonly priority: string;
  readonly groupName: string | null;
  readonly createdAt: Date;
  /** identifiedAt (known error) or resolvedAt, depending on the pack. */
  readonly reachedAt: Date;
};

export type ProblemBacklogRecord = {
  readonly status: string;
  readonly createdAt: Date;
  readonly targetAt: Date | null;
};

export type ProblemRecurrenceRecord = {
  readonly number: string;
  readonly title: string;
  readonly status: string;
  readonly resolvedAt: Date | null;
  readonly linkedAt: Date;
};

export type ProblemReportData = {
  readonly now: Date;
  readonly top: readonly ProblemTopRecord[];
  readonly knownError: readonly ProblemTimingRecord[];
  readonly resolution: readonly ProblemTimingRecord[];
  readonly backlog: readonly ProblemBacklogRecord[];
  readonly recurrence: readonly ProblemRecurrenceRecord[];
};

export const emptyProblemReportData: ProblemReportData = {
  now: new Date(0),
  top: [],
  knownError: [],
  resolution: [],
  backlog: [],
  recurrence: [],
};

export const problemTopLimit = 50;
const dayMs = 86_400_000;
const hourMs = 3_600_000;
const collator = new Intl.Collator('bs', { sensitivity: 'base' });
const priorityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const statusOrder = ['NEW', 'INVESTIGATING', 'KNOWN_ERROR'];

function isoDateTime(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 16).replace('T', ' ');
}

function rounded(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

// ------------------------------------------------------------ problem_top

export const problemTopColumns = [
  'problemNumber',
  'title',
  'status',
  'priority',
  'service',
  'rootCauseCategory',
  'problemGroup',
  'ticketsInPeriod',
  'ticketsTotal',
  'openTickets',
] as const;

export function buildProblemTopReport(data: ProblemReportData): ReportExportRow[] {
  return [...data.top]
    .filter((record) => record.ticketsInPeriod > 0)
    .sort((left, right) => right.ticketsInPeriod - left.ticketsInPeriod || right.openTickets - left.openTickets || collator.compare(left.number, right.number))
    .slice(0, problemTopLimit)
    .map((record) => ({
      problemNumber: record.number,
      title: record.title,
      status: record.status,
      priority: record.priority,
      service: record.serviceName,
      rootCauseCategory: record.rootCauseCategory,
      problemGroup: record.groupName,
      ticketsInPeriod: record.ticketsInPeriod,
      ticketsTotal: record.ticketsTotal,
      openTickets: record.openTickets,
    }));
}

// ------------------------------------------------------------ timing (known error, resolution)

export const problemTimingColumns = ['priority', 'problemGroup', 'count', 'medianHours', 'p90Hours'] as const;

/** Median and p90 in hours per priority and problem group, highest priority first. */
export function buildProblemTimingReport(records: readonly ProblemTimingRecord[]): ReportExportRow[] {
  const groups = new Map<string, { priority: string; groupName: string | null; samples: number[] }>();
  for (const record of records) {
    const key = `${record.priority}\u0000${record.groupName ?? ''}`;
    const group = groups.get(key) ?? { priority: record.priority, groupName: record.groupName, samples: [] };
    group.samples.push(Math.max(0, record.reachedAt.getTime() - record.createdAt.getTime()) / hourMs);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort(
      (left, right) =>
        priorityOrder.indexOf(left.priority) - priorityOrder.indexOf(right.priority) || collator.compare(left.groupName ?? '', right.groupName ?? ''),
    )
    .map((group) => ({
      priority: group.priority,
      problemGroup: group.groupName,
      count: group.samples.length,
      medianHours: rounded(percentileCont(group.samples, 0.5)),
      p90Hours: rounded(percentileCont(group.samples, 0.9)),
    }));
}

export function buildProblemTimeToKnownErrorReport(data: ProblemReportData): ReportExportRow[] {
  return buildProblemTimingReport(data.knownError);
}

export function buildProblemTimeToResolutionReport(data: ProblemReportData): ReportExportRow[] {
  return buildProblemTimingReport(data.resolution);
}

// ------------------------------------------------------------ problem_backlog

export const problemBacklogColumns = ['status', 'ageBucket', 'count', 'overdue'] as const;

export const problemAgeBuckets = [
  { key: '0-7', maxDays: 7 },
  { key: '8-30', maxDays: 30 },
  { key: '31-90', maxDays: 90 },
  { key: '90+', maxDays: Number.POSITIVE_INFINITY },
] as const;

export function problemAgeBucket(createdAt: Date, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / dayMs));
  return problemAgeBuckets.find((bucket) => days <= bucket.maxDays)?.key ?? '90+';
}

export function buildProblemBacklogReport(data: ProblemReportData): ReportExportRow[] {
  const cells = new Map<string, { status: string; ageBucket: string; count: number; overdue: number }>();
  for (const record of data.backlog) {
    const ageBucket = problemAgeBucket(record.createdAt, data.now);
    const key = `${record.status}\u0000${ageBucket}`;
    const cell = cells.get(key) ?? { status: record.status, ageBucket, count: 0, overdue: 0 };
    cell.count += 1;
    // A target only runs until the known error (§10).
    if (record.targetAt !== null && record.targetAt.getTime() < data.now.getTime() && record.status !== 'KNOWN_ERROR') cell.overdue += 1;
    cells.set(key, cell);
  }
  const bucketIndex = (key: string) => problemAgeBuckets.findIndex((bucket) => bucket.key === key);
  return [...cells.values()]
    .sort((left, right) => statusOrder.indexOf(left.status) - statusOrder.indexOf(right.status) || bucketIndex(left.ageBucket) - bucketIndex(right.ageBucket))
    .map((cell) => ({ status: cell.status, ageBucket: cell.ageBucket, count: cell.count, overdue: cell.overdue }));
}

// ------------------------------------------------------------ problem_recurrence

export const problemRecurrenceColumns = ['problemNumber', 'title', 'status', 'resolvedAt', 'recurrenceTickets', 'lastRecurrenceAt'] as const;

/** Tickets linked after the problem was resolved (§11): the cause was not really removed. */
export function buildProblemRecurrenceReport(data: ProblemReportData): ReportExportRow[] {
  const byProblem = new Map<string, { record: ProblemRecurrenceRecord; count: number; last: Date }>();
  for (const record of data.recurrence) {
    const entry = byProblem.get(record.number);
    if (entry === undefined) byProblem.set(record.number, { record, count: 1, last: record.linkedAt });
    else {
      entry.count += 1;
      if (record.linkedAt.getTime() > entry.last.getTime()) entry.last = record.linkedAt;
    }
  }
  return [...byProblem.values()]
    .sort((left, right) => right.count - left.count || right.last.getTime() - left.last.getTime())
    .map(({ record, count, last }) => ({
      problemNumber: record.number,
      title: record.title,
      status: record.status,
      resolvedAt: isoDateTime(record.resolvedAt),
      recurrenceTickets: count,
      lastRecurrenceAt: isoDateTime(last),
    }));
}
