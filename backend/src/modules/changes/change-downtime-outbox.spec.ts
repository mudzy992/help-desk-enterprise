import type { Prisma } from "../../generated/prisma/client";
import { TransactionalOutboxService } from "../../common/outbox/transactional-outbox.service";
import {
  changeDowntimeReconciliationDedupeKey,
  changeDowntimeSyncMaxAttempts,
  changeDowntimeSyncTopic,
  changeDowntimeVersionDedupeKey,
  enqueueChangeDowntimeSync,
  readChangeDowntimeSyncPayload,
} from "./change-downtime-outbox";

describe("change downtime outbox command", () => {
  it("creates versioned durable intent with the outbox retry budget", async () => {
    const outbox = {
      enqueue: jest.fn(async () => ({ id: "outbox-1", created: true })),
    };
    const transaction = {} as Prisma.TransactionClient;

    await expect(
      enqueueChangeDowntimeSync(
        outbox as unknown as TransactionalOutboxService,
        transaction,
        {
          changeId: "change-123",
          version: 7,
          actorUserId: "user-1",
        },
      ),
    ).resolves.toEqual({ id: "outbox-1", created: true });

    expect(outbox.enqueue).toHaveBeenCalledWith(transaction, {
      topic: changeDowntimeSyncTopic,
      dedupeKey: changeDowntimeVersionDedupeKey("change-123", 7),
      payload: { changeId: "change-123", actorUserId: "user-1" },
      maxAttempts: changeDowntimeSyncMaxAttempts,
    });
  });

  it("uses a separate time bucket for reconciliation commands", () => {
    expect(changeDowntimeReconciliationDedupeKey("change-123", 42)).toBe(
      "reconcile:change-123:42",
    );
    expect(changeDowntimeVersionDedupeKey("change-123", 7)).not.toBe(
      changeDowntimeReconciliationDedupeKey("change-123", 42),
    );
  });

  it("rejects invalid versions and malformed delivery payloads", async () => {
    const enqueue = jest.fn();
    const outbox = { enqueue } as unknown as TransactionalOutboxService;
    await expect(
      enqueueChangeDowntimeSync(outbox, {} as Prisma.TransactionClient, {
        changeId: "c1",
        version: 0,
        actorUserId: null,
      }),
    ).rejects.toThrow("INVALID_CHANGE_DOWNTIME_VERSION");
    expect(enqueue).not.toHaveBeenCalled();
    expect(
      readChangeDowntimeSyncPayload({
        changeId: "change-123",
        actorUserId: null,
      }),
    ).toEqual({
      changeId: "change-123",
      actorUserId: null,
    });
    expect(() =>
      readChangeDowntimeSyncPayload({ changeId: "", actorUserId: null }),
    ).toThrow("INVALID_CHANGE_DOWNTIME_PAYLOAD");
    expect(() =>
      readChangeDowntimeSyncPayload({ changeId: "change-123" }),
    ).toThrow("INVALID_CHANGE_DOWNTIME_PAYLOAD");
  });
});
