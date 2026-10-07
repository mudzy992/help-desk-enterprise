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
  const cells = await Promise.all(
    buildDefaultPriorityMatrix().map(async (cell) => {
      const key = priorityMatrixCellKey(cell.impact, cell.urgency);
      const rule = byKey.get(key);
      if (rule !== undefined) {
        return {
          id: rule.id,
          impact: cell.impact,
          urgency: cell.urgency,
          priority: rule.priority,
        };
      }
      const created = (await prisma.priorityMatrixRule.upsert({
        where: { impact_urgency: { impact: cell.impact, urgency: cell.urgency } },
        create: {
          impact: cell.impact,
          urgency: cell.urgency,
          priority: cell.priority,
        },
        update: {},
      })) as PriorityMatrixRuleRecord;
      return {
        id: created.id,
        impact: cell.impact,
        urgency: cell.urgency,
        priority: created.priority,
      };
    }),
  );
  return { cells };
}
