import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { withReportScheduleLimit } from './report-schedule-limit';

/**
 * W7.94 (`BA-reports-04`): `maxSchedules` was checked with a `count()` and then written with a `create()` in a
 * separate transaction, so two saves that arrived together both saw room and the installation ended up one past
 * the limit. The unit spec pins the ordering; this file proves the substrate under a real PostgreSQL: the advisory
 * lock serialises the two writers, and the count *after* the lock sees the row the winner committed (READ
 * COMMITTED takes a fresh snapshot per statement).
 *
 * The test calls `withReportScheduleLimit` — the production critical section — instead of a copy of it, so the
 * proof cannot drift away from the service.
 */
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('report schedule limit (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  let organizationalUnitId = '';
  let userId = '';
  const suffix = `${process.pid}-${Date.now()}`;

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  function attempt(name: string, maxSchedules: number): Promise<{ id: string }> {
    return database().$transaction(
      (transaction) =>
        withReportScheduleLimit(transaction, { maxSchedules }, () =>
          transaction.reportSchedule.create({
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
          }),
        ),
      { timeout: 20_000 },
    );
  }

  function scheduleCount(): Promise<number> {
    return database().reportSchedule.count({ where: { organizationalUnitId } });
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await database().organizationalUnit.create({
      data: {
        name: `IT schedule limit ${suffix}`,
        type: 'SECTOR',
        distinguishedName: `OU=it-schedule-limit-${suffix},DC=e2e,DC=test`,
        ouPath: `/it-schedule-limit-${suffix}`,
      },
      select: { id: true },
    });
    organizationalUnitId = unit.id;
    const user = await database().user.create({
      data: {
        email: `it-schedule-limit-${suffix}@example.test`,
        displayName: `IT schedule limit ${suffix}`,
      },
      select: { id: true },
    });
    userId = user.id;
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    if (organizationalUnitId !== '') {
      await db.reportSchedule.deleteMany({ where: { organizationalUnitId } });
      await db.organizationalUnit.deleteMany({ where: { id: organizationalUnitId } });
    }
    if (userId !== '') await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it('lets exactly one of two concurrent saves take the last slot', async () => {
    const results = await Promise.allSettled([attempt('race a', 1), attempt('race b', 1)]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The loser is told the limit was reached; it never lands a second row.
    expect(rejected[0]?.reason).toMatchObject({ code: 'REPORT_SCHEDULE_LIMIT', details: { max: 1 } });
    await expect(scheduleCount()).resolves.toBe(1);
  });

  it('refuses the next save at the limit and frees the slot when a schedule is deleted', async () => {
    await expect(attempt('over limit', 1)).rejects.toMatchObject({ code: 'REPORT_SCHEDULE_LIMIT' });
    await expect(scheduleCount()).resolves.toBe(1);

    const [existing] = await database().reportSchedule.findMany({
      where: { organizationalUnitId },
      select: { id: true },
      take: 1,
    });
    await database().reportSchedule.delete({ where: { id: existing!.id } });

    // The limit is a count of rows, not a counter: deleting one frees the slot for the next save.
    await expect(attempt('after delete', 1)).resolves.toBeDefined();
    await expect(scheduleCount()).resolves.toBe(1);
  });
});
