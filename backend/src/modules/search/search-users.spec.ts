jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { searchDirectoryUsers } from './search-users';
import type { DirectorySearchScope } from './search-directory-scope';

type FindManyArgs = {
  where: Record<string, unknown>;
  select: Record<string, boolean>;
  orderBy: unknown;
  take: number;
};

/**
 * W7.110 (`BA-search-09`): the directory group was ordered by `displayName`
 * alone. Two colleagues can share a name, so a capped page (`LIMIT 15`) had no
 * defined membership: a different plan, a vacuum or an updated row can swap two
 * equal names in and out between two identical requests. The tie-breaker is
 * `id`, and these tests pin the contract on every scope branch.
 */
function harness(rows: Array<Record<string, unknown>> = []) {
  const calls: FindManyArgs[] = [];
  const prisma = {
    user: {
      findMany: async (args: FindManyArgs) => {
        calls.push(args);
        return rows;
      },
    },
  };
  return { prisma, calls };
}

const subtreeScope: DirectorySearchScope = {
  kind: 'organizationalUnits',
  organizationalUnitIds: ['ou-it'],
};
const everyoneWithoutEmail: DirectorySearchScope = { kind: 'everyone', includeEmail: false };
const everyoneWithEmail: DirectorySearchScope = { kind: 'everyone', includeEmail: true };

describe('directory search ordering (W7.110 / BA-search-09)', () => {
  it('orders a scoped read by name and then by id', async () => {
    const { prisma, calls } = harness();
    await searchDirectoryUsers({
      prisma: prisma as never,
      query: 'amina',
      limit: 15,
      scope: subtreeScope,
    });

    expect(calls[0]?.orderBy).toEqual([{ displayName: 'asc' }, { id: 'asc' }]);
    expect(calls[0]?.take).toBe(15);
  });

  it('orders an everyone-reach read without e-mail the same way', async () => {
    const { prisma, calls } = harness();
    await searchDirectoryUsers({
      prisma: prisma as never,
      query: 'amina',
      limit: 15,
      scope: everyoneWithoutEmail,
    });

    expect(calls[0]?.orderBy).toEqual([{ displayName: 'asc' }, { id: 'asc' }]);
  });

  it('orders an everyone-reach read with e-mail the same way', async () => {
    const { prisma, calls } = harness();
    await searchDirectoryUsers({
      prisma: prisma as never,
      query: 'amina',
      limit: 15,
      scope: everyoneWithEmail,
    });

    expect(calls[0]?.orderBy).toEqual([{ displayName: 'asc' }, { id: 'asc' }]);
  });

  it('keeps the scope predicates and projections untouched', async () => {
    const { prisma, calls } = harness();
    await searchDirectoryUsers({
      prisma: prisma as never,
      query: 'amina',
      limit: 5,
      scope: subtreeScope,
    });
    expect(calls[0]?.where).toMatchObject({
      isActive: true,
      organizationalUnitId: { in: ['ou-it'] },
    });
    // The e-mail column is still only read from the scope that may expose it.
    expect(calls[0]?.select).toEqual({ id: true, displayName: true });
  });

  it('answers an empty scope without touching the database', async () => {
    const { prisma, calls } = harness();
    const rows = await searchDirectoryUsers({
      prisma: prisma as never,
      query: 'amina',
      limit: 15,
      scope: { kind: 'none' },
    });
    expect(rows).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('returns the rows in the order the database answered them', async () => {
    const { prisma } = harness([
      { id: 'u-2', displayName: 'Amina Hodžić' },
      { id: 'u-5', displayName: 'Amina Hodžić' },
      { id: 'u-9', displayName: 'Amina Hodžić' },
    ]);
    const rows = await searchDirectoryUsers({
      prisma: prisma as never,
      query: 'amina',
      limit: 15,
      scope: everyoneWithoutEmail,
    });
    expect(rows.map((row) => row.id)).toEqual(['u-2', 'u-5', 'u-9']);
    expect(rows.every((row) => row.email === null)).toBe(true);
  });

  it('has no orderBy in the module that could omit the tie-breaker', () => {
    // A guard in the source, like the window-semantics guard: the next branch
    // added to this file must not reintroduce a single-column order.
    const source = readFileSync(join(__dirname, 'search-users.ts'), 'utf8');
    const orderings = source.match(/orderBy:\s*[^,\n]+/gu) ?? [];
    expect(orderings.length).toBeGreaterThan(0);
    for (const ordering of orderings) {
      expect(ordering).toContain('directoryUserOrder');
    }
    expect(source).toContain("{ displayName: 'asc' },\n  { id: 'asc' },");
  });
});
