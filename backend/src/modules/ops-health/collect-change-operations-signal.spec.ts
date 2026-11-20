import { collectChangeOperationsSignal } from "./collect-change-operations-signal";
import { changeDowntimeDriftMetricKey } from "../changes/change-downtime-drift-metrics";

const now = new Date("2030-05-01T12:00:00.000Z");

type Where = Record<string, unknown>;

function setup(input: {
  readonly upcoming24h?: number;
  readonly due?: number;
  readonly overdue?: number;
  readonly oldestPlannedEnd?: Date | null;
  readonly pending?: number;
  readonly processing?: number;
  readonly deadLetter?: number;
  readonly oldestCreatedAt?: Date | null;
  readonly skipped?: number;
}) {
  const count = jest
    .fn<Promise<number>, [{ where: Where }]>()
    .mockResolvedValueOnce(input.upcoming24h ?? 0)
    .mockResolvedValueOnce(input.due ?? 0)
    .mockResolvedValueOnce(input.overdue ?? 0);
  const findFirst = jest
    .fn<Promise<unknown>, [{ where?: Where; orderBy?: unknown; select?: unknown }]>()
    .mockResolvedValueOnce(
      input.oldestPlannedEnd === undefined || input.oldestPlannedEnd === null
        ? null
        : { plannedEnd: input.oldestPlannedEnd },
    );
  const outboxCount = jest
    .fn<Promise<number>, [{ where: Where }]>()
    .mockResolvedValueOnce(input.pending ?? 0)
    .mockResolvedValueOnce(input.processing ?? 0)
    .mockResolvedValueOnce(input.deadLetter ?? 0);
  const outboxFindFirst = jest
    .fn<Promise<unknown>, [{ where: Where; orderBy: unknown; select: unknown }]>()
    .mockResolvedValue(
      input.oldestCreatedAt === undefined || input.oldestCreatedAt === null
        ? null
        : { createdAt: input.oldestCreatedAt },
    );
  const queryRaw = jest
    .fn<Promise<unknown[]>, [readonly string[], ...unknown[]]>()
    .mockResolvedValue([{ count: BigInt(input.skipped ?? 0) }]);
  const prisma = {
    changeRequest: { count, findFirst },
    outboxMessage: { count: outboxCount, findFirst: outboxFindFirst },
    $queryRaw: queryRaw,
  } as never;
  return { prisma, count, findFirst, outboxCount, queryRaw };
}

describe("collectChangeOperationsSignal (W7.69, BA-changes-13)", () => {
  it("reports reminder backlog, delivery backlog and skipped downtime services", async () => {
    const { prisma } = setup({
      upcoming24h: 3,
      due: 2,
      overdue: 1,
      oldestPlannedEnd: new Date("2030-05-01T10:00:00.000Z"),
      pending: 4,
      processing: 1,
      deadLetter: 2,
      oldestCreatedAt: new Date("2030-05-01T11:55:00.000Z"),
      skipped: 5,
    });
    const signal = await collectChangeOperationsSignal(prisma, null, now, {
      reminderHoursBeforeStart: 24,
      driftPassMaxAgeMs: 10 * 60_000,
    });

    expect(signal.reminders).toEqual({
      upcoming24h: 3,
      dueReminders: 2,
      overdueOpen: 1,
      oldestOverdueMinutes: 120,
      reminderHoursBeforeStart: 24,
    });
    expect(signal.delivery).toEqual({
      pending: 4,
      processing: 1,
      deadLetter: 2,
      oldestPendingMinutes: 5,
    });
    expect(signal.downtime).toEqual({ skippedServices24h: 5, lastPass: null });
  });

  it("stops counting due reminders when the sweep is switched off", async () => {
    const { prisma, count } = setup({ upcoming24h: 1 });
    const signal = await collectChangeOperationsSignal(prisma, null, now, {
      reminderHoursBeforeStart: 0,
      driftPassMaxAgeMs: 10 * 60_000,
    });
    // Upcoming + overdue only: no third count, because there is no due set.
    expect(count).toHaveBeenCalledTimes(2);
    expect(signal.reminders.dueReminders).toBe(0);
  });

  it("says unknown, not zero, when the reminder setting cannot be read", async () => {
    const { prisma, count } = setup({});
    const signal = await collectChangeOperationsSignal(prisma, null, now, {
      reminderHoursBeforeStart: null,
      driftPassMaxAgeMs: 10 * 60_000,
    });
    expect(count).toHaveBeenCalledTimes(2);
    expect(signal.reminders.dueReminders).toBeNull();
    expect(signal.reminders.reminderHoursBeforeStart).toBeNull();
  });

  it("keeps a fresh drift pass and drops a stale one", async () => {
    const fresh = { completedAtMs: now.getTime() - 60_000, scanned: 40, drifted: 2 };
    const store = { read: jest.fn(async () => fresh) };
    const { prisma } = setup({});
    const signal = await collectChangeOperationsSignal(prisma, store, now, {
      reminderHoursBeforeStart: 24,
      driftPassMaxAgeMs: 10 * 60_000,
    });
    expect(signal.downtime.lastPass).toEqual(fresh);

    const stale = { completedAtMs: now.getTime() - 60 * 60_000, scanned: 40, drifted: 2 };
    const staleSignal = await collectChangeOperationsSignal(
      prisma,
      { read: jest.fn(async () => stale) },
      now,
      { reminderHoursBeforeStart: 24, driftPassMaxAgeMs: 10 * 60_000 },
    );
    expect(staleSignal.downtime.lastPass).toBeNull();
  });

  it("never invents a drift pass when the store is missing or unreadable", async () => {
    const { prisma } = setup({});
    const options = { reminderHoursBeforeStart: 24, driftPassMaxAgeMs: 10 * 60_000 };
    const missing = await collectChangeOperationsSignal(prisma, null, now, options);
    expect(missing.downtime.lastPass).toBeNull();
    const failing = await collectChangeOperationsSignal(
      prisma,
      {
        read: jest.fn(async () => {
          throw new Error("redis down");
        }),
      },
      now,
      options,
    );
    expect(failing.downtime.lastPass).toBeNull();
  });

  it("counts only downtime events with a non-empty skip list, in SQL", async () => {
    const { prisma, queryRaw } = setup({ skipped: 2 });
    await collectChangeOperationsSignal(prisma, null, now, {
      reminderHoursBeforeStart: 24,
      driftPassMaxAgeMs: 10 * 60_000,
    });
    const [strings] = queryRaw.mock.calls[0]!;
    const sql = strings.join("?");
    expect(sql).toContain('FROM "ChangeEvent"');
    expect(sql).toContain("jsonb_array_length");
    expect(sql).toContain("skippedServiceIds");
    // The metric key stays stable: the store and the collector must agree.
    expect(changeDowntimeDriftMetricKey).toBe("changes:ops:downtime-drift");
  });
});
