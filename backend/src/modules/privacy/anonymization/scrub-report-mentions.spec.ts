import { collectReportMentions, stripSkippedUserIds } from './report-mentions';
import { scrubReportMentions } from './scrub-report-mentions';

/*
  W7.104 (BA-reports-13): the report part of an anonymisation. A run keeps its period, status, counters and skip
  reasons; only the identity goes. The person is found through the manual trigger, the `skipped` JSON and the
  schedule's creator/updater column, and each of those is written with the id in the predicate, so a second pass
  changes nothing.
*/
describe('scrubReportMentions', () => {
  const userId = 'u-anna';
  const other = 'u-other';

  type Run = {
    id: string;
    triggeredByUserId: string | null;
    skipped: unknown;
  };
  type Schedule = {
    id: string;
    createdByUserId: string | null;
    updatedByUserId: string | null;
  };

  function fakePrisma(input: { runs?: Run[]; schedules?: Schedule[] }) {
    const runs = input.runs ?? [];
    const schedules = input.schedules ?? [];
    const writes: string[] = [];
    const rawQueries: unknown[] = [];
    const prisma = {
      reportScheduleRun: {
        findMany: async (args: { where: { triggeredByUserId?: string } }) =>
          runs
            .filter((run) => run.triggeredByUserId === args.where.triggeredByUserId)
            .map((run) => ({ id: run.id })),
        updateMany: async (args: { where: { triggeredByUserId: string }; data: Record<string, unknown> }) => {
          let count = 0;
          for (const run of runs) {
            if (run.triggeredByUserId !== args.where.triggeredByUserId) continue;
            Object.assign(run, args.data);
            count += 1;
          }
          writes.push(`runs.triggeredByUserId=${count}`);
          return { count };
        },
        update: async (args: { where: { id: string }; data: { skipped: unknown } }) => {
          const run = runs.find((candidate) => candidate.id === args.where.id);
          if (run !== undefined) run.skipped = args.data.skipped;
          writes.push(`run.skipped=${args.where.id}`);
          return {};
        },
      },
      reportSchedule: {
        findMany: async (args: { where: { createdByUserId?: string; updatedByUserId?: string } }) =>
          schedules
            .filter(
              (schedule) =>
                (args.where.createdByUserId !== undefined &&
                  schedule.createdByUserId === args.where.createdByUserId) ||
                (args.where.updatedByUserId !== undefined &&
                  schedule.updatedByUserId === args.where.updatedByUserId),
            )
            .map((schedule) => ({ id: schedule.id })),
        updateMany: async (args: { where: Record<string, string>; data: Record<string, unknown> }) => {
          const [field, value] = Object.entries(args.where)[0] ?? [];
          let count = 0;
          for (const schedule of schedules) {
            if (field === undefined || schedule[field as keyof Schedule] !== value) continue;
            Object.assign(schedule, args.data);
            count += 1;
          }
          writes.push(`schedules.${field as string}=${count}`);
          return { count };
        },
      },
      // A tagged template: `$queryRaw` receives the SQL parts and the bound values separately. The fake evaluates
      // the same containment the real query does (`skipped @> '[{ "userId": … }]'`), so a second pass really stops.
      $queryRaw: async (strings: readonly string[], ...values: unknown[]) => {
        rawQueries.push({ strings, values });
        const wanted = Array.isArray(values) && typeof values[0] === 'string'
          ? (JSON.parse(values[0]) as { userId?: string }[])[0]?.userId
          : undefined;
        return runs
          .filter(
            (run) =>
              Array.isArray(run.skipped) &&
              run.skipped.some(
                (entry) =>
                  entry !== null &&
                  typeof entry === 'object' &&
                  (entry as { userId?: unknown }).userId === wanted,
              ),
          )
          .map((run) => ({ id: run.id, skipped: run.skipped }));
      },
    };
    return { prisma, runs, schedules, writes, rawQueries };
  }

  it('detaches the manual trigger without touching the run’s facts', async () => {
    const { prisma, runs } = fakePrisma({
      runs: [{ id: 'r1', triggeredByUserId: userId, skipped: [] }],
    });

    const counts = await scrubReportMentions({ prisma: prisma as never, userId });

    expect([counts.reportRunsDetached, counts.reportRunSkipped, counts.reportSchedulesDetached]).toEqual([
      1, 0, 0,
    ]);
    expect(runs[0]).toMatchObject({ id: 'r1', triggeredByUserId: null, skipped: [] });
  });

  it('keeps the skip reason and drops the identity from the JSON', async () => {
    const { prisma, runs } = fakePrisma({
      runs: [
        {
          id: 'r1',
          triggeredByUserId: null,
          skipped: [
            { userId, reason: 'inactive' },
            { userId: other, reason: 'no_access' },
            { reason: 'email_not_allowed' },
          ],
        },
      ],
    });

    const counts = await scrubReportMentions({ prisma: prisma as never, userId });

    expect(counts.reportRunSkipped).toBe(1);
    expect(runs[0]?.skipped).toEqual([
      { reason: 'inactive' },
      { userId: other, reason: 'no_access' },
      { reason: 'email_not_allowed' },
    ]);
  });

  it('is idempotent: the second pass finds nothing to write', async () => {
    const { prisma, runs, schedules } = fakePrisma({
      runs: [{ id: 'r1', triggeredByUserId: userId, skipped: [{ userId, reason: 'inactive' }] }],
      schedules: [{ id: 's1', createdByUserId: userId, updatedByUserId: null }],
    });

    const first = await scrubReportMentions({ prisma: prisma as never, userId });
    // The person's entry is gone now, so the containment query no longer matches the run.
    const second = await collectReportMentions({ prisma: prisma as never, userId });
    expect(second.runsWithSkipped).toHaveLength(0);
    expect(second.runsTriggered).toHaveLength(0);
    expect(runs[0]?.skipped).toEqual([{ reason: 'inactive' }]);
    expect(schedules[0]).toMatchObject({ createdByUserId: null });

    expect(first).toMatchObject({
      reportRunsDetached: 1,
      reportRunSkipped: 1,
      reportSchedulesDetached: 1,
    });
  });

  it('clears the creator and the updater separately', async () => {
    const { prisma, schedules } = fakePrisma({
      schedules: [
        { id: 's1', createdByUserId: other, updatedByUserId: userId },
        { id: 's2', createdByUserId: userId, updatedByUserId: null },
      ],
    });

    const counts = await scrubReportMentions({ prisma: prisma as never, userId });

    expect(counts.reportSchedulesDetached).toBe(2);
    // Nobody else's schedule lost its creator: s1 still names the person who made it.
    expect(schedules).toEqual([
      { id: 's1', createdByUserId: other, updatedByUserId: null },
      { id: 's2', createdByUserId: null, updatedByUserId: null },
    ]);
  });

  it('writes nothing when the person has no report footprint', async () => {
    const { prisma, writes } = fakePrisma({});

    const counts = await scrubReportMentions({ prisma: prisma as never, userId });

    expect(counts).toEqual({
      reportRunsDetached: 0,
      reportRunSkipped: 0,
      reportSchedulesDetached: 0,
    });
    expect(writes).toEqual([]);
  });

  it('selects skipped rows with a jsonb containment query, not a full scan of the table', async () => {
    const { prisma, rawQueries } = fakePrisma({});

    await collectReportMentions({ prisma: prisma as never, userId });

    // One statement, and the person's id is a bound value inside it (never interpolated).
    expect(rawQueries).toHaveLength(1);
    const query = rawQueries[0] as { strings?: readonly string[]; values?: readonly unknown[] };
    expect(query.strings?.join('?')).toContain('"skipped" @>');
    expect(query.values).toEqual([JSON.stringify([{ userId }])]);
  });
});

describe('stripSkippedUserIds', () => {
  const userId = 'u-anna';

  it('leaves malformed JSON alone instead of inventing entries', () => {
    expect(stripSkippedUserIds(null, userId)).toEqual({ value: [], removed: 0 });
    expect(stripSkippedUserIds('nope', userId)).toEqual({ value: [], removed: 0 });
    expect(stripSkippedUserIds([null, 7, ['x'], { userId, reason: 'inactive' }], userId)).toEqual({
      value: [null, 7, ['x'], { reason: 'inactive' }],
      removed: 1,
    });
  });

  it('counts every entry of the person, not just the first', () => {
    const result = stripSkippedUserIds(
      [
        { userId, reason: 'inactive' },
        { userId, reason: 'delivery_unknown' },
      ],
      userId,
    );

    expect(result).toEqual({
      value: [{ reason: 'inactive' }, { reason: 'delivery_unknown' }],
      removed: 2,
    });
  });
});
