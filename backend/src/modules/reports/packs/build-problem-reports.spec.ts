import {
  buildProblemBacklogReport,
  buildProblemRecurrenceReport,
  buildProblemTimingReport,
  buildProblemTopReport,
  emptyProblemReportData,
  problemAgeBucket,
} from './build-problem-reports';

const now = new Date('2026-10-01T10:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const top = (number: string, inPeriod: number, open = 0) => ({
  number,
  title: `Problem ${number}`,
  status: 'INVESTIGATING',
  priority: 'HIGH',
  serviceName: 'Mail',
  rootCauseCategory: null,
  groupName: 'Radne stanice',
  ticketsInPeriod: inPeriod,
  ticketsTotal: inPeriod + 1,
  openTickets: open,
});

describe('problem report packs (3.3 P6)', () => {
  it('ranks problems by tickets linked in the period and drops those without any', () => {
    const rows = buildProblemTopReport({ ...emptyProblemReportData, now, top: [top('P-1', 2), top('P-2', 5), top('P-3', 0), top('P-4', 2, 3)] });
    expect(rows.map((row) => row.problemNumber)).toEqual(['P-2', 'P-4', 'P-1']);
  });

  it('gives median and p90 hours per priority and group, highest priority first', () => {
    const at = (hours: number) => ({ createdAt: now, reachedAt: new Date(now.getTime() + hours * 3_600_000) });
    const rows = buildProblemTimingReport([
      { priority: 'LOW', groupName: 'A', ...at(10) },
      { priority: 'CRITICAL', groupName: 'A', ...at(1) },
      { priority: 'CRITICAL', groupName: 'A', ...at(3) },
    ]);
    expect(rows).toEqual([
      { priority: 'CRITICAL', problemGroup: 'A', count: 2, medianHours: 2, p90Hours: 2.8 },
      { priority: 'LOW', problemGroup: 'A', count: 1, medianHours: 10, p90Hours: 10 },
    ]);
  });

  it('buckets the open backlog by status and age and counts overdue targets before the known error', () => {
    expect(problemAgeBucket(daysAgo(3), now)).toBe('0-7');
    expect(problemAgeBucket(daysAgo(120), now)).toBe('90+');
    const rows = buildProblemBacklogReport({
      ...emptyProblemReportData,
      now,
      backlog: [
        { status: 'KNOWN_ERROR', createdAt: daysAgo(40), targetAt: daysAgo(1) },
        { status: 'NEW', createdAt: daysAgo(2), targetAt: daysAgo(1) },
        { status: 'NEW', createdAt: daysAgo(5), targetAt: null },
      ],
    });
    expect(rows).toEqual([
      { status: 'NEW', ageBucket: '0-7', count: 2, overdue: 1 },
      { status: 'KNOWN_ERROR', ageBucket: '31-90', count: 1, overdue: 0 },
    ]);
  });

  it('counts tickets linked after the resolution per problem', () => {
    const base = { title: 'VPN', status: 'RESOLVED', resolvedAt: daysAgo(10) };
    const rows = buildProblemRecurrenceReport({
      ...emptyProblemReportData,
      now,
      recurrence: [
        { number: 'P-1', ...base, linkedAt: daysAgo(3) },
        { number: 'P-1', ...base, linkedAt: daysAgo(1) },
        { number: 'P-2', ...base, linkedAt: daysAgo(2) },
      ],
    });
    expect(rows.map((row) => [row.problemNumber, row.recurrenceTickets])).toEqual([['P-1', 2], ['P-2', 1]]);
    expect(rows[0]?.lastRecurrenceAt).toBe(daysAgo(1).toISOString().slice(0, 16).replace('T', ' '));
  });
});
