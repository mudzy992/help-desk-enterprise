import { ProblemSweepService } from './problem-sweep.service';
import { problemSweepBatch, problemSweepTickBudgetMilliseconds } from './problem-sweep.constants';

// The boundary of a tick is what is under test here, not the calendar maths or
// the stage planner; both have their own specs.
jest.mock('../problem-target', () => ({
  loadProblemTargetCalendar: jest.fn(async () => ({ timezone: 'UTC', weeklyHours: {}, holidays: [] })),
}));
jest.mock('./plan-problem-reminders', () => ({
  planProblemReminder: jest.fn(() => null),
}));

type Row = { id: string; version?: number; organizationalUnitId?: string | null; resolvedAt?: Date; targetAt?: Date };

function setup(input: {
  readonly autoCloseDays?: number;
  readonly targetEnabled?: boolean;
  readonly dueRows?: readonly Row[];
  readonly reminderRows?: readonly Row[];
}) {
  type FindManyArgs = { readonly where: { readonly status?: unknown }; readonly orderBy?: unknown; readonly take?: number };
  const problemFindMany = jest.fn(async (args: FindManyArgs): Promise<readonly Row[]> =>
    args.where.status === 'RESOLVED' ? (input.dueRows ?? []) : (input.reminderRows ?? []),
  );
  const updateMany = jest.fn(async (): Promise<{ count: number }> => ({ count: 1 }));
  const auditLog = { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) };
  const transaction = jest.fn(async (run: (tx: unknown) => Promise<unknown>) =>
    run({
      problem: { updateMany },
      problemEvent: { create: jest.fn(async () => ({})) },
      auditLog,
      $queryRaw: jest.fn(async () => [{ lastNumber: 1 }]),
      $executeRaw: jest.fn(async () => 1),
    }),
  );
  const prisma = { problem: { findMany: problemFindMany }, $transaction: transaction };
  const access = {
    isEnabled: jest.fn(async () => true),
    configuration: jest.fn(async () => ({
      numberPrefix: 'P-',
      rootCauseCategories: [],
      requireWorkaroundForKnownError: false,
      autoCloseDays: input.autoCloseDays ?? 14,
      bulkResolveMax: 200,
      targetEnabled: input.targetEnabled ?? false,
      targetCalendarId: '',
      targetDays: { CRITICAL: 2, HIGH: 5, MEDIUM: 10, LOW: 20 },
    })),
  };
  const reminders = {
    retryDue: jest.fn(async () => ({
      attempted: 0,
      sent: 0,
      noRecipient: 0,
      failed: 0,
      dead: 0,
      cancelled: 0,
    })),
  };
  const sweep = new ProblemSweepService(prisma as never, access as never, reminders as never);
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  (sweep as unknown as { logger: typeof logger }).logger = logger;
  const warnings = () => logger.warn.mock.calls.map((call) => String(call[0]));
  return { sweep, problemFindMany, transaction, updateMany, auditLog, warnings };
}

function rows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({ id: `p-${index}`, version: 1, organizationalUnitId: 'ou-1' }));
}

const now = new Date('2026-10-29T09:00:00.000Z');

describe('ProblemSweepService budget and batch boundary (BA-problems-18)', () => {
  it('stops before the first row when the tick is out of time and reports what it left', async () => {
    const { sweep, updateMany } = setup({ dueRows: rows(3) });

    const result = await sweep.run(now, { deadlineMs: now.getTime() - 1 });

    // The deadline is already gone, so no row is touched ...
    expect(updateMany).not.toHaveBeenCalled();
    // ... and the tick says so instead of looking like an empty hour.
    expect(result).toMatchObject({
      closed: 0,
      budgetReached: true,
      deferred: { autoClose: 3, reminders: 0 },
    });
  });

  it('processes what it can and reports the rest when the budget runs out mid-batch', async () => {
    const { sweep, updateMany, warnings } = setup({ dueRows: rows(3) });
    const realNow = Date.now;
    let checks = 0;
    // The deadline (first call) is real; the first row check passes, the second jumps a day.
    Date.now = () => realNow() + (checks++ >= 2 ? 86_400_000 : 0);
    try {
      const result = await sweep.run(now);
      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ closed: 1, budgetReached: true, deferred: { autoClose: 2 } });
      expect(warnings().some((message) => message.startsWith('problem_sweep_budget_reached phase=auto_close'))).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });

  it('proves a full batch by asking for one row more and says so', async () => {
    // 501 loaded rows = 500 processed + proof that there is at least one more.
    const { sweep, updateMany, warnings } = setup({ dueRows: rows(problemSweepBatch + 1) });

    const result = await sweep.run(now);

    expect(updateMany).toHaveBeenCalledTimes(problemSweepBatch);
    expect(result.closed).toBe(problemSweepBatch);
    expect(result.deferred.autoClose).toBe(0);
    expect(result.budgetReached).toBe(false);
    expect(warnings().some((message) => message.startsWith('problem_sweep_batch_cap_reached phase=auto_close'))).toBe(true);
  });

  it('keeps both phases oldest-first and reads one row more than the batch', async () => {
    const { sweep, problemFindMany } = setup({ dueRows: rows(1), targetEnabled: true, reminderRows: rows(1) });
    await sweep.run(now, { ignoreHour: true });

    const autoCloseArgs = problemFindMany.mock.calls[0]?.[0];
    const reminderArgs = problemFindMany.mock.calls[1]?.[0];
    expect(autoCloseArgs?.orderBy).toEqual({ resolvedAt: 'asc' });
    expect(autoCloseArgs?.take).toBe(problemSweepBatch + 1);
    expect(reminderArgs?.orderBy).toEqual({ targetAt: 'asc' });
    expect(reminderArgs?.take).toBe(problemSweepBatch + 1);
  });

  it('applies the same budget and proof to the reminder phase', async () => {
    const { sweep, problemFindMany } = setup({ targetEnabled: true, reminderRows: rows(problemSweepBatch + 1) });
    const result = await sweep.run(now, { ignoreHour: true, deadlineMs: now.getTime() - 1 });

    expect(problemFindMany.mock.calls[1]?.[0]).toBeDefined();
    expect(result.budgetReached).toBe(true);
    expect(result.deferred.reminders).toBe(problemSweepBatch);
  });

  it('keeps the single-phase entry points working without a budget', async () => {
    const { sweep, updateMany } = setup({ dueRows: rows(2) });

    await expect(sweep.autoClose(now, 14)).resolves.toBe(2);
    const pass = await sweep.autoClosePass(now, 14);

    expect(updateMany).toHaveBeenCalledTimes(4);
    expect(pass).toMatchObject({ closed: 2, processed: 2, deferred: 0, capped: false, budgetReached: false });
    expect(problemSweepTickBudgetMilliseconds).toBeLessThanOrEqual(60 * 60_000);
  });
});
