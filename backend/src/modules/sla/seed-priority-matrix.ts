import type { PrismaService } from '../../common/prisma/prisma.service';
import { buildDefaultPriorityMatrix } from './default-priority-matrix';
import { priorityMatrixCellKey } from './default-priority-matrix';

export async function seedMissingPriorityMatrixCells(
  prisma: PrismaService,
): Promise<number> {
  const existing = await prisma.priorityMatrixRule.findMany({
    select: { impact: true, urgency: true },
  });
  const byKey = new Set(
    existing.map((rule) => priorityMatrixCellKey(rule.impact, rule.urgency)),
  );
  const missing = buildDefaultPriorityMatrix().filter(
    (cell) => !byKey.has(priorityMatrixCellKey(cell.impact, cell.urgency)),
  );
  if (missing.length === 0) {
    return 0;
  }
  await prisma.$transaction(
    missing.map((cell) =>
      prisma.priorityMatrixRule.create({
        data: {
          impact: cell.impact,
          urgency: cell.urgency,
          priority: cell.priority,
        },
      }),
    ),
  );
  return missing.length;
}
