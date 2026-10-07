import { buildDefaultPriorityMatrix } from './default-priority-matrix';
import { listPriorityMatrix } from './list-priority-matrix';
import { patchPriorityMatrix } from './patch-priority-matrix';
import { seedMissingPriorityMatrixCells } from './seed-priority-matrix';
import { SlaError } from './sla.error';
import { slaChangeLogEntityTypes } from './sla.constants';
import type { PriorityMatrixRuleRecord } from './list-priority-matrix';

describe('priority matrix', () => {
  it('returns a full 4x4 matrix without performing any writes (GET side-effect free)', async () => {
    const store = new Map<string, PriorityMatrixRuleRecord>();
    const prisma = createMatrixPrisma(store);
    const listed = await listPriorityMatrix(prisma);
    expect(listed.cells).toHaveLength(16);
    // GET must NOT mutate the database – defaults are merged in memory.
    expect(store.size).toBe(0);
    expect(listed.cells.find((cell) => cell.impact === 'HIGH' && cell.urgency === 'HIGH')?.priority).toBe(
      'HIGH',
    );
    // Unseeded cells should carry a null id so callers can distinguish persisted rows.
    expect(listed.cells.every((cell) => cell.id === null)).toBe(true);
  });

  it('merges stored rules over in-memory defaults', async () => {
    const store = new Map<string, PriorityMatrixRuleRecord>();
    store.set('HIGH:HIGH', {
      id: 'mx-existing',
      impact: 'HIGH',
      urgency: 'HIGH',
      priority: 'CRITICAL',
    });
    const prisma = createMatrixPrisma(store);
    const listed = await listPriorityMatrix(prisma);
    expect(store.size).toBe(1);
    const highHigh = listed.cells.find(
      (cell) => cell.impact === 'HIGH' && cell.urgency === 'HIGH',
    );
    expect(highHigh?.priority).toBe('CRITICAL');
    expect(highHigh?.id).toBe('mx-existing');
    const lowLow = listed.cells.find(
      (cell) => cell.impact === 'LOW' && cell.urgency === 'LOW',
    );
    expect(lowLow?.priority).toBe('LOW');
    expect(lowLow?.id).toBeNull();
  });

  it('seedMissingPriorityMatrixCells writes all 16 defaults when nothing exists', async () => {
    const store = new Map<string, PriorityMatrixRuleRecord>();
    const prisma = createMatrixPrisma(store);
    const written = await seedMissingPriorityMatrixCells(prisma);
    expect(written).toBe(16);
    expect(store.size).toBe(16);
    // A second seed is a no-op.
    const writtenAgain = await seedMissingPriorityMatrixCells(prisma);
    expect(writtenAgain).toBe(0);
  });

  it('patches cells and writes a change-log entry', async () => {
    const store = new Map<string, PriorityMatrixRuleRecord>();
    const changeLogs: { entityType: string; entityId: string; reason: string }[] =
      [];
    const prisma = createMatrixPrisma(store, changeLogs);
    await seedMissingPriorityMatrixCells(prisma);
    const patched = await patchPriorityMatrix(
      prisma,
      {
        cells: [{ impact: 'HIGH', urgency: 'HIGH', priority: 'CRITICAL' }],
        reason: 'Raise HIGH×HIGH to CRITICAL for incident response',
      },
      { actorUserId: 'admin-1' },
    );
    expect(
      patched.cells.find(
        (cell) => cell.impact === 'HIGH' && cell.urgency === 'HIGH',
      )?.priority,
    ).toBe('CRITICAL');
    expect(changeLogs).toEqual([
      {
        entityType: slaChangeLogEntityTypes.priorityMatrix,
        entityId: 'global',
        reason: 'Raise HIGH×HIGH to CRITICAL for incident response',
      },
    ]);
  });

  it('rejects duplicate cells in one patch', async () => {
    const prisma = createMatrixPrisma(new Map());
    await expect(
      patchPriorityMatrix(
        prisma,
        {
          cells: [
            { impact: 'LOW', urgency: 'LOW', priority: 'LOW' },
            { impact: 'LOW', urgency: 'LOW', priority: 'MEDIUM' },
          ],
          reason: 'duplicate',
        },
        { actorUserId: 'admin-1' },
      ),
    ).rejects.toEqual(new SlaError('DUPLICATE_PRIORITY_MATRIX_CELL'));
  });

  it('default matrix matches score-band formula', () => {
    expect(buildDefaultPriorityMatrix()).toHaveLength(16);
    expect(
      buildDefaultPriorityMatrix().find(
        (cell) => cell.impact === 'CRITICAL' && cell.urgency === 'CRITICAL',
      )?.priority,
    ).toBe('CRITICAL');
  });
});

