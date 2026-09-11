import { PrismaService } from '../../common/prisma/prisma.service';
import { requireSlaRule } from './load-sla-rule';
import { changeLogActions, recordSlaChange } from './record-sla-change';
import { slaChangeLogEntityTypes } from './sla.constants';
import { toRuleSnapshot } from './to-sla-snapshots';
import type { SlaMutationContext } from './sla.types';

export async function deleteSlaRule(
  prisma: PrismaService,
  ruleId: string,
  reason: string,
  context: SlaMutationContext,
): Promise<void> {
  const current = await requireSlaRule(prisma, ruleId);
  await prisma.$transaction(async (transaction) => {
    await transaction.slaRule.delete({ where: { id: ruleId } });
    await recordSlaChange(transaction as PrismaService, {
      action: changeLogActions.delete,
      entityType: slaChangeLogEntityTypes.rule,
      entityId: ruleId,
      reason,
      before: toRuleSnapshot(current),
      after: {},
      actorUserId: context.actorUserId,
    });
  });
}
