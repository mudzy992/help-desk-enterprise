import { PrismaService } from '../../common/prisma/prisma.service';
import { requireSlaEscalationRule } from './load-sla-escalation-rule';
import { changeLogActions, recordSlaChange } from './record-sla-change';
import { slaChangeLogEntityTypes } from './sla.constants';
import { toEscalationRuleSnapshot } from './to-escalation-rule-snapshot';
import type { SlaMutationContext } from './sla.types';

export async function deleteSlaEscalationRule(
  prisma: PrismaService,
  ruleId: string,
  reason: string,
  context: SlaMutationContext,
): Promise<void> {
  const existing = await requireSlaEscalationRule(prisma, ruleId);
  await prisma.$transaction(async (transaction) => {
    await transaction.slaEscalationRule.delete({ where: { id: ruleId } });
    await recordSlaChange(transaction as PrismaService, {
      action: changeLogActions.delete,
      entityType: slaChangeLogEntityTypes.escalationRule,
      entityId: ruleId,
      reason,
      before: toEscalationRuleSnapshot(existing),
      after: {},
      actorUserId: context.actorUserId,
    });
  });
}
