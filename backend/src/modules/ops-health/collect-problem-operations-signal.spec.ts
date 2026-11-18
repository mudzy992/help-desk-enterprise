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
}) {
  const count = jest.fn(async (_args: CountArgs): Promise<number> => 0);
  count.mockResolvedValueOnce(input.stuck ?? 0).mockResolvedValueOnce(input.dead ?? 0);
  const findFirst = jest.fn(
    async (_args: FindFirstArgs): Promise<{ updatedAt: Date } | null> =>
      input.oldestUpdatedAt == null ? null : { updatedAt: input.oldestUpdatedAt },
  );
  const problemCount = jest.fn(async (_args: CountArgs): Promise<number> => input.breached ?? 0);
  const prisma = {
    problemTargetReminder: { count, findFirst },
    problem: { count: problemCount },
  } as never;
  return { prisma, count, problemCount };
}

const now = new Date('2026-10-29T09:00:00.000Z');

describe('collectProblemOperationsSignal (BA-problems-14)', () => {
  it('reports nothing stuck when the sweep keeps up', async () => {
    const { prisma } = setup({});
    await expect(collectProblemOperationsSignal(prisma, now)).resolves.toEqual({
      stuckReminderDeliveries: 0,
      deadReminderDeliveries: 0,
      oldestStuckReminderMinutes: null,
      breachedOpenTargets: 0,
    });
  });

  it('counts the stuck and dead reminders and ages the oldest one', async () => {
    const { prisma, count } = setup({
      stuck: 3,
      dead: 1,
      oldestUpdatedAt: new Date(now.getTime() - 90 * 60_000),
      breached: 7,
    });
    await expect(collectProblemOperationsSignal(prisma, now)).resolves.toEqual({
      stuckReminderDeliveries: 3,
      deadReminderDeliveries: 1,
      oldestStuckReminderMinutes: 90,
      breachedOpenTargets: 7,
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
    const signal = await collectProblemOperationsSignal(prisma, now);
    expect(signal.oldestStuckReminderMinutes).toBe(0);
    expect(problemCount).toHaveBeenCalledTimes(1);
  });
});