function createMatrixPrisma(
  store: Map<string, PriorityMatrixRuleRecord>,
  changeLogs: { entityType: string; entityId: string; reason: string }[] = [],
) {
  let nextId = 1;
  const keyOf = (impact: string, urgency: string) => `${impact}:${urgency}`;
  const prisma: {
    priorityMatrixRule: {
      findMany: () => Promise<PriorityMatrixRuleRecord[]>;
      create: (args: {
        data: {
          impact: PriorityMatrixRuleRecord['impact'];
          urgency: PriorityMatrixRuleRecord['urgency'];
          priority: PriorityMatrixRuleRecord['priority'];
        };
      }) => Promise<PriorityMatrixRuleRecord>;
      upsert: (args: {
        where: { impact_urgency: { impact: string; urgency: string } };
        create: {
          impact: PriorityMatrixRuleRecord['impact'];
          urgency: PriorityMatrixRuleRecord['urgency'];
          priority: PriorityMatrixRuleRecord['priority'];
        };
        update: { priority?: PriorityMatrixRuleRecord['priority'] };
      }) => Promise<PriorityMatrixRuleRecord>;
      findUnique: (args: {
        where: { impact_urgency: { impact: string; urgency: string } };
      }) => Promise<PriorityMatrixRuleRecord | null>;
    };
    changeLog: {
      create: (args: {
        data: { entityType: string; entityId: string; reason: string };
      }) => Promise<Record<string, unknown>>;
    };
    $transaction: <T>(callback: (client: unknown) => Promise<T>) => Promise<T>;
  } = {
    priorityMatrixRule: {
      findMany: async () => [...store.values()],
      create: async ({
        data,
      }: {
        data: {
          impact: PriorityMatrixRuleRecord['impact'];
          urgency: PriorityMatrixRuleRecord['urgency'];
          priority: PriorityMatrixRuleRecord['priority'];
        };
      }) => {
        const key = keyOf(data.impact, data.urgency);
        const created: PriorityMatrixRuleRecord = {
          id: `mx-${nextId++}`,
          impact: data.impact,
          urgency: data.urgency,
          priority: data.priority,
        };
        if (store.has(key)) {
          throw new Error(`Unique constraint violation on ${key}`);
        }
        store.set(key, created);
        return created;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { impact_urgency: { impact: string; urgency: string } };
        create: {
          impact: PriorityMatrixRuleRecord['impact'];
          urgency: PriorityMatrixRuleRecord['urgency'];
          priority: PriorityMatrixRuleRecord['priority'];
        };
        update: { priority?: PriorityMatrixRuleRecord['priority'] };
      }) => {
        const key = keyOf(
          where.impact_urgency.impact,
          where.impact_urgency.urgency,
        );
        const existing = store.get(key);
        if (existing === undefined) {
          const created: PriorityMatrixRuleRecord = {
            id: `mx-${nextId++}`,
            impact: create.impact,
            urgency: create.urgency,
            priority: create.priority,
          };
          store.set(key, created);
          return created;
        }
        const updated: PriorityMatrixRuleRecord = {
          ...existing,
          priority: update.priority ?? existing.priority,
        };
        store.set(key, updated);
        return updated;
      },
      findUnique: async ({
        where,
      }: {
        where: { impact_urgency: { impact: string; urgency: string } };
      }) =>
        store.get(
          keyOf(where.impact_urgency.impact, where.impact_urgency.urgency),
        ) ?? null,
    },
    changeLog: {
      create: async ({
        data,
      }: {
        data: { entityType: string; entityId: string; reason: string };
      }) => {
        changeLogs.push({
          entityType: data.entityType,
          entityId: data.entityId,
          reason: data.reason,
        });
        return { id: `log-${changeLogs.length}`, ...data };
      },
    },
    $transaction: async <T>(callback: (client: unknown) => Promise<T>) =>
      callback(prisma),
  };
  return prisma as never;
}
