import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';

/**
 * W7.95 (`BA-reports-05`): the admin writes match on `version`, the token the editor loaded. This file proves the
 * predicate under a real PostgreSQL for the statement the service actually issues (`updateMany`/`deleteMany` with
 * `where: { id, version }`): two saves that start from the same version cannot both win — PostgreSQL holds the row
 * lock and re-evaluates the predicate against the committed row, so the loser matches nothing.
 *
 * It also pins the boundary of the token: a background run writing `lastRunAt`/`nextRunAt` must **not** bump the
 * version, otherwise every nightly run would turn an open editor into a spurious conflict.
 */
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('report schedule version (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  let organizationalUnitId = '';
  let userId = '';
  const suffix = `${process.pid}-${Date.now()}`;

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  function saveWithVersion(id: string, expectedVersion: number, name: string): Promise<number> {
    return database().reportSchedule
      .updateMany({ where: { id, version: expectedVersion }, data: { name, version: expectedVersion + 1 } })
      .then((result) => result.count);
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await database().organizationalUnit.create({
      data: {
        name: `IT schedule version ${suffix}`,
        type: 'SECTOR',
        distinguishedName: `OU=it-schedule-version-${suffix},DC=e2e,DC=test`,
        ouPath: `/it-schedule-version-${suffix}`,
      },
      select: { id: true },
    });
    organizationalUnitId = unit.id;
    const user = await database().user.create({
      data: {
        email: `it-schedule-version-${suffix}@example.test`,
        displayName: `IT schedule version ${suffix}`,
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

  function scheduleData(name: string) {
    return {
      name,
      frequency: 'WEEKLY' as const,
      sendTime: '07:00',
      organizationalUnitId,
      sections: ['kpi'],
      packKeys: [],
      nextRunAt: new Date('2026-05-04T05:00:00.000Z'),
      createdByUserId: userId,
    };
  }

  it('lets exactly one of two saves from the same version win', async () => {
    const created = await database().reportSchedule.create({
      data: scheduleData('cas race'),
      select: { id: true, version: true },
    });
    expect(created.version).toBe(1);

    const results = await Promise.all([
      saveWithVersion(created.id, 1, 'cas race a'),
      saveWithVersion(created.id, 1, 'cas race b'),
    ]);

    expect([...results].sort()).toEqual([0, 1]);
    const row = await database().reportSchedule.findUnique({
      where: { id: created.id },
      select: { version: true, name: true },
    });
    expect(row?.version).toBe(2);
    expect(['cas race a', 'cas race b']).toContain(row?.name);
  });

  it('deletes only the version the caller was shown', async () => {
    const created = await database().reportSchedule.create({
      data: scheduleData('cas delete'),
      select: { id: true },
    });
    await saveWithVersion(created.id, 1, 'cas delete renamed');

    await expect(
      database().reportSchedule.deleteMany({ where: { id: created.id, version: 1 } }),
    ).resolves.toMatchObject({ count: 0 });
    await expect(
      database().reportSchedule.findUnique({ where: { id: created.id }, select: { id: true } }),
    ).resolves.not.toBeNull();

    await expect(
      database().reportSchedule.deleteMany({ where: { id: created.id, version: 2 } }),
    ).resolves.toMatchObject({ count: 1 });
  });

  it('does not bump the version when the runner records a run', async () => {
    const created = await database().reportSchedule.create({
      data: scheduleData('cas runner'),
      select: { id: true },
    });

    await database().reportSchedule.update({
      where: { id: created.id },
      data: { lastRunAt: new Date('2026-05-04T05:00:00.000Z'), nextRunAt: new Date('2026-05-11T05:00:00.000Z') },
    });

    const row = await database().reportSchedule.findUnique({
      where: { id: created.id },
      select: { version: true, lastRunAt: true },
    });
    expect(row?.lastRunAt).not.toBeNull();
    // The editor that was open while the run happened can still save.
    expect(row?.version).toBe(1);
    await expect(saveWithVersion(created.id, 1, 'cas runner renamed')).resolves.toBe(1);
  });
});
