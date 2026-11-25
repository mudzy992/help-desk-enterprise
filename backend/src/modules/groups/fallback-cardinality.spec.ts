jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('./record-group-change', () => ({ recordGroupChange: jest.fn().mockResolvedValue(undefined) }));

import { recordGroupChange } from './record-group-change';
import { createGroup } from './create-group';
import { updateGroup } from './update-group';
import { GroupsError } from './groups.error';
import { fallbackLockKey } from './with-group-fallback-lock';

type GroupRow = {
  id: string;
  name: string;
  key: string;
  organizationalUnitId: string;
  isFallback: boolean;
  isProblemGroup: boolean;
  isCabGroup: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type Where = Record<string, unknown>;

/**
 * W2.13 fixture: an in-memory `Group` table that behaves like the production
 * schema, including the two facts the package relies on:
 *
 *  - the partial unique index `Group_fallback_per_organizational_unit_key`
 *    (a second fallback group in one unit is a `P2002`),
 *  - `pg_advisory_xact_lock` serialisation per organizational unit (a lock is
 *    held until the transaction that took it finishes).
 *
 * A test that breaks locking therefore fails loudly on the index instead of
 * quietly observing two fallbacks, which is exactly what happened in production
 * before the constraint existed.
 */
function createFallbackPrisma(seed: readonly Partial<GroupRow>[] = []) {
  const rows = new Map<string, GroupRow>();
  let sequence = 0;
  for (const input of seed) {
    sequence += 1;
    const row: GroupRow = {
      id: input.id ?? `group-${sequence}`,
      name: input.name ?? `Group ${sequence}`,
      key: input.key ?? `group-${sequence}`,
      organizationalUnitId: input.organizationalUnitId ?? 'ou-1',
      isFallback: input.isFallback ?? false,
      isProblemGroup: false,
      isCabGroup: false,
      createdAt: new Date(Date.UTC(2026, 0, sequence)),
      updatedAt: new Date(Date.UTC(2026, 0, sequence)),
    };
    rows.set(row.id, row);
  }

  const lockChains = new Map<string, Promise<void>>();
  const executeRawCalls: string[] = [];

  const matches = (row: GroupRow, where: Where = {}): boolean => {
    if (where.id !== undefined) {
      const expected = where.id as { not?: string } | string;
      if (typeof expected === 'string' && row.id !== expected) return false;
      if (typeof expected === 'object' && expected.not !== undefined && row.id === expected.not) {
        return false;
      }
    }
    if (where.organizationalUnitId !== undefined && row.organizationalUnitId !== where.organizationalUnitId) {
      return false;
    }
    if (where.isFallback !== undefined && row.isFallback !== where.isFallback) return false;
    if (where.key !== undefined && row.key !== where.key) return false;
    return true;
  };

  const assertSingleFallback = (candidate: GroupRow): void => {
    if (!candidate.isFallback) return;
    const conflicting = [...rows.values()].filter(
      (row) =>
        row.id !== candidate.id &&
        row.organizationalUnitId === candidate.organizationalUnitId &&
        row.isFallback,
    );
    if (conflicting.length > 0) {
      const error = new Error('Unique constraint failed') as Error & {
        code: string;
        meta: { target: string };
      };
      error.code = 'P2002';
      error.meta = { target: 'Group_fallback_per_organizational_unit_key' };
      throw error;
    }
  };

  const withSelect = (row: GroupRow) => ({
    ...row,
    organizationalUnit: { ouPath: `/OU-${row.organizationalUnitId}` },
    members: [],
    _count: { members: 0 },
  });

  const organizationalUnit = {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      ouPath: `/OU-${where.id}`,
    })),
  };

  const group = {
    findUnique: jest.fn(async ({ where }: { where: { id?: string; key?: string } }) => {
      const found = [...rows.values()].find((row) =>
        where.id !== undefined ? row.id === where.id : row.key === where.key,
      );
      if (found === undefined) return null;
      return where.key !== undefined && where.id === undefined ? found : withSelect(found);
    }),
    findMany: jest.fn(async ({ where }: { where?: Where } = {}) =>
      [...rows.values()].filter((row) => matches(row, where)).map((row) => ({ ...row })),
    ),
    count: jest.fn(async ({ where }: { where?: Where } = {}) =>
      [...rows.values()].filter((row) => matches(row, where)).length,
    ),
    create: jest.fn(async ({ data }: { data: Partial<GroupRow> }) => {
      sequence += 1;
      const row: GroupRow = {
        id: `group-${sequence}`,
        name: data.name ?? `Group ${sequence}`,
        key: data.key ?? `group-${sequence}`,
        organizationalUnitId: data.organizationalUnitId ?? 'ou-1',
        isFallback: data.isFallback ?? false,
        isProblemGroup: data.isProblemGroup ?? false,
        isCabGroup: data.isCabGroup ?? false,
        createdAt: new Date(Date.UTC(2026, 0, sequence)),
        updatedAt: new Date(Date.UTC(2026, 0, sequence)),
      };
      assertSingleFallback(row);
      rows.set(row.id, row);
      return withSelect(row);
    }),
    update: jest.fn(
      async ({ where, data }: { where: { id: string }; data: Partial<GroupRow> }) => {
        const existing = rows.get(where.id);
        if (existing === undefined) throw new Error('record not found');
        const updated: GroupRow = { ...existing, ...data };
        assertSingleFallback(updated);
        rows.set(updated.id, updated);
        return withSelect(updated);
      },
    ),
    updateMany: jest.fn(async ({ where, data }: { where?: Where; data: Partial<GroupRow> }) => {
      let count = 0;
      for (const row of [...rows.values()]) {
        if (!matches(row, where)) continue;
        rows.set(row.id, { ...row, ...data });
        count += 1;
      }
      return { count };
    }),
  };

  const acquire = async (key: string): Promise<() => void> => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = lockChains.get(key) ?? Promise.resolve();
    lockChains.set(
      key,
      previous.then(() => held),
    );
    await previous;
    return release;
  };

  const transaction = async <T>(callback: (client: unknown) => Promise<T>): Promise<T> => {
    const releases: Array<() => void> = [];
    const client = {
      group,
      organizationalUnit,
      $executeRaw: jest.fn(async (_query: TemplateStringsArray, ...values: unknown[]) => {
        const key = String(values[0]);
        executeRawCalls.push(key);
        releases.push(await acquire(key));
        return 0;
      }),
    };
    try {
      return await callback(client);
    } finally {
      for (const release of releases) release();
    }
  };

  const prisma = {
    group,
    organizationalUnit,
    $transaction: jest.fn(transaction),
    $executeRaw: jest.fn(async (_query: TemplateStringsArray, ...values: unknown[]) => {
      executeRawCalls.push(String(values[0]));
      return 0;
    }),
  };

  return {
    prisma,
    rows,
    executeRawCalls,
    fallbackGroups: (organizationalUnitId: string) =>
      [...rows.values()].filter(
        (row) => row.organizationalUnitId === organizationalUnitId && row.isFallback,
      ),
  };
}

