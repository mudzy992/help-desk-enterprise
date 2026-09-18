import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  TicketImpact,
  TicketPriority,
  TicketUrgency,
} from '../../generated/prisma/enums';
import { priorityMatrixCellKey } from './default-priority-matrix';
import { listPriorityMatrix } from './list-priority-matrix';
import { changeLogActions, recordSlaChange } from './record-sla-change';
import { slaChangeLogEntityTypes } from './sla.constants';
import { SlaError } from './sla.error';
import type { SlaMutationContext } from './sla.types';

export type PatchPriorityMatrixInput = {
  readonly cells: readonly {
    readonly impact: TicketImpact;
    readonly urgency: TicketUrgency;
    readonly priority: TicketPriority;
  }[];
  readonly reason: string;
};

const matrixEntityId = 'global';

export async function patchPriorityMatrix(
  prisma: PrismaService,
  input: PatchPriorityMatrixInput,
  context: SlaMutationContext,
): Promise<Awaited<ReturnType<typeof listPriorityMatrix>>> {
  const uniqueKeys = new Set(
    input.cells.map((cell) =>
      priorityMatrixCellKey(cell.impact, cell.urgency),
    ),
  );
  if (uniqueKeys.size !== input.cells.length) {
    throw new SlaError('DUPLICATE_PRIORITY_MATRIX_CELL');
  }
  const before = await listPriorityMatrix(prisma);
  await prisma.$transaction(async (transaction) => {
    for (const cell of input.cells) {
      await transaction.priorityMatrixRule.upsert({
        where: {
          impact_urgency: { impact: cell.impact, urgency: cell.urgency },
        },
        create: {
          impact: cell.impact,
          urgency: cell.urgency,
          priority: cell.priority,
        },
        update: { priority: cell.priority },
      });
    }
    const after = await listPriorityMatrix(transaction as PrismaService);
    await recordSlaChange(transaction as PrismaService, {
      action: changeLogActions.update,
      entityType: slaChangeLogEntityTypes.priorityMatrix,
      entityId: matrixEntityId,
      reason: input.reason,
      before: before.cells.map((cell) => ({
        impact: cell.impact,
        urgency: cell.urgency,
        priority: cell.priority,
      })),
      after: after.cells.map((cell) => ({
        impact: cell.impact,
        urgency: cell.urgency,
        priority: cell.priority,
      })),
      actorUserId: context.actorUserId,
    });
  });
  return listPriorityMatrix(prisma);
}
