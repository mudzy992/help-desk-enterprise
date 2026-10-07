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
  readonly cells: readonly (PriorityMatrixCell & { readonly id: string | null })[];
};

/**
 * Read-only listing of the priority matrix.
 *
 * IMPORTANT: This function MUST NOT write to the database. GET endpoints must
 * remain side-effect free. Defaults are merged in-memory so the UI always
 * receives a complete 4x4 grid even before the startup seeder has run; actual
 * persistence of missing cells is performed exclusively by
 * {@link seedMissingPriorityMatrixCells} (called from StartingSlaSeedService
 * on module init).
 */
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
  const cells = buildDefaultPriorityMatrix().map((cell) => {
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
    // In-memory fallback – no DB write. Seed responsibility is elsewhere.
    return {
      id: null,
      impact: cell.impact,
      urgency: cell.urgency,
      priority: cell.priority,
    };
  });
  return { cells };
}