const auditContext = { actorUserId: 'admin-1', requestId: 'req-1' };

describe('fallback cardinality (W2.13 / BA-groups-03)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refuses to clear the only fallback group of a unit', async () => {
    const fixture = createFallbackPrisma([
      { id: 'group-a', organizationalUnitId: 'ou-1', isFallback: true },
    ]);
    const error = await updateGroup(
      fixture.prisma as never,
      'group-a',
      { isFallback: false },
      auditContext,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GroupsError);
    expect((error as GroupsError).code).toBe('LAST_FALLBACK_GROUP');
    expect((error as GroupsError).details).toEqual({ organizationalUnitId: 'ou-1' });
    expect(fixture.rows.get('group-a')?.isFallback).toBe(true);
    expect(recordGroupChange).not.toHaveBeenCalled();
  });

  it('replaces the fallback atomically and audits the released group', async () => {
    const fixture = createFallbackPrisma([
      { id: 'group-a', name: 'A', key: 'a', organizationalUnitId: 'ou-1', isFallback: true },
      { id: 'group-b', name: 'B', key: 'b', organizationalUnitId: 'ou-1' },
    ]);
    await updateGroup(fixture.prisma as never, 'group-b', { isFallback: true }, auditContext);

    expect(fixture.rows.get('group-a')?.isFallback).toBe(false);
    expect(fixture.rows.get('group-b')?.isFallback).toBe(true);
    expect(fixture.fallbackGroups('ou-1')).toHaveLength(1);
    expect(recordGroupChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'group.updated',
        entityId: 'group-a',
        metadata: expect.objectContaining({ reason: 'fallback_reassigned' }),
      }),
    );
  });

  it('takes the per-unit lock only when the flag actually toggles', async () => {
    const fixture = createFallbackPrisma([
      { id: 'group-a', name: 'A', key: 'a', organizationalUnitId: 'ou-1', isFallback: true },
    ]);
    await updateGroup(fixture.prisma as never, 'group-a', { name: 'Renamed' }, auditContext);
    expect(fixture.executeRawCalls).toHaveLength(0);

    fixture.executeRawCalls.length = 0;
    await updateGroup(fixture.prisma as never, 'group-a', { isFallback: true }, auditContext);
    expect(fixture.executeRawCalls).toHaveLength(0);
  });

  it('locks on the unit, not globally', async () => {
    const fixture = createFallbackPrisma();
    await createGroup(
      fixture.prisma as never,
      { name: 'Fallback A', organizationalUnitId: 'ou-1', isFallback: true },
      auditContext,
    );
    expect(fixture.executeRawCalls).toEqual([fallbackLockKey('ou-1')]);
  });

  it('creates a fallback group as a replacement for the previous one', async () => {
    const fixture = createFallbackPrisma([
      { id: 'group-a', name: 'A', key: 'a', organizationalUnitId: 'ou-1', isFallback: true },
    ]);
    await createGroup(
      fixture.prisma as never,
      { name: 'Second', organizationalUnitId: 'ou-1', isFallback: true },
      auditContext,
    );
    expect(fixture.rows.get('group-a')?.isFallback).toBe(false);
    expect(fixture.fallbackGroups('ou-1')).toHaveLength(1);
  });

  it('does not lock when a group is created without the flag', async () => {
    const fixture = createFallbackPrisma();
    await createGroup(
      fixture.prisma as never,
      { name: 'Plain', organizationalUnitId: 'ou-1' },
      auditContext,
    );
    expect(fixture.executeRawCalls).toHaveLength(0);
  });

  it('leaves exactly one fallback group after 20 concurrent replacements', async () => {
    const seed: Array<Partial<GroupRow>> = [{ id: 'group-0', organizationalUnitId: 'ou-1', isFallback: true }];
    for (let index = 1; index <= 19; index += 1) {
      seed.push({ id: `group-${index}`, key: `g${index}`, name: `G${index}`, organizationalUnitId: 'ou-1' });
    }
    const fixture = createFallbackPrisma(seed);

    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        updateGroup(
          fixture.prisma as never,
          `group-${index}`,
          { isFallback: true },
          { actorUserId: `admin-${index}`, requestId: `req-${index}` },
        ),
      ),
    );

    // Every replacement succeeded: the lock waited instead of racing the index.
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toEqual([]);
    expect(fixture.fallbackGroups('ou-1')).toHaveLength(1);
    // And the lock was taken once per *toggle* - `group-0` was already the
    // fallback, so re-asserting it is not a toggle - always on this unit's key.
    expect(new Set(fixture.executeRawCalls)).toEqual(new Set([fallbackLockKey('ou-1')]));
    expect(fixture.executeRawCalls).toHaveLength(19);
  });

  it('keeps units independent: 10 concurrent replacements per unit never cross', async () => {
    const seed: Array<Partial<GroupRow>> = [];
    for (const unit of ['ou-1', 'ou-2']) {
      seed.push({ id: `${unit}-0`, key: `${unit}-0`, organizationalUnitId: unit, isFallback: true });
      for (let index = 1; index < 10; index += 1) {
        seed.push({
          id: `${unit}-${index}`,
          key: `${unit}-${index}`,
          organizationalUnitId: unit,
        });
      }
    }
    const fixture = createFallbackPrisma(seed);
    await Promise.all(
      ['ou-1', 'ou-2'].flatMap((unit) =>
        Array.from({ length: 10 }, (_, index) =>
          updateGroup(
            fixture.prisma as never,
            `${unit}-${index}`,
            { isFallback: true },
            auditContext,
          ),
        ),
      ),
    );
    expect(fixture.fallbackGroups('ou-1')).toHaveLength(1);
    expect(fixture.fallbackGroups('ou-2')).toHaveLength(1);
  });
});
