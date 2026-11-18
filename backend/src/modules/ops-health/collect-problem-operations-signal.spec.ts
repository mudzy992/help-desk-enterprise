import { collectProblemOperationsSignal } from './collect-problem-operations-signal';
import { problemReminderClaimStaleMilliseconds } from '../problems/sweep/problem-sweep.constants';

type Where = Record<string, unknown>;
type CountArgs = { where: Where };
type FindFirstArgs = { where: Where; orderBy: unknown; select: unknown };

function setup(input: {
  readonly stuck?: number;
  readonly dead?: number;
  readonly oldestUpdatedAt?: Date | null;
  readonly breached?: number;
  readonly oldestTargetAt?: Date | null;
  readonly autoCloseDue?: number;
  readonly oldestResolvedAt?: Date | null;
}) {
  const count = jest.fn(async (_args: CountArgs): Promise<number> => 0);
  count.mockResolvedValueOnce(input.stuck ?? 0).mockResolvedValueOnce(input.dead ?? 0);
  const findFirst = jest.fn(
    async (_args: FindFirstArgs): Promise<{ updatedAt: Date } | null> =>
      input.oldestUpdatedAt == null ? null : { updatedAt: input.oldestUpdatedAt },
  );
  const problemCount = jest.fn(async (_args: CountArgs): Promise<number> => input.breached ?? 0);
  problemCount.mockResolvedValueOnce(input.breached ?? 0);
  const problemFindFirst = jest
    .fn()
    .mockResolvedValueOnce(input.oldestTargetAt == null ? null : { targetAt: input.oldestTargetAt })
    .mockResolvedValueOnce(input.oldestResolvedAt == null ? null : { resolvedAt: input.oldestResolvedAt });
  // The auto-close count and the oldest-due row are the third/fourth problem reads.
  problemCount.mockResolvedValueOnce(input.autoCloseDue ?? 0);
  const prisma = {
    problemTargetReminder: { count, findFirst },
    problem: { count: problemCount, findFirst: problemFindFirst },
  } as never;
  return { prisma, count, problemCount, problemFindFirst };
}

const now = new Date('2026-10-29T09:00:00.000Z');
const autoCloseDays = 14;

describe('collectProblemOperationsSignal (BA-problems-14, W7.40)', () => {
  it('reports nothing stuck when the sweep keeps up', async () => {
    const { prisma } = setup({});
    await expect(collectProblemOperationsSignal(prisma, now, { autoCloseDays })).resolves.toEqual({
      stuckReminderDeliveries: 0,
      deadReminderDeliveries: 0,
      oldestStuckReminderMinutes: null,
      breachedOpenTargets: 0,
      oldestOverdueTargetMinutes: null,
      autoCloseDue: 0,
      oldestAutoCloseDueMinutes: null,
      effectiveAutoCloseDays: autoCloseDays,
    });
  });

  it('counts the stuck and dead reminders and ages the oldest one', async () => {
    const { prisma, count } = setup({
      stuck: 3,
      dead: 1,
      oldestUpdatedAt: new Date(now.getTime() - 90 * 60_000),
      breached: 7,
    });
    const signal = await collectProblemOperationsSignal(prisma, now, { autoCloseDays });
    expect(signal).toEqual({
      stuckReminderDeliveries: 3,
      deadReminderDeliveries: 1,
      oldestStuckReminderMinutes: 90,
      breachedOpenTargets: 7,
      oldestOverdueTargetMinutes: null,
      autoCloseDue: 0,
      oldestAutoCloseDueMinutes: null,
      effectiveAutoCloseDays: autoCloseDays,
    });
    // Both counts read the same definition of "stuck" as the sweep's pick-up.
    const arms = (count.mock.calls[0]?.[0].where.OR as readonly Where[] | undefined) ?? [];
    expect(arms.map((arm) => arm.status)).toEqual(['DEAD', 'FAILED', 'FAILED', 'CLAIMED']);
    expect(arms[3]?.claimedAt).toEqual({
      lt: new Date(now.getTime() - problemReminderClaimStaleMilliseconds),
    });
    // DEAD is a subset, so its own count is a plain status filter.
    expect(count.mock.calls[1]?.[0].where).toEqual({ status: 'DEAD' });
  });

  it('never lets a negative age leak out of clock skew', async () => {
    const { prisma, problemCount } = setup({
      stuck: 1,
      oldestUpdatedAt: new Date(now.getTime() + 60_000),
    });
    const signal = await collectProblemOperationsSignal(prisma, now, { autoCloseDays });
    expect(signal.oldestStuckReminderMinutes).toBe(0);
    expect(problemCount).toHaveBeenCalled();
  });

  it('ages the oldest breached target, so a backlog that stopped moving is visible', async () => {
    const { prisma } = setup({
      breached: 2,
      oldestTargetAt: new Date(now.getTime() - 5 * 60 * 60_000),
    });
    const signal = await collectProblemOperationsSignal(prisma, now, { autoCloseDays });
    expect(signal.oldestOverdueTargetMinutes).toBe(300);
    expect(signal.breachedOpenTargets).toBe(2);
  });

  it('measures the auto-close backlog from the deadline, not from the resolution', async () => {
    // Resolved 20 days ago with a 14-day deadline: 6 days past due.
    const { prisma } = setup({
      autoCloseDue: 4,
      oldestResolvedAt: new Date(now.getTime() - 20 * 86_400_000),
    });
    const signal = await collectProblemOperationsSignal(prisma, now, { autoCloseDays });
    expect(signal.autoCloseDue).toBe(4);
    expect(signal.oldestAutoCloseDueMinutes).toBe(6 * 24 * 60);
    expect(signal.effectiveAutoCloseDays).toBe(autoCloseDays);
  });

  it('treats auto-close 0 as "nothing is due" instead of counting every resolved problem', async () => {
    const { prisma, problemFindFirst } = setup({});
    const signal = await collectProblemOperationsSignal(prisma, now, { autoCloseDays: 0 });
    expect(signal.autoCloseDue).toBeNull();
    expect(signal.oldestAutoCloseDueMinutes).toBeNull();
    expect(signal.effectiveAutoCloseDays).toBe(0);
    // Only the breached-target row is read; no auto-close query runs.
    expect(problemFindFirst).toHaveBeenCalledTimes(1);
  });

  it('reports an unreadable setting as unknown rather than as a zero backlog', async () => {
    const { prisma } = setup({ breached: 1 });
    const signal = await collectProblemOperationsSignal(prisma, now, { autoCloseDays: null });
    expect(signal.autoCloseDue).toBeNull();
    expect(signal.oldestAutoCloseDueMinutes).toBeNull();
    expect(signal.effectiveAutoCloseDays).toBeNull();
  });
});
