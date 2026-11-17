import { ProblemTargetReminderService } from './problem-target-reminder.service';
import { ProblemError, problemErrorCodes } from './problems.constants';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('./problem-access.service', () => ({ ProblemAccessService: class ProblemAccessService {} }));
jest.mock('./problem-notifier', () => ({ ProblemNotifier: class ProblemNotifier {} }));

type ReminderRow = {
  id: string;
  problemId: string;
  targetAt: Date;
  stage: string;
  status: string;
  attempts: number;
  deliveredCount: number;
  recipientCount: number;
  lastErrorCode: string | null;
  claimedAt: Date | null;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProblemRow = {
  id: string;
  status: string;
  targetAt: Date | null;
  targetRemindersSent: string[];
  groupId: string | null;
};

type Condition = Record<string, unknown>;

function matches(row: ReminderRow, where: Condition): boolean {
  if (typeof where.id === 'string' && row.id !== where.id) return false;
  if (typeof where.problemId === 'string' && row.problemId !== where.problemId) return false;
  if (where.status !== undefined) {
    if (typeof where.status === 'string' && row.status !== where.status) return false;
    const list = (where.status as { in?: string[] }).in;
    if (list !== undefined && !list.includes(row.status)) return false;
  }
  if (where.nextAttemptAt !== undefined) {
    const condition = where.nextAttemptAt;
    if (condition === null) {
      if (row.nextAttemptAt !== null) return false;
    } else if (typeof condition === 'object' && condition !== null && 'lte' in condition) {
      const bound = (condition as { lte: Date }).lte;
      if (row.nextAttemptAt === null || row.nextAttemptAt.getTime() > bound.getTime()) return false;
    }
  }
  if (where.claimedAt !== undefined) {
    const bound = (where.claimedAt as { lt?: Date }).lt;
    if (bound !== undefined && (row.claimedAt === null || row.claimedAt.getTime() >= bound.getTime())) return false;
  }
  if (Array.isArray(where.OR)) {
    if (!(where.OR as Condition[]).some((branch) => matches(row, branch))) return false;
  }
  return true;
}

function setup(options: { problem?: Partial<ProblemRow>; reminders?: Partial<ReminderRow>[] } = {}) {
  const now = new Date('2027-11-30T07:23:00.000Z');
  const targetAt = new Date('2027-11-30T12:00:00.000Z');
  const problem: ProblemRow = {
    id: 'p1',
    status: 'INVESTIGATING',
    targetAt,
    targetRemindersSent: [],
    groupId: 'g1',
    ...options.problem,
  };
  const reminders = new Map<string, ReminderRow>();
  for (const [index, seed] of (options.reminders ?? []).entries()) {
    const row: ReminderRow = {
      id: `r${index + 1}`,
      problemId: 'p1',
      targetAt,
      stage: 'due',
      status: 'PENDING',
      attempts: 0,
      deliveredCount: 0,
      recipientCount: 0,
      lastErrorCode: null,
      claimedAt: null,
      lastAttemptAt: null,
      nextAttemptAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      ...seed,
    };
    reminders.set(row.id, row);
  }
  const order: string[] = [];
  let sequence = reminders.size;

  const copy = (row: ReminderRow) => ({ ...row });

  const prisma = {
    problemTargetReminder: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string; problemId_targetAt_stage?: { problemId: string; targetAt: Date; stage: string } } }) => {
        if (typeof where.id === 'string') {
          for (const row of reminders.values()) if (row.id === where.id) return copy(row);
          return null;
        }
        const key = where.problemId_targetAt_stage;
        if (key === undefined) return null;
        for (const row of reminders.values()) {
          if (row.problemId === key.problemId && row.targetAt.getTime() === key.targetAt.getTime() && row.stage === key.stage) {
            return copy(row);
          }
        }
        return null;
      }),
      findFirst: jest.fn(async ({ where }: { where: Condition }) => {
        for (const row of reminders.values()) if (matches(row, where)) return copy(row);
        return null;
      }),
      findMany: jest.fn(async ({ where }: { where: Condition }) =>
        [...reminders.values()].filter((row) => matches(row, where)).map(copy),
      ),
      create: jest.fn(async ({ data }: { data: { problemId: string; targetAt: Date; stage: string } }) => {
        sequence += 1;
        const row: ReminderRow = {
          id: `r${sequence}`,
          problemId: data.problemId,
          targetAt: data.targetAt,
          stage: data.stage,
          status: 'PENDING',
          attempts: 0,
          deliveredCount: 0,
          recipientCount: 0,
          lastErrorCode: null,
          claimedAt: null,
          lastAttemptAt: null,
          nextAttemptAt: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        reminders.set(row.id, row);
        return copy(row);
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Condition; data: Condition }) => {
        let count = 0;
        for (const row of reminders.values()) {
          if (!matches(row, where)) continue;
          count += 1;
          if (typeof data.status === 'string') row.status = data.status;
          if (data.attempts !== undefined) {
            const change = data.attempts as number | { increment?: number; set?: number };
            if (typeof change === 'number') row.attempts = change;
            else if (change.increment !== undefined) row.attempts += change.increment;
            else if (change.set !== undefined) row.attempts = change.set;
          }
          for (const field of ['deliveredCount', 'recipientCount'] as const) {
            if (typeof data[field] === 'number') row[field] = data[field] as number;
          }
          if ('lastErrorCode' in data) row.lastErrorCode = (data.lastErrorCode as string | null) ?? null;
          if ('nextAttemptAt' in data) row.nextAttemptAt = (data.nextAttemptAt as Date | null) ?? null;
          if ('claimedAt' in data) row.claimedAt = (data.claimedAt as Date | null) ?? null;
          if ('lastAttemptAt' in data) row.lastAttemptAt = (data.lastAttemptAt as Date | null) ?? null;
          if ('completedAt' in data) row.completedAt = (data.completedAt as Date | null) ?? null;
        }
        return { count };
      }),
    },
    problem: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => (where.id === problem.id ? { ...problem } : null)),
      findFirst: jest.fn(async ({ where }: { where: { id?: string } }) =>
        where.id === undefined || where.id === problem.id ? { id: problem.id, groupId: problem.groupId } : null,
      ),
      updateMany: jest.fn(async ({ where, data }: { where: Condition; data: { targetRemindersSent?: string[] } }) => {
        if (typeof where.id === 'string' && where.id !== problem.id) return { count: 0 };
        if (where.targetAt instanceof Date) {
          if (problem.targetAt === null || problem.targetAt.getTime() !== where.targetAt.getTime()) return { count: 0 };
        }
        if (data.targetRemindersSent !== undefined) {
          order.push('marker');
          problem.targetRemindersSent = [...data.targetRemindersSent];
        }
        return { count: 1 };
      }),
    },
    $transaction: jest.fn(),
  };

  const notifier = { targetDueDetailed: jest.fn() };
  const access = {
    require: jest.fn(async () => ({ all: true, paths: [] as string[] })),
    hasPermission: jest.fn(() => true),
    hasGroupAuthority: jest.fn(async () => true),
  };
  const service = new ProblemTargetReminderService(prisma as never, access as never, notifier as never);
  return { service, prisma, notifier, access, problem, reminders, order, now, targetAt };
}

