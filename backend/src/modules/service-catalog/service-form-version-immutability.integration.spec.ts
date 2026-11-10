import { ConflictException } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import type { Prisma } from "../../generated/prisma/client";
import { ServiceFormsService } from "./service-forms.service";
import { defaultServiceFormsConfiguration } from "./service-forms.constants";

const databaseUrl = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;
const stamp = `${Date.now()}-${process.pid}`;
const updaterApplicationName = `ba01-form-update-${stamp}`.slice(0, 63);
const originalSchema = {
  schemaVersion: 1,
  fields: [
    {
      id: "summary_field",
      label: "Summary field",
      type: "text",
      required: true,
      order: 0,
    },
  ],
};
const changedSchema = {
  schemaVersion: 1,
  fields: [
    ...originalSchema.fields,
    {
      id: "serial_number",
      label: "Serial number",
      type: "text",
      required: true,
      order: 1,
    },
  ],
};

type FormFixture = {
  readonly serviceId: string;
  readonly formVersionId: string;
  readonly originUnitId: string;
  readonly requesterId: string;
};

type UpdateOutcome =
  | { readonly kind: "updated" }
  | { readonly kind: "rejected"; readonly error: unknown };

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

describeIfDatabase(
  "service form-version immutability (PostgreSQL integration, BA-01)",
  () => {
    jest.setTimeout(120_000);

    let prisma: PrismaClient | undefined;
    let updaterClient: PrismaClient | undefined;
    const categoryIds: string[] = [];
    const serviceIds: string[] = [];
    const formVersionIds: string[] = [];
    const originUnitIds: string[] = [];
    const requesterIds: string[] = [];
    const ticketIds: string[] = [];

    const requirePrisma = (): PrismaClient => {
      if (prisma === undefined)
        throw new Error("PostgreSQL test client nije inicijalizovan");
      return prisma;
    };

    const requireUpdater = (): PrismaClient => {
      if (updaterClient === undefined)
        throw new Error("Updater test client nije inicijalizovan");
      return updaterClient;
    };

    const createFormsService = (): ServiceFormsService =>
      new ServiceFormsService(
        requireUpdater() as never,
        { load: async () => defaultServiceFormsConfiguration } as never,
      );

    const createFixture = async (label: string): Promise<FormFixture> => {
      const db = requirePrisma();
      const suffix = `${stamp}-${label}`;
      const category = await db.serviceCategory.create({
        data: {
          name: `BA-01 category ${suffix}`,
          slug: `ba01-category-${suffix}`,
        },
        select: { id: true },
      });
      categoryIds.push(category.id);

      const service = await db.service.create({
        data: {
          name: `BA-01 service ${suffix}`,
          slug: `ba01-service-${suffix}`,
          categoryId: category.id,
          lifecycle: "ACTIVE",
        },
        select: { id: true },
      });
      serviceIds.push(service.id);

      const formVersion = await db.formVersion.create({
        data: {
          serviceId: service.id,
          version: 1,
          schema: originalSchema,
          status: "DRAFT",
        },
        select: { id: true },
      });
      formVersionIds.push(formVersion.id);

      const originUnit = await db.organizationalUnit.create({
        data: {
          name: `BA-01 unit ${suffix}`,
          type: "DIRECTORATE",
          distinguishedName: `OU=BA01-${suffix}`,
          ouPath: `/ba01-${suffix}`,
        },
        select: { id: true },
      });
      originUnitIds.push(originUnit.id);

      const requester = await db.user.create({
        data: {
          email: `ba01-${suffix}@example.test`,
          displayName: `BA-01 requester ${label}`,
        },
        select: { id: true },
      });
      requesterIds.push(requester.id);

      return {
        serviceId: service.id,
        formVersionId: formVersion.id,
        originUnitId: originUnit.id,
        requesterId: requester.id,
      };
    };

    const holdTransaction = async (
      operation: (transaction: Prisma.TransactionClient) => Promise<void>,
    ): Promise<{ release: () => void; result: Promise<void> }> => {
      const ready = deferred();
      const release = deferred();
      const result = requirePrisma().$transaction(
        async (transaction) => {
          await operation(transaction);
          ready.resolve();
          await release.promise;
        },
        { timeout: 30_000 },
      );
      const readiness = await Promise.race([
        ready.promise.then(() => ({ kind: "ready" as const })),
        result.then(
          () => ({ kind: "finished" as const }),
          (error: unknown) => ({ kind: "failed" as const, error }),
        ),
      ]);
      if (readiness.kind !== "ready") {
        release.resolve();
        if (readiness.kind === "failed") throw readiness.error;
        throw new Error(
          "Lock-holding PostgreSQL transaction ended before the test barrier",
        );
      }
      return { release: release.resolve, result };
    };

    const waitForUpdaterLockWait = async (): Promise<void> => {
      const db = requirePrisma();
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const waiters = await db.$queryRaw<{ pid: number }[]>`
        SELECT "pid"
        FROM pg_stat_activity
        WHERE "application_name" = ${updaterApplicationName}
          AND "datname" = current_database()
          AND cardinality(pg_blocking_pids("pid")) > 0
        LIMIT 1
      `;
        if (waiters.length > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("BA-01 updater nije čekao na PostgreSQL row lock");
    };

    const updateWhileTransactionIsHeld = async (
      fixture: FormFixture,
      operation: (transaction: Prisma.TransactionClient) => Promise<void>,
    ): Promise<UpdateOutcome> => {
      const held = await holdTransaction(operation);
      const update = createFormsService()
        .updateFormVersion(fixture.serviceId, fixture.formVersionId, {
          schema: changedSchema,
        })
        .then(
          (): UpdateOutcome => ({ kind: "updated" }),
          (error: unknown): UpdateOutcome => ({ kind: "rejected", error }),
        );

      let lockWaitError: unknown;
      try {
        await waitForUpdaterLockWait();
      } catch (error) {
        lockWaitError = error;
      } finally {
        held.release();
      }

      await held.result;
      const outcome = await update;
      if (lockWaitError !== undefined) throw lockWaitError;
      return outcome;
    };

    beforeAll(() => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! }),
      });
      const updaterUrl = new URL(databaseUrl!);
      updaterUrl.searchParams.set("application_name", updaterApplicationName);
      updaterClient = new PrismaClient({
        adapter: new PrismaPg({ connectionString: updaterUrl.toString() }),
      });
    });

    afterAll(async () => {
      const db = prisma;
      try {
        if (db !== undefined) {
          if (ticketIds.length > 0) {
            await db.ticket.deleteMany({ where: { id: { in: ticketIds } } });
          }
          if (formVersionIds.length > 0) {
            await db.changeLog.deleteMany({
              where: { entityId: { in: formVersionIds } },
            });
            await db.formVersion.deleteMany({
              where: { id: { in: formVersionIds } },
            });
          }
          if (serviceIds.length > 0) {
            await db.service.deleteMany({ where: { id: { in: serviceIds } } });
          }
          if (categoryIds.length > 0) {
            await db.serviceCategory.deleteMany({
              where: { id: { in: categoryIds } },
            });
          }
          if (requesterIds.length > 0) {
            await db.user.deleteMany({ where: { id: { in: requesterIds } } });
          }
          if (originUnitIds.length > 0) {
            await db.organizationalUnit.deleteMany({
              where: { id: { in: originUnitIds } },
            });
          }
        }
      } finally {
        await Promise.all([db?.$disconnect(), updaterClient?.$disconnect()]);
      }
    });

    it("serializes a ticket FK bind before the in-transaction immutable check", async () => {
      const db = requirePrisma();
      const fixture = await createFixture("ticket-bind");
      const suffix = `${stamp}-ticket-bind`;
      const outcome = await updateWhileTransactionIsHeld(
        fixture,
        async (transaction) => {
          // Normal ticket creation validates ACTIVE before INSERT; this direct
          // row write isolates the FK lock that serializes its eventual bind.
          const ticket = await transaction.ticket.create({
            data: {
              ticketNumber: `BA01-${suffix}`,
              title: "Existing form data",
              description:
                "Ticket binds the draft form during the test transaction.",
              status: "PENDING",
              priority: "LOW",
              impact: "LOW",
              urgency: "LOW",
              formData: { summary_field: "recorded before the edit" },
              originUnitId: fixture.originUnitId,
              serviceId: fixture.serviceId,
              formVersionId: fixture.formVersionId,
              requesterId: fixture.requesterId,
            },
          } as never);
          ticketIds.push(ticket.id);
        },
      );

      expect(outcome.kind).toBe("rejected");
      if (outcome.kind !== "rejected") {
        throw new Error("Forma je izmijenjena nakon što ju je ticket vezao");
      }
      if (!(outcome.error instanceof ConflictException)) {
        throw new Error(
          "Expected the immutability conflict to map to HTTP 409",
        );
      }
      expect(outcome.error.getResponse()).toMatchObject({
        code: "FORM_VERSION_IMMUTABLE",
      });
      await expect(
        db.formVersion.findUnique({ where: { id: fixture.formVersionId } }),
      ).resolves.toMatchObject({ status: "DRAFT", schema: originalSchema });
      expect(
        await db.ticket.count({
          where: { formVersionId: fixture.formVersionId },
        }),
      ).toBe(1);
    });

    it("rechecks form status after waiting for a concurrent activation", async () => {
      const db = requirePrisma();
      const fixture = await createFixture("activation");
      const outcome = await updateWhileTransactionIsHeld(
        fixture,
        async (transaction) => {
          await transaction.formVersion.update({
            where: { id: fixture.formVersionId },
            data: { status: "ACTIVE" },
          });
        },
      );

      expect(outcome.kind).toBe("rejected");
      if (outcome.kind !== "rejected") {
        throw new Error("Forma aktivirana paralelno ipak je izmijenjena");
      }
      if (!(outcome.error instanceof ConflictException)) {
        throw new Error(
          "Expected the immutability conflict to map to HTTP 409",
        );
      }
      expect(outcome.error.getResponse()).toMatchObject({
        code: "FORM_VERSION_IMMUTABLE",
      });
      await expect(
        db.formVersion.findUnique({ where: { id: fixture.formVersionId } }),
      ).resolves.toMatchObject({ status: "ACTIVE", schema: originalSchema });
      expect(
        await db.ticket.count({
          where: { formVersionId: fixture.formVersionId },
        }),
      ).toBe(0);
    });
  },
);
