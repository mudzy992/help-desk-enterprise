import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import type { Prisma } from '../../../generated/prisma/client';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import type { RecordAuditEntryInput } from '../../audit-log/audit-log.types';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';

/**
 * W7.96 (`BA-reports-06`): a schedule mutation and its global audit row used to be two writes. This file proves
 * the fix on a real PostgreSQL — the audit append shares the mutation's transaction, so an audit failure discards
 * the mutation instead of leaving a change (or a deletion) that nobody can account for.
 *
 * The failing audit is injected the only honest way: a client that keeps the transaction's `$executeRaw` (the chain
 * lock) but whose `auditLog.create` throws. That is exactly the production failure mode of a broken audit insert.
 */
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('report schedule audit atomicity (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  let organizationalUnitId = '';
  let userId = '';
  const suffix = `${process.pid}-${Date.now()}`;

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  function brokenAuditClient(transaction: {
    readonly $executeRaw: unknown;
    readonly auditLog: { readonly findFirst: unknown };
  }) {
    return {
      $executeRaw: (transaction.$executeRaw as (...args: unknown[]) => Promise<unknown>).bind(transaction),
      auditLog: {
        findFirst: (transaction.auditLog.findFirst as (...args: unknown[]) => Promise<unknown>).bind(
          transaction.auditLog,
        ),
        create: async (): Promise<never> => {
          throw new Error('audit down');
        },
      },
    } as never;
  }

  function sentAudit(scheduleId: string, runId: string): RecordAuditEntryInput {
    return {
      action: auditLogActions.reportScheduleSent,
      entityType: auditLogEntityTypes.reportSchedule,
      entityId: scheduleId,
      metadata: {
        runId,
        trigger: 'SCHEDULED',
        status: 'SENT',
        periodStart: '2026-04-26T22:00:00.000Z',
        periodEnd: '2026-05-03T22:00:00.000Z',
        recipientCount: 1,
        sentCount: 1,
        skippedCount: 0,
        errorCode: null,
      },
      actorUserId: null,
      organizationalUnitId,
    };
  }

  function deletedAudit(scheduleId: string): RecordAuditEntryInput {
    return {
      action: auditLogActions.reportScheduleDeleted,
      entityType: auditLogEntityTypes.reportSchedule,
      entityId: scheduleId,
      metadata: { name: 'audit atomicity', frequency: 'WEEKLY', recipientCount: 0 },
      actorUserId: null,
      organizationalUnitId,
    };
  }

  async function auditRowsFor(entityId: string): Promise<number> {
    return database().auditLog.count({ where: { entityId } });
  }

  async function createSchedule(name: string): Promise<{ id: string; runId: string }> {
    const schedule = await database().reportSchedule.create({
      data: {
        name,
        frequency: 'WEEKLY',
        sendTime: '07:00',
        organizationalUnitId,
        sections: ['kpi'],
        packKeys: [],
        nextRunAt: new Date('2026-05-04T05:00:00.000Z'),
        createdByUserId: userId,
      },
      select: { id: true },
    });
    const run = await database().reportScheduleRun.create({
      data: {
        scheduleId: schedule.id,
        // W7.97: every run carries its own snapshot of the schedule it came from.
        scheduleName: name,
        organizationalUnitId,
        trigger: 'SCHEDULED',
        slotKey: `${schedule.id}:${name}`,
        periodStart: new Date('2026-04-26T22:00:00.000Z'),
        periodEnd: new Date('2026-05-03T22:00:00.000Z'),
        status: 'RUNNING',
      },
      select: { id: true },
    });
    return { id: schedule.id, runId: run.id };
  }

  function finalize(transaction: Prisma.TransactionClient, runId: string): Promise<unknown> {
    return transaction.reportScheduleRun.update({
      where: { id: runId },
      data: { status: 'SENT', sentCount: 1, recipientCount: 1, finishedAt: new Date(), durationMs: 12 },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await database().organizationalUnit.create({
      data: {
        name: `IT audit atomicity ${suffix}`,
        type: 'SECTOR',
        distinguishedName: `OU=it-audit-atomicity-${suffix},DC=e2e,DC=test`,
        ouPath: `/it-audit-atomicity-${suffix}`,
      },
      select: { id: true },
    });
    organizationalUnitId = unit.id;
    const user = await database().user.create({
      data: {
        email: `it-audit-atomicity-${suffix}@example.test`,
        displayName: `IT audit atomicity ${suffix}`,
      },
      select: { id: true },
    });
    userId = user.id;
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    if (organizationalUnitId !== '') {
      const schedules = await db.reportSchedule.findMany({
        where: { organizationalUnitId },
        select: { id: true },
      });
      const ids = schedules.map((schedule) => schedule.id);
      if (ids.length > 0) {
        await db.auditLog.deleteMany({ where: { entityId: { in: ids } } });
        await db.reportSchedule.deleteMany({ where: { id: { in: ids } } });
      }
      await db.organizationalUnit.deleteMany({ where: { id: organizationalUnitId } });
    }
    if (userId !== '') await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it('rolls the run finalization back when the audit row cannot be written', async () => {
    const { id, runId } = await createSchedule('audit rollback');

    await expect(
      database().$transaction(async (transaction) => {
        await finalize(transaction, runId);
        await recordAuditEntry(brokenAuditClient(transaction), sentAudit(id, runId));
      }),
    ).rejects.toThrow('audit down');

    const run = await database().reportScheduleRun.findUnique({
      where: { id: runId },
      select: { status: true, finishedAt: true },
    });
    // Neither half survived: the run is still the RUNNING claim the sweep can take over.
    expect(run?.status).toBe('RUNNING');
    expect(run?.finishedAt).toBeNull();
    await expect(auditRowsFor(id)).resolves.toBe(0);
  });

  it('commits the run finalization and the audit row together', async () => {
    const { id, runId } = await createSchedule('audit commit');

    await database().$transaction(async (transaction) => {
      await finalize(transaction, runId);
      await recordAuditEntry(transaction, sentAudit(id, runId));
    });

    const run = await database().reportScheduleRun.findUnique({
      where: { id: runId },
      select: { status: true, sentCount: true },
    });
    expect(run).toMatchObject({ status: 'SENT', sentCount: 1 });
    await expect(auditRowsFor(id)).resolves.toBe(1);
    const [entry] = await database().auditLog.findMany({
      where: { entityId: id },
      select: { action: true, entityType: true },
    });
    expect(entry).toMatchObject({
      action: auditLogActions.reportScheduleSent,
      entityType: auditLogEntityTypes.reportSchedule,
    });
  });

  it('keeps a deleted schedule alive when its audit row cannot be written', async () => {
    const { id } = await createSchedule('audit delete');

    await expect(
      database().$transaction(async (transaction) => {
        await transaction.reportSchedule.deleteMany({ where: { id } });
        await recordAuditEntry(brokenAuditClient(transaction), deletedAudit(id));
      }),
    ).rejects.toThrow('audit down');

    await expect(
      database().reportSchedule.findUnique({ where: { id }, select: { id: true } }),
    ).resolves.not.toBeNull();
    await expect(auditRowsFor(id)).resolves.toBe(0);
  });
});
