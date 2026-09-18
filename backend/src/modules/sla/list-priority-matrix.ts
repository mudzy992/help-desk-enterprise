import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  TicketImpact,
  TicketPriority,
  TicketUrgency,
} from '../../generated/prisma/enums';
import {
  buildDefaultPriorityMatrix,
  priorityMatrixCellKey,
  type PriorityMatrixCell,
} from './default-priority-matrix';

export type PriorityMatrixRuleRecord = {
  readonly id: string;
  readonly impact: TicketImpact;
  readonly urgency: TicketUrgency;
  readonly priority: TicketPriority;
};

export type PriorityMatrixResponse = {
  readonly cells: readonly (PriorityMatrixCell & { readonly id: string })[];
};

export async function listPriorityMatrix(
  prisma: PrismaService,
): Promise<PriorityMatrixResponse> {
  const existing = (await prisma.priorityMatrixRule.findMany()) as readonly PriorityMatrixRuleRecord[];
  const byKey = new Map(
    existing.map((rule) => [
      priorityMatrixCellKey(rule.impact, rule.urgency),
      rule,
    ]),
  );
  const missing = buildDefaultPriorityMatrix().filter(
    (cell) => !byKey.has(priorityMatrixCellKey(cell.impact, cell.urgency)),
  );
  if (missing.length > 0) {
    for (const cell of missing) {
      const created = (await prisma.priorityMatrixRule.upsert({
        where: {
          impact_urgency: { impact: cell.impact, urgency: cell.urgency },
        },
        create: {
          impact: cell.impact,
          urgency: cell.urgency,
          priority: cell.priority,
        },
        update: {},
      })) as PriorityMatrixRuleRecord;
      byKey.set(priorityMatrixCellKey(created.impact, created.urgency), created);
    }
  }
  const cells = buildDefaultPriorityMatrix().map((cell) => {
    const rule = byKey.get(priorityMatrixCellKey(cell.impact, cell.urgency));
    return {
      id: rule?.id ?? '',
      impact: cell.impact,
      urgency: cell.urgency,
      priority: rule?.priority ?? cell.priority,
    };
  });
  return { cells };
}
