jest.mock("../../common/prisma/prisma.service", () => ({ PrismaService: class PrismaService {} }));
jest.mock("../service-catalog/record-service-catalog-change", () => ({
  recordServiceCatalogChange: jest.fn(async () => undefined),
  serviceDowntimeWindowChangeLogEntityType: jest.fn(
    () => "service_downtime_window",
  ),
}));

import { recordServiceCatalogChange } from "../service-catalog/record-service-catalog-change";
import { ChangeScheduleService } from "./change-schedule.service";

const start = new Date("2026-11-02T12:00:00.000Z");
const end = new Date("2026-11-02T13:00:00.000Z");

function activeChange(overrides: Record<string, unknown> = {}) {
  return {
    sequence: 12,
    title: "Planned network maintenance",
    status: "SCHEDULED",
    causesDowntime: true,
    plannedStart: start,
    plannedEnd: end,
    services: [{ serviceId: "service-1" }],
    downtimeWindows: [],
    ...overrides,
  };
}

function setup(change = activeChange(), foreign: unknown[] = []) {
  const transaction = {
    $executeRaw: jest.fn(async () => 0),
    $queryRaw: jest.fn(async () => [{ id: "change-1" }]),
    changeRequest: { findUnique: jest.fn(async () => change) },
    serviceDowntimeWindow: {
      findMany: jest.fn(async () => foreign),
      create: jest.fn(async () => ({ id: "downtime-new" })),
      update: jest.fn(async () => undefined),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    changeEvent: {
      create: jest.fn(async () => undefined),
      findFirst: jest.fn(async (): Promise<{ id: string } | null> => null),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (work: (tx: unknown) => unknown) =>
      work(transaction),
    ),
    changeRequest: { findUnique: jest.fn(async () => change) },
    serviceDowntimeWindow: { findMany: jest.fn(async () => foreign) },
  };
  const access = {
    configuration: jest.fn(async () => ({ numberPrefix: "CHG" })),
  };
  const availability = {
    load: jest.fn(async () => ({ downtime: { enabled: true } })),
  };
  const service = new ChangeScheduleService(
    prisma as never,
    access as never,
    availability as never,
  );
  return { transaction, prisma, access, availability, service };
}

describe("ChangeScheduleService downtime sync", () => {
  beforeEach(() => jest.clearAllMocks());

  it("detects missing owned downtime windows without mutating state", async () => {
    const { prisma, service } = setup();
    await expect(service.hasDowntimeDrift("change-1")).resolves.toBe(true);
    expect(prisma.changeRequest.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "change-1" },
        select: expect.objectContaining({
          downtimeWindows: expect.any(Object),
        }),
      }),
    );
    expect(prisma.serviceDowntimeWindow.findMany).toHaveBeenCalled();
  });

  it("writes the desired downtime and audit event under the change transaction lock", async () => {
    const { transaction, service } = setup();
    await service.syncDowntime("change-1", "actor-1");

    expect(transaction.$executeRaw).not.toHaveBeenCalled();
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.serviceDowntimeWindow.create).toHaveBeenCalledWith({
      data: {
        serviceId: "service-1",
        startsAt: start,
        endsAt: end,
        message: "CHG000012: Planned network maintenance",
        changeRequestId: "change-1",
      },
      select: { id: true },
    });
    expect(recordServiceCatalogChange).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        entityId: "downtime-new",
        actorUserId: "actor-1",
      }),
    );
    expect(transaction.changeEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "downtime" }),
      }),
    );
  });

  it("preserves the cancellation reason when releasing owned downtime asynchronously", async () => {
    const oldStart = new Date(Date.now() - 10 * 60_000);
    const oldEnd = new Date(Date.now() + 10 * 60_000);
    const { transaction, service } = setup(
      activeChange({
        status: "CANCELLED",
        downtimeWindows: [{ id: "downtime-old", serviceId: "service-1", startsAt: oldStart, endsAt: oldEnd }],
      }),
    );

    await service.syncDowntime("change-1", "actor-1");

    expect(transaction.serviceDowntimeWindow.update).toHaveBeenCalledWith({
      where: { id: "downtime-old" },
      data: { startsAt: oldStart, endsAt: expect.any(Date) },
    });
    expect(transaction.changeEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ detail: expect.objectContaining({ reason: "cancel" }) }) }),
    );
  });

  it("deduplicates skip-only audit events when the outbox redelivers a command", async () => {
    const { transaction, service } = setup(activeChange(), [
      { serviceId: "service-1", startsAt: start, endsAt: end },
    ]);
    transaction.changeEvent.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "event-1" });

    await service.syncDowntime("change-1", "actor-1", "change:change-1:v5");
    await service.syncDowntime("change-1", "actor-1", "change:change-1:v5");

    expect(transaction.changeEvent.findFirst).toHaveBeenCalledTimes(2);
    expect(transaction.changeEvent.create).toHaveBeenCalledTimes(1);
    expect(transaction.changeEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          detail: expect.objectContaining({ outboxDedupeKey: "change:change-1:v5" }),
        }),
      }),
    );
  });

  it("treats a blocking foreign downtime window as an acknowledged outcome, not reconciliation drift", async () => {
    const { service } = setup(activeChange(), [
      { serviceId: "service-1", startsAt: start, endsAt: end },
    ]);
    await expect(service.hasDowntimeDrift("change-1")).resolves.toBe(false);
  });
});
