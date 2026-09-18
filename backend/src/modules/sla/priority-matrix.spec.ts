import { buildDefaultPriorityMatrix } from './default-priority-matrix';
import { listPriorityMatrix } from './list-priority-matrix';
import { patchPriorityMatrix } from './patch-priority-matrix';
import { SlaError } from './sla.error';
import { slaChangeLogEntityTypes } from './sla.constants';
import type { PriorityMatrixRuleRecord } from './list-priority-matrix';

describe('priority matrix', () => {
  it('returns a full 4x4 matrix and seeds missing defaults', async () => {
    const store = new Map<string, PriorityMatrixRuleRecord>();
    const prisma = createMatrixPrisma(store);
    const listed = await listPriorityMatrix(prisma);
    expect(listed.cells).toHaveLength(16);
    expect(store.size).toBe(16);
    expect(listed.cells.find((cell) => cell.impact === 'HIGH' && cell.urgency === 'HIGH')?.priority).toBe(
      'HIGH',
    );
  });

  it('patches cells and writes a change-log entry', async () => {
    const store = new Map<string, PriorityMatrixRuleRecord>();
    const changeLogs: { entityType: string; entityId: string; reason: string }[] =
      [];
    const prisma = createMatrixPrisma(store, changeLogs);
    await listPriorityMatrix(prisma);
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
