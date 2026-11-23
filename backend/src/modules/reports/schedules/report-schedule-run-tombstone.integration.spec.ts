import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';

/**
 * W7.97 (`BA-reports-07`): deleting a schedule cascaded into `ReportScheduleRun`, so a schedule removed on day 2
 * erased its whole run log instead of leaving it to the 180-day retention. This file proves the new behaviour on a
 * real PostgreSQL: the foreign key is `ON DELETE SET NULL`, the run keeps the name and organizational unit it was
 * stamped with, and only the retention window removes the row.
 */
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('report schedule run tombstone (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  let organizationalUnitId = '';
  let userId = '';
  const suffix = `${process.pid}-${Date.now()}`;

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await database().organizationalUnit.create({
      data: {
        name: `IT run tombstone ${suffix}`,
        type: 'SECTOR',
        distinguishedName: `OU=it-run-tombstone-${suffix},DC=e2e,DC=test`,
        ouPath: `/it-run-tombstone-${suffix}`,
      },
      select: { id: true },
    });
    organizationalUnitId = unit.id;
    const user = await database().user.create({
      data: {
        email: `it-run-tombstone-${suffix}@example.test`,
        displayName: `IT run tombstone ${suffix}`,
      },
      select: { id: true },
    });
    userId = user.id;
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    if (organizationalUnitId !== '') {
      // Runs no longer disappear with their schedule, so clean them up by the snapshot the run carries.
      await db.reportScheduleRun.deleteMany({ where: { organizationalUnitId } });
      await db.reportSchedule.deleteMany({ where: { organizationalUnitId } });
      await db.organizationalUnit.deleteMany({ where: { id: organizationalUnitId } });
    }
    if (userId !== '') await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  async function createScheduleWithRun(name: string, createdAt: Date) {
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
      select: { id: true, name: true },
    });
    const run = await database().reportScheduleRun.create({
      data: {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        organizationalUnitId,
        trigger: 'SCHEDULED',
        slotKey: `${schedule.id}:2026-04-26T22:00:00.000Z`,
        periodStart: new Date('2026-04-26T22:00:00.000Z'),
        periodEnd: new Date('2026-05-03T22:00:00.000Z'),
        status: 'SENT',
        recipientCount: 1,
        sentCount: 1,
        finishedAt: new Date('2026-05-04T05:00:02.000Z'),
        createdAt,
      },
      select: { id: true },
    });
    return { scheduleId: schedule.id, runId: run.id };
  }

  it('keeps the run log when its schedule is deleted and detaches it from the row', async () => {
    const { scheduleId, runId } = await createScheduleWithRun('tombstone delete', new Date('2026-05-04T05:00:00.000Z'));

    await database().reportSchedule.delete({ where: { id: scheduleId } });

    const run = await database().reportScheduleRun.findUnique({
      where: { id: runId },
      select: { scheduleId: true, scheduleName: true, organizationalUnitId: true, status: true, sentCount: true },
    });
    // The history survives the delete, still says which schedule produced it, and is only detached.
    expect(run).toMatchObject({
      scheduleId: null,
      scheduleName: 'tombstone delete',
      organizationalUnitId,
      status: 'SENT',
      sentCount: 1,
    });
  });

  it('drops a detached run only when the retention window passes', async () => {
    const old = new Date(Date.now() - 181 * 86_400_000);
    const fresh = new Date(Date.now() - 10 * 86_400_000);
    const stale = await createScheduleWithRun('tombstone retention old', old);
    const kept = await createScheduleWithRun('tombstone retention fresh', fresh);
    await database().reportSchedule.deleteMany({
      where: { id: { in: [stale.scheduleId, kept.scheduleId] } },
    });

    // The runner's prune is exactly this statement (180 days), issued on the shared run log.
    await database().reportScheduleRun.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 180 * 86_400_000) } },
    });

    await expect(
      database().reportScheduleRun.findUnique({ where: { id: stale.runId }, select: { id: true } }),
    ).resolves.toBeNull();
    const survivor = await database().reportScheduleRun.findUnique({
      where: { id: kept.runId },
      select: { scheduleId: true, scheduleName: true },
    });
    expect(survivor).toMatchObject({ scheduleId: null, scheduleName: 'tombstone retention fresh' });
  });

  it('rejects a run without the schedule snapshot', async () => {
    const schedule = await database().reportSchedule.create({
      data: {
        name: 'tombstone required',
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

    // The snapshot is the part that makes a detached run readable, so the column is NOT NULL.
    await expect(
      database().reportScheduleRun.create({
        data: {
          scheduleId: schedule.id,
          organizationalUnitId,
          trigger: 'MANUAL',
          periodStart: new Date('2026-04-26T22:00:00.000Z'),
          periodEnd: new Date('2026-05-03T22:00:00.000Z'),
          status: 'RUNNING',
        } as never,
        select: { id: true },
      }),
    ).rejects.toThrow();
  });
});
