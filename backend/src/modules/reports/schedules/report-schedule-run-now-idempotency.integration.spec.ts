import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';

/**
 * W7.106 (`BA-reports-16`): „send now” had no command identity. This file proves the gate on a real PostgreSQL: the
 * run row's unique `commandKey` lets **one** command create **one** run, no matter how many jobs, tabs or retries
 * arrive — and two concurrent commands with the same key produce exactly one row, while two commands with different
 * keys produce two.
 *
 * The insert is the same shape the runner performs (`runManual`), so the proof is about the constraint, not a stub.
 */
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('report schedule „send now” idempotency (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  let organizationalUnitId = '';
  let scheduleId = '';
  let userId = '';
  const suffix = `${process.pid}-${Date.now()}`;

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  async function claim(commandKey: string): Promise<string> {
    const run = await database().reportScheduleRun.create({
      data: {
        scheduleId,
        scheduleName: `Manual ${suffix}`,
        organizationalUnitId,
        trigger: 'MANUAL',
        slotKey: null,
        commandKey,
        periodStart: new Date('2026-03-22T23:00:00.000Z'),
        periodEnd: new Date('2026-03-29T22:00:00.000Z'),
        status: 'RUNNING',
        triggeredByUserId: userId,
      },
      select: { id: true },
    });
    return run.id;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await database().organizationalUnit.create({
      data: {
        name: `IT run now ${suffix}`,
        type: 'SECTOR',
        distinguishedName: `OU=it-run-now-${suffix},DC=e2e,DC=test`,
        ouPath: `/it-run-now-${suffix}`,
      },
      select: { id: true },
    });
    organizationalUnitId = unit.id;
    const user = await database().user.create({
      data: { email: `it-run-now-${suffix}@example.test`, displayName: `IT run now ${suffix}` },
      select: { id: true },
    });
    userId = user.id;
    const schedule = await database().reportSchedule.create({
      data: {
        name: `Manual ${suffix}`,
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
    scheduleId = schedule.id;
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    if (organizationalUnitId !== '') {
      await db.reportScheduleRun.deleteMany({ where: { organizationalUnitId } });
      await db.reportSchedule.deleteMany({ where: { id: scheduleId === '' ? 'none' : scheduleId } });
      await db.organizationalUnit.deleteMany({ where: { id: organizationalUnitId } });
    }
    if (userId !== '') await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it('refuses a second run for the same command key', async () => {
    const first = await claim(`it-send-now-1-${suffix}`);

    await expect(claim(`it-send-now-1-${suffix}`)).rejects.toMatchObject({ code: 'P2002' });

    expect(
      await database().reportScheduleRun.count({ where: { commandKey: `it-send-now-1-${suffix}` } }),
    ).toBe(1);
    expect(
      await database().reportScheduleRun.findUnique({
        where: { commandKey: `it-send-now-1-${suffix}` },
        select: { id: true },
      }),
    ).toEqual({ id: first });
  });

  it('lets exactly one of many concurrent jobs for one command win', async () => {
    const commandKey = `it-send-now-race-${suffix}`;

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => claim(commandKey)),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .every((result) => (result.reason as { code?: string }).code === 'P2002'),
    ).toBe(true);
    expect(await database().reportScheduleRun.count({ where: { commandKey } })).toBe(1);
  });

  it('keeps two different commands apart (a deliberate second send still happens)', async () => {
    await claim(`it-send-now-a-${suffix}`);
    await claim(`it-send-now-b-${suffix}`);

    expect(
      await database().reportScheduleRun.count({
        where: { scheduleId, commandKey: { in: [`it-send-now-a-${suffix}`, `it-send-now-b-${suffix}`] } },
      }),
    ).toBe(2);
  });

  it('still allows any number of scheduled runs, because their command key is NULL', async () => {
    const insert = (slotKey: string) =>
      database().reportScheduleRun.create({
        data: {
          scheduleId,
          scheduleName: `Manual ${suffix}`,
          organizationalUnitId,
          trigger: 'SCHEDULED',
          slotKey,
          periodStart: new Date('2026-03-22T23:00:00.000Z'),
          periodEnd: new Date('2026-03-29T22:00:00.000Z'),
          status: 'RUNNING',
        },
        select: { id: true },
      });

    await insert(`sch:2026-03-29:${suffix}`);
    await insert(`sch:2026-04-05:${suffix}`);

    expect(
      await database().reportScheduleRun.count({ where: { scheduleId, commandKey: null } }),
    ).toBe(2);
  });
});
