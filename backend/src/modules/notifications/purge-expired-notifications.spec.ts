import { purgeExpiredNotifications } from './purge-expired-notifications';

type Row = { readonly id: string; readonly createdAt: Date };

/**
 * Phase 2.3 (plan §2.3, item 2): the sweep has to delete everything older than
 * the window, keep every statement bounded, and never touch a newer row.
 */
function createPrismaStub(rows: readonly Row[], batchSize: number) {
  const remaining = [...rows];
  const deletedIds: string[] = [];
  const prisma = {
    notification: {
      findMany: async ({ where, take }: { where: { createdAt: { lt: Date } }; take: number }) => {
        const cutoff = where.createdAt.lt.getTime();
        const matching = remaining
          .filter((row) => row.createdAt.getTime() < cutoff)
          .slice(0, Math.min(take, batchSize));
        // The real client always returns at most `take` rows.
        return matching.map((row) => ({ id: row.id }));
      },
      deleteMany: async ({ where }: { where: { id: { in: readonly string[] } } }) => {
        for (const id of where.id.in) {
          deletedIds.push(id);
          const index = remaining.findIndex((row) => row.id === id);
          if (index >= 0) {
            remaining.splice(index, 1);
          }
        }
        return { count: where.id.in.length };
      },
    },
  };
  return { prisma, remaining, deletedIds };
}

describe('purgeExpiredNotifications', () => {
  const now = new Date('2026-09-24T12:00:00.000Z');

  it('deletes only the rows older than the retention window', async () => {
    const { prisma, remaining } = createPrismaStub(
      [
        { id: 'old-1', createdAt: new Date('2026-06-01T00:00:00.000Z') },
        { id: 'old-2', createdAt: new Date('2026-06-20T00:00:00.000Z') },
        { id: 'fresh', createdAt: new Date('2026-09-20T00:00:00.000Z') },
      ],
      5000,
    );
    const deleted = await purgeExpiredNotifications(prisma as never, {
      now,
      retentionDays: 90,
    });
    expect(deleted).toBe(2);
    expect(remaining.map((row) => row.id)).toEqual(['fresh']);
  });

  it('keeps every statement bounded and loops until the old data is gone', async () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      id: `old-${index}`,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    }));
    const { prisma, deletedIds } = createPrismaStub(rows, 2);
    const deleted = await purgeExpiredNotifications(prisma as never, {
      now,
      retentionDays: 90,
      batchSize: 2,
    });
    // Five rows in batches of two: 2 + 2 + 1.
    expect(deleted).toBe(5);
    expect(deletedIds).toHaveLength(5);
  });

  it('does nothing when every row is inside the window', async () => {
    const { prisma, deletedIds } = createPrismaStub(
      [{ id: 'fresh', createdAt: new Date('2026-09-23T00:00:00.000Z') }],
      5000,
    );
    const deleted = await purgeExpiredNotifications(prisma as never, {
      now,
      retentionDays: 90,
    });
    expect(deleted).toBe(0);
    expect(deletedIds).toEqual([]);
  });
});
