jest.mock("../../common/prisma/prisma.service", () => ({ PrismaService: class PrismaService {} }));
jest.mock("../../common/outbox/transactional-outbox.service", () => ({ TransactionalOutboxService: class TransactionalOutboxService {} }));

import type { OutboxDelivery, OutboxHandler, TransactionalOutboxService } from "../../common/outbox/transactional-outbox.service";
import {
  changeDowntimeReconciliationDedupeKey,
  changeDowntimeSyncMaxAttempts,
  changeDowntimeSyncTopic,
} from "./change-downtime-outbox";
import { ChangeDowntimeOutboxReconciler } from "./change-downtime-outbox-reconciler.service";
import type { ChangeScheduleService } from "./change-schedule.service";

function setup() {
  const transaction = {};
  const prisma = {
    $transaction: jest.fn(async (work: (tx: unknown) => unknown) =>
      work(transaction),
    ),
    changeRequest: { findMany: jest.fn().mockResolvedValue([]) },
    outboxMessage: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const outbox = {
    dispatchOne: jest.fn().mockResolvedValue("idle"),
    enqueue: jest.fn().mockResolvedValue({ id: "reconcile-1", created: true }),
    replayDeadLetter: jest.fn().mockResolvedValue(undefined),
  };
  const schedule = {
    hasDowntimeDrift: jest.fn().mockResolvedValue(false),
    syncDowntime: jest.fn().mockResolvedValue(undefined),
  };
  const reconciler = new ChangeDowntimeOutboxReconciler(
    prisma as never,
    outbox as unknown as TransactionalOutboxService,
    schedule as unknown as ChangeScheduleService,
  );
  return { transaction, prisma, outbox, schedule, reconciler };
}

describe("ChangeDowntimeOutboxReconciler", () => {
  it("dispatches durable change commands to the desired-state synchronizer", async () => {
    const { outbox, schedule, reconciler } = setup();
    const delivery: OutboxDelivery = {
      id: "outbox-1",
      topic: changeDowntimeSyncTopic,
      dedupeKey: "change:change-123:v2",
      payload: { changeId: "change-123", actorUserId: "user-1" },
      attempts: 1,
      maxAttempts: 10,
      ownerToken: "owner-1",
    };
    outbox.dispatchOne
      .mockImplementationOnce(
        async (_topic: string, handler: OutboxHandler) => {
          await handler(delivery);
          return "succeeded";
        },
      )
      .mockResolvedValueOnce("idle");

    await reconciler.drain(new Date(0));

    expect(outbox.dispatchOne).toHaveBeenCalledWith(
      changeDowntimeSyncTopic,
      expect.any(Function),
    );
    expect(schedule.syncDowntime).toHaveBeenCalledWith(
      "change-123",
      "user-1",
      "change:change-123:v2",
    );
  });

  it("enqueues drift reconciliation in a transaction and deduplicates pending work", async () => {
    const { transaction, prisma, outbox, schedule, reconciler } = setup();
    const now = new Date("2026-11-02T10:00:00.000Z");
    prisma.changeRequest.findMany.mockResolvedValueOnce([{ id: "change-123" }]);
    schedule.hasDowntimeDrift.mockResolvedValueOnce(true);
    prisma.outboxMessage.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await expect(reconciler.reconcileBatch(now)).resolves.toBe(1);
    expect(prisma.changeRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { downtimeWindows: { some: { endsAt: { gt: now } } } },
          ]),
        }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue).toHaveBeenCalledWith(transaction, {
      topic: changeDowntimeSyncTopic,
      dedupeKey: changeDowntimeReconciliationDedupeKey(
        "change-123",
        Math.floor(now.getTime() / (15 * 60_000)),
      ),
      payload: { changeId: "change-123", actorUserId: null },
      maxAttempts: changeDowntimeSyncMaxAttempts,
      availableAt: now,
    });

    const pendingSetup = setup();
    pendingSetup.prisma.changeRequest.findMany.mockResolvedValueOnce([
      { id: "change-123" },
    ]);
    pendingSetup.schedule.hasDowntimeDrift.mockResolvedValueOnce(true);
    pendingSetup.prisma.outboxMessage.findFirst.mockResolvedValueOnce({
      id: "pending-1",
    });
    await expect(pendingSetup.reconciler.reconcileBatch(now)).resolves.toBe(1);
    expect(pendingSetup.outbox.enqueue).not.toHaveBeenCalled();
  });

  it("records retryable outbox work when drift inspection fails", async () => {
    const { prisma, outbox, schedule, reconciler } = setup();
    const now = new Date("2026-11-02T10:00:00.000Z");
    prisma.changeRequest.findMany.mockResolvedValueOnce([{ id: "change-123" }]);
    schedule.hasDowntimeDrift.mockRejectedValueOnce(new Error("configuration unavailable"));

    await expect(reconciler.reconcileBatch(now)).resolves.toBe(0);

    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        topic: changeDowntimeSyncTopic,
        dedupeKey: changeDowntimeReconciliationDedupeKey(
          "change-123",
          Math.floor(now.getTime() / (15 * 60_000)),
        ),
        payload: { changeId: "change-123", actorUserId: null },
      }),
    );
  });

  it("replays a drifted dead-letter only after its cooldown", async () => {
    const { prisma, outbox, schedule, reconciler } = setup();
    const now = new Date("2026-11-02T10:00:00.000Z");
    prisma.changeRequest.findMany.mockResolvedValueOnce([{ id: "change-123" }]);
    schedule.hasDowntimeDrift.mockResolvedValueOnce(true);
    prisma.outboxMessage.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "dead-1",
        createdAt: new Date(now.getTime() - 20 * 60_000),
        lastReplayedAt: null,
      });

    await expect(reconciler.reconcileBatch(now)).resolves.toBe(1);
    expect(outbox.replayDeadLetter).toHaveBeenCalledWith("dead-1", {
      actor: "change-downtime-reconciler",
      reason: "Downtime drift detected by automatic reconciliation",
    });
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("reports dead-letter and aged pending work as degraded health", async () => {
    const { prisma, reconciler } = setup();
    const now = new Date("2026-11-02T10:00:00.000Z");
    prisma.outboxMessage.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    prisma.outboxMessage.findFirst.mockResolvedValueOnce({
      createdAt: new Date(now.getTime() - 6 * 60_000),
    });

    await expect(reconciler.health(now)).resolves.toEqual({
      status: "degraded",
      pending: 2,
      processing: 1,
      deadLetter: 1,
      oldestPendingAgeMs: 6 * 60_000,
    });
  });
});
