import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { assertFallbackRemovalAllowed } from './assert-fallback-removal-allowed';
import { clearFallbackForOrganizationalUnit } from './clear-fallback-for-organizational-unit';
import { withGroupFallbackLock } from './with-group-fallback-lock';
import type { PrismaService } from '../../common/prisma/prisma.service';

/**
 * W2.13 (`BA-groups-03`): "at most one fallback group per unit" has to be a
 * database fact, and "a unit never loses its fallback silently" has to survive
 * two writers racing. The unit spec proves the service contract against a fake
 * table; this file proves the substrate under a real PostgreSQL, where the
 * transactions actually interleave.
 *
 * It exercises the pieces directly (lock + release + guard + index) instead of
 * `updateGroup`, so the proof does not depend on audit tables or on the request
 * layer - what is under test is exactly what the service relies on.
 */
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('group fallback cardinality (integration)', () => {
  jest.setTimeout(180_000);
  let prisma: PrismaClient | undefined;
  let organizationalUnitId = '';
  let otherUnitId = '';
  const groupIds: string[] = [];
  const suffix = `${process.pid}-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const [unit, otherUnit] = await Promise.all([
      database().organizationalUnit.create({
        data: {
          name: `IT fallback ${suffix}`,
          type: 'SECTOR',
          distinguishedName: `OU=it-fallback-${suffix},DC=e2e,DC=test`,
          ouPath: `/it-fallback-${suffix}`,
        },
      }),
      database().organizationalUnit.create({
        data: {
          name: `IT fallback other ${suffix}`,
          type: 'SECTOR',
          distinguishedName: `OU=it-fallback-other-${suffix},DC=e2e,DC=test`,
          ouPath: `/it-fallback-other-${suffix}`,
        },
      }),
    ]);
    organizationalUnitId = unit.id;
    otherUnitId = otherUnit.id;
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    if (groupIds.length > 0) await db.group.deleteMany({ where: { id: { in: groupIds } } });
    for (const id of [organizationalUnitId, otherUnitId]) {
      if (id !== '') await db.organizationalUnit.delete({ where: { id } });
    }
    await db.$disconnect();
  });

  beforeEach(async () => {
    if (groupIds.length > 0) {
      await database().group.deleteMany({ where: { id: { in: groupIds } } });
      groupIds.length = 0;
    }
  });

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  async function createGroup(
    index: number,
    input: { readonly isFallback?: boolean; readonly organizationalUnitId?: string } = {},
  ): Promise<string> {
    const created = await database().group.create({
      data: {
        name: `IT fallback ${suffix} ${index}`,
        key: `it-fallback-${suffix}-${index}`,
        organizationalUnitId: input.organizationalUnitId ?? organizationalUnitId,
        isFallback: input.isFallback ?? false,
      },
      select: { id: true },
    });
    groupIds.push(created.id);
    return created.id;
  }

  /** The production replace path: lock the unit, release the others, claim it. */
  async function replaceFallback(groupId: string, unitId = organizationalUnitId): Promise<void> {
    await database().$transaction(async (transaction) => {
      const client = transaction as unknown as PrismaService;
      await withGroupFallbackLock(client, unitId, async () => {
        await clearFallbackForOrganizationalUnit(client, unitId, groupId);
        await client.group.update({ where: { id: groupId }, data: { isFallback: true } });
      });
    });
  }

  it('ships the partial unique index the app assumes', async () => {
    const rows = await database().$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'Group'
        AND indexname = 'Group_fallback_per_organizational_unit_key'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toContain('UNIQUE');
    expect(rows[0]?.indexdef).toContain('isFallback');
  });

  it('refuses a second fallback group for one unit at the database level', async () => {
    await createGroup(0, { isFallback: true });
    await expect(createGroup(1, { isFallback: true })).rejects.toMatchObject({ code: 'P2002' });
    expect(
      await database().group.count({ where: { organizationalUnitId, isFallback: true } }),
    ).toBe(1);
  });

  it('leaves exactly one fallback after 20 concurrent replacements', async () => {
    await createGroup(0, { isFallback: true });
    const contenders = await Promise.all(
      Array.from({ length: 19 }, (_, index) => createGroup(index + 1)),
    );

    const results = await Promise.allSettled([
      ...contenders.map((groupId) => replaceFallback(groupId)),
    ]);

    expect(results.filter((result) => result.status === 'rejected')).toEqual([]);
    expect(
      await database().group.count({ where: { organizationalUnitId, isFallback: true } }),
    ).toBe(1);
  });

  it('keeps units independent while 10 replacements run per unit', async () => {
    await createGroup(100, { isFallback: true });
    await createGroup(200, { isFallback: true, organizationalUnitId: otherUnitId });
    const primary = await Promise.all(Array.from({ length: 9 }, (_, i) => createGroup(101 + i)));
    const secondary = await Promise.all(
      Array.from({ length: 9 }, (_, i) => createGroup(201 + i, { organizationalUnitId: otherUnitId })),
    );

    await Promise.all([
      ...primary.map((groupId) => replaceFallback(groupId)),
      ...secondary.map((groupId) => replaceFallback(groupId, otherUnitId)),
    ]);

    expect(
      await database().group.count({ where: { organizationalUnitId, isFallback: true } }),
    ).toBe(1);
    expect(
      await database().group.count({
        where: { organizationalUnitId: otherUnitId, isFallback: true },
      }),
    ).toBe(1);
  });

  it('refuses to clear the last fallback inside the locked transaction', async () => {
    const fallbackId = await createGroup(0, { isFallback: true });
    await expect(
      database().$transaction(async (transaction) => {
        const client = transaction as unknown as PrismaService;
        await withGroupFallbackLock(client, organizationalUnitId, async () => {
          await assertFallbackRemovalAllowed(client, {
            groupId: fallbackId,
            organizationalUnitId,
          });
          await client.group.update({ where: { id: fallbackId }, data: { isFallback: false } });
        });
      }),
    ).rejects.toMatchObject({ code: 'LAST_FALLBACK_GROUP' });

    expect(
      await database().group.count({ where: { organizationalUnitId, isFallback: true } }),
    ).toBe(1);
  });

  it('never ends with zero fallbacks when a delete races a replacement', async () => {
    const fallbackId = await createGroup(0, { isFallback: true });
    const successorId = await createGroup(1);

    const results = await Promise.allSettled([
      // Deleting the current fallback must be refused (W2.12 inventory).
      database().$transaction(async (transaction) => {
        const client = transaction as unknown as PrismaService;
        await withGroupFallbackLock(client, organizationalUnitId, async () => {
          const remaining = await client.group.count({
            where: { organizationalUnitId, isFallback: true, id: { not: fallbackId } },
          });
          if (remaining === 0) {
            throw Object.assign(new Error('LAST_FALLBACK_GROUP'), { code: 'LAST_FALLBACK_GROUP' });
          }
          await client.group.delete({ where: { id: fallbackId } });
        });
      }),
      replaceFallback(successorId),
    ]);

    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(
      await database().group.count({ where: { organizationalUnitId, isFallback: true } }),
    ).toBe(1);
  });
});
