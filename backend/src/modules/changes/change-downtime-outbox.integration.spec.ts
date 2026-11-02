import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { TransactionalOutboxService } from "../../common/outbox/transactional-outbox.service";
import {
  changeDowntimeSyncTopic,
  enqueueChangeDowntimeSync,
  readChangeDowntimeSyncPayload,
} from "./change-downtime-outbox";

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase("change downtime outbox (integration)", () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  let outbox: TransactionalOutboxService;
  const topic = changeDowntimeSyncTopic;

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    outbox = new TransactionalOutboxService(database() as never);
  });

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error("integration Prisma client was not initialized");
    return prisma;
  }

  afterAll(async () => {
    if (prisma === undefined) return;
    await prisma.outboxMessage.deleteMany({ where: { topic } });
    await prisma.$disconnect();
  });

  it("commits the lifecycle intent atomically and deduplicates the same change version", async () => {
    const db = database();
    const input = {
      changeId: "change-downtime-it-1",
      version: 1,
      actorUserId: "integration-test",
    };
    const first = await db.$transaction((transaction) =>
      enqueueChangeDowntimeSync(outbox, transaction, input),
    );
    const duplicate = await db.$transaction((transaction) =>
      enqueueChangeDowntimeSync(outbox, transaction, input),
    );

    expect(first).toMatchObject({ created: true });
    expect(duplicate).toEqual({ id: first.id, created: false });
    expect(
      await db.outboxMessage.count({
        where: { topic, dedupeKey: `change:${input.changeId}:v1` },
      }),
    ).toBe(1);
  });

  it("rolls back lifecycle intent with its parent transaction", async () => {
    const db = database();
    await expect(
      db.$transaction(async (transaction) => {
        await enqueueChangeDowntimeSync(outbox, transaction, {
          changeId: "change-downtime-it-rollback",
          version: 1,
          actorUserId: null,
        });
        throw new Error("lifecycle transaction rollback");
      }),
    ).rejects.toThrow("lifecycle transaction rollback");
    expect(
      await db.outboxMessage.count({
        where: { topic, dedupeKey: "change:change-downtime-it-rollback:v1" },
      }),
    ).toBe(0);
  });

  it("dispatches the persisted payload through the same validated command contract", async () => {
    const db = database();
    await db.$transaction((transaction) =>
      enqueueChangeDowntimeSync(outbox, transaction, {
        changeId: "change-downtime-it-dispatch",
        version: 1,
        actorUserId: null,
      }),
    );
    let received: unknown;
    await expect(
      outbox.dispatchOne(topic, async (delivery) => {
        received = readChangeDowntimeSyncPayload(delivery.payload);
      }),
    ).resolves.toBe("succeeded");
    expect(received).toEqual({
      changeId: "change-downtime-it-dispatch",
      actorUserId: null,
    });
  });
});
