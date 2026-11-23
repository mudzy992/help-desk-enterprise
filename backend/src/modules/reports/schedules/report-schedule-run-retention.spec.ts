import { reportScheduleLimits } from './report-schedule.constants';
import {
  pruneReportScheduleRuns,
  type ReportScheduleRunRetentionDelegate,
} from './report-schedule-run-retention';

const dayMs = 86_400_000;
const now = new Date('2026-11-23T03:17:00.000Z');

type Run = { readonly id: string; readonly createdAt: Date };

/**
 * W7.103 (`BA-reports-14`): the retention pass used to be one unbounded, silently-swallowed `deleteMany` inside
 * the delivery sweep. The pass is now bounded (batch + budget), reports whether a backlog remains, and lets a
 * database error reach the caller.
 */
describe('pruneReportScheduleRuns', () => {
  function createDelegate(runs: Run[]) {
    const store = new Map(runs.map((run) => [run.id, run]));
    const calls: { where: unknown; take?: number }[] = [];
    let failDelete = false;
    const delegate: ReportScheduleRunRetentionDelegate = {
      reportScheduleRun: {
        findMany: (async (args: {
          where: { createdAt: { lt: Date } };
          take?: number;
        }) => {
          calls.push({ where: args.where, take: args.take });
          return [...store.values()]
            .filter((run) => run.createdAt.getTime() < args.where.createdAt.lt.getTime())
            .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
            .slice(0, args.take ?? 100)
            .map((run) => ({ id: run.id }));
        }) as never,
        deleteMany: (async (args: { where: { id: { in: string[] } } }) => {
          if (failDelete) throw new Error('deadlock detected');
          let count = 0;
          for (const id of args.where.id.in) if (store.delete(id)) count += 1;
          return { count };
        }) as never,
      } as never,
    };
    return {
      delegate,
      store,
      calls,
      remaining: () => [...store.values()].map((run) => run.id),
      failNextDelete: () => {
        failDelete = true;
      },
      allowDeletes: () => {
        failDelete = false;
      },
    };
  }

  const expired = (id: string, ageDays: number): Run => ({
    id,
    createdAt: new Date(now.getTime() - ageDays * dayMs),
  });

  it('deletes only runs older than the retention window and reports the cutoff', async () => {
    const { delegate, store } = createDelegate([
      expired('old-1', 200),
      expired('edge-1', 181),
      expired('keep-1', 179),
      expired('fresh-1', 1),
    ]);

    const result = await pruneReportScheduleRuns(delegate, { now });

    expect([...store.keys()]).toEqual(['keep-1', 'fresh-1']);
    expect(result).toMatchObject({
      deleted: 2,
      remaining: false,
      batches: 1,
      cutoff: new Date(now.getTime() - reportScheduleLimits.runRetentionDays * dayMs),
    });
  });

  it('deletes in batches instead of one unbounded statement', async () => {
    const { delegate, calls } = createDelegate([
      expired('old-1', 400),
      expired('old-2', 300),
      expired('old-3', 200),
    ]);

    const result = await pruneReportScheduleRuns(delegate, { now, batchSize: 2 });

    // A full batch, then a short batch — the short batch is the proof that the window is empty, so there is no
    // third read.
    expect(calls.map((call) => call.take)).toEqual([2, 2]);
    expect(result).toMatchObject({ deleted: 3, batches: 2, remaining: false });
  });

  it('stops at the batch budget and says that a backlog remains', async () => {
    const runs = Array.from({ length: 9 }, (_, index) => expired(`old-${index}`, 200 + index));
    const { delegate, store } = createDelegate(runs);

    const result = await pruneReportScheduleRuns(delegate, { now, batchSize: 2, maxBatches: 3 });

    expect(result).toMatchObject({ deleted: 6, batches: 3, remaining: true });
    expect(store.size).toBe(3);
  });

  it('is idempotent: a second pass over the same instant deletes nothing', async () => {
    const { delegate } = createDelegate([expired('old-1', 200)]);

    const first = await pruneReportScheduleRuns(delegate, { now });
    const second = await pruneReportScheduleRuns(delegate, { now });

    expect(first.deleted).toBe(1);
    expect(second).toMatchObject({ deleted: 0, batches: 0, remaining: false });
  });

  it('never deletes a run that is exactly on the cutoff', async () => {
    const onCutoff = now.getTime() - reportScheduleLimits.runRetentionDays * dayMs;
    const { delegate, store } = createDelegate([{ id: 'edge', createdAt: new Date(onCutoff) }]);

    const result = await pruneReportScheduleRuns(delegate, { now });

    expect(result.deleted).toBe(0);
    expect([...store.keys()]).toEqual(['edge']);
  });

  it('lets a database error reach the caller instead of swallowing it', async () => {
    const { delegate, failNextDelete } = createDelegate([expired('old-1', 200)]);
    failNextDelete();

    // The old code had `.catch(() => undefined)` here: retention could stop for a year without a single signal.
    await expect(pruneReportScheduleRuns(delegate, { now })).rejects.toThrow('deadlock detected');
  });

  it('takes the retention window from the constants, not from the caller', async () => {
    const { delegate, calls } = createDelegate([expired('old-1', 200)]);

    await pruneReportScheduleRuns(delegate, { now });

    expect((calls[0]?.where as { createdAt: { lt: Date } }).createdAt.lt.toISOString()).toBe(
      new Date(now.getTime() - 180 * dayMs).toISOString(),
    );
  });
});