const viewer = { userId: 'u1', permissions: new Set<string>(), scope: { all: true, paths: [] } } as never;

describe('ProblemTargetReminderService (W7.25 / BA-problems-07)', () => {
  it('records the stage only after the delivery, and never before it', async () => {
    const harness = setup();
    harness.notifier.targetDueDetailed.mockImplementation(async () => {
      harness.order.push('notifier');
      return { delivered: 1, recipients: 1, failures: 0, errorCode: null };
    });
    const row = await harness.service.ensure('p1', harness.targetAt, 'due');
    const result = await harness.service.attempt(row, { now: harness.now });

    expect(result).toMatchObject({ claimed: true, status: 'SENT', attempts: 1, deliveredCount: 1, recipientCount: 1 });
    expect(harness.order).toEqual(['notifier', 'marker']);
    expect(harness.problem.targetRemindersSent).toEqual(['due']);
    expect(harness.reminders.get(row.id)).toMatchObject({ status: 'SENT', attempts: 1, claimedAt: null });
    expect(harness.reminders.get(row.id)?.completedAt).toEqual(harness.now);
  });

  it('a failing notifier leaves the reminder retryable and writes no marker', async () => {
    const harness = setup();
    harness.notifier.targetDueDetailed.mockRejectedValue(new Error('smtp down'));
    const row = await harness.service.ensure('p1', harness.targetAt, 'due');
    const result = await harness.service.attempt(row, { now: harness.now });

    expect(result.status).toBe('FAILED');
    expect(result.errorCode).toBe('NOTIFIER_FAILED');
    expect(harness.problem.targetRemindersSent).toEqual([]);
    const stored = harness.reminders.get(row.id);
    expect(stored).toMatchObject({ status: 'FAILED', lastErrorCode: 'NOTIFIER_FAILED', completedAt: null });
    expect(stored?.nextAttemptAt?.getTime()).toBe(harness.now.getTime() + 2 * 60_000);
  });

  it('nobody to notify ends as NO_RECIPIENT with the marker, once, without a retry', async () => {
    const harness = setup();
    harness.notifier.targetDueDetailed.mockResolvedValue({ delivered: 0, recipients: 0, failures: 0, errorCode: null });
    const row = await harness.service.ensure('p1', harness.targetAt, 'due');
    const first = await harness.service.attempt(row, { now: harness.now });
    expect(first.status).toBe('NO_RECIPIENT');
    expect(harness.problem.targetRemindersSent).toEqual(['due']);

    const second = await harness.service.attempt(row, { now: harness.now });
    expect(second.claimed).toBe(false);
    expect(harness.notifier.targetDueDetailed).toHaveBeenCalledTimes(1);
    expect(harness.problem.targetRemindersSent).toEqual(['due']);
  });

  it('a re-armed target cancels the old reminder instead of marking the new one as sent', async () => {
    const harness = setup({ problem: { targetAt: new Date('2027-12-05T12:00:00.000Z') } });
    const row = await harness.service.ensure('p1', harness.targetAt, 'due');
    const result = await harness.service.attempt(row, { now: harness.now });

    expect(result).toMatchObject({ status: 'CANCELLED', errorCode: 'TARGET_MOVED' });
    expect(harness.notifier.targetDueDetailed).not.toHaveBeenCalled();
    expect(harness.problem.targetRemindersSent).toEqual([]);
    expect(harness.reminders.get(row.id)).toMatchObject({ status: 'CANCELLED', completedAt: harness.now });
  });

  it('a closed problem cancels the reminder', async () => {
    const harness = setup({ problem: { status: 'RESOLVED' } });
    const row = await harness.service.ensure('p1', harness.targetAt, 'due');
    const result = await harness.service.attempt(row, { now: harness.now });
    expect(result).toMatchObject({ status: 'CANCELLED', errorCode: 'PROBLEM_NOT_OPEN' });
  });

  it('the hourly pass retries only what is due and dead-letters on the fifth failure', async () => {
    const harness = setup({
      reminders: [
        { status: 'FAILED', attempts: 1, nextAttemptAt: new Date('2027-11-30T07:00:00.000Z') },
        { status: 'FAILED', attempts: 1, nextAttemptAt: new Date('2027-11-30T09:00:00.000Z') },
        { status: 'FAILED', attempts: 4, nextAttemptAt: new Date('2027-11-30T07:00:00.000Z') },
        { status: 'SENT', attempts: 1 },
      ],
    });
    harness.notifier.targetDueDetailed.mockResolvedValue({ delivered: 0, recipients: 1, failures: 1, errorCode: 'IN_APP_FAILED' });
    const counts = await harness.service.retryDue(harness.now);

    expect(counts).toEqual({ attempted: 2, sent: 0, noRecipient: 0, failed: 1, dead: 1, cancelled: 0 });
    expect(harness.notifier.targetDueDetailed).toHaveBeenCalledTimes(2);
    expect(harness.reminders.get('r1')).toMatchObject({ status: 'FAILED', attempts: 2 });
    expect(harness.reminders.get('r2')).toMatchObject({ status: 'FAILED', attempts: 1 });
    expect(harness.reminders.get('r3')).toMatchObject({ status: 'DEAD', attempts: 5, nextAttemptAt: null });
    expect(harness.problem.targetRemindersSent).toEqual([]);
  });

  it('an operator retry restarts the attempt budget of a dead-lettered reminder', async () => {
    const harness = setup({ reminders: [{ status: 'DEAD', attempts: 5, lastErrorCode: 'EMAIL_DEAD' }] });
    harness.notifier.targetDueDetailed.mockResolvedValue({ delivered: 1, recipients: 1, failures: 0, errorCode: null });
    const result = await harness.service.retry('p1', 'r1', viewer);

    expect(harness.reminders.get('r1')).toMatchObject({ status: 'SENT', attempts: 1, lastErrorCode: null });
    expect(result.canRetry).toBe(true);
    expect(result.items[0]).toMatchObject({ id: 'r1', status: 'SENT', attempts: 1, canRetry: false });
    expect(harness.problem.targetRemindersSent).toEqual(['due']);
  });

  it('a final reminder cannot be retried again', async () => {
    const harness = setup({ reminders: [{ status: 'SENT', attempts: 1, deliveredCount: 1, recipientCount: 1 }] });
    await expect(harness.service.retry('p1', 'r1', viewer)).rejects.toMatchObject({
      code: problemErrorCodes.targetReminderFinal,
    });
    expect(harness.notifier.targetDueDetailed).not.toHaveBeenCalled();
  });

  it('a reminder claimed by a live worker is not retried in parallel', async () => {
    const harness = setup({ reminders: [{ status: 'CLAIMED', attempts: 1, claimedAt: new Date('2027-11-30T07:20:00.000Z') }] });
    await expect(harness.service.retry('p1', 'r1', viewer)).rejects.toBeInstanceOf(ProblemError);
    expect(harness.notifier.targetDueDetailed).not.toHaveBeenCalled();
  });

  it('the list is readable with problem.read and retryable only with problem.manage', async () => {
    const harness = setup({ reminders: [{ status: 'FAILED', attempts: 2, lastErrorCode: 'IN_APP_FAILED' }] });
    harness.access.hasGroupAuthority.mockResolvedValue(false);
    const readOnly = await harness.service.list('p1', viewer);
    expect(readOnly.canRetry).toBe(false);
    expect(readOnly.items[0]).toMatchObject({ status: 'FAILED', canRetry: false, errorCode: 'IN_APP_FAILED' });

    harness.access.hasGroupAuthority.mockResolvedValue(true);
    const manager = await harness.service.list('p1', viewer);
    expect(manager.canRetry).toBe(true);
    expect(manager.items[0].canRetry).toBe(true);
  });

  it('repairs a marker that a crash between the row and the marker left behind', async () => {
    const harness = setup({ reminders: [{ status: 'SENT', attempts: 1 }] });
    await harness.service.repairMarker({ problemId: 'p1', targetAt: harness.targetAt, stage: 'due', status: 'SENT' });
    expect(harness.problem.targetRemindersSent).toEqual(['due']);
    await harness.service.repairMarker({ problemId: 'p1', targetAt: harness.targetAt, stage: 'due', status: 'SENT' });
    expect(harness.problem.targetRemindersSent).toEqual(['due']);
  });
});
