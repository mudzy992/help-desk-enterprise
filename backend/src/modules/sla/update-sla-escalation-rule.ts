import { PrismaService } from '../../common/prisma/prisma.service';
import {
  assertEscalationOffsetOrder,
  assertEscalationTargetExists,
  normalizeEscalationTarget,
} from './assert-sla-escalation-constraints';
import { requireSlaEscalationRule } from './load-sla-escalation-rule';
import { changeLogActions, recordSlaChange } from './record-sla-change';
import { slaChangeLogEntityTypes } from './sla.constants';
import { toEscalationRuleSnapshot } from './to-escalation-rule-snapshot';
import type {
  SlaMutationContext,
  UpdateEscalationRuleInput,
} from './sla.types';
import type { SlaEscalationRuleRecord } from './ticket-sla.types';

export async function updateSlaEscalationRule(
  prisma: PrismaService,
  ruleId: string,
  input: UpdateEscalationRuleInput,
  context: SlaMutationContext,
): Promise<SlaEscalationRuleRecord> {
  const existing = await requireSlaEscalationRule(prisma, ruleId);
  const target = normalizeEscalationTarget({
    targetGroupId:
      input.targetGroupId !== undefined
        ? input.targetGroupId
        : existing.targetGroupId,
    targetRole:
      input.targetRole !== undefined ? input.targetRole : existing.targetRole,
    targetUserId:
      input.targetUserId !== undefined
        ? input.targetUserId
        : existing.targetUserId,
  });
  await assertEscalationTargetExists(prisma, target);
  const triggerOffsetMinutes =
    input.triggerOffsetMinutes ?? existing.triggerOffsetMinutes;
  await assertEscalationOffsetOrder(prisma, {
    slaProfileId: existing.slaProfileId,
    triggerOffsetMinutes,
    excludeRuleId: ruleId,
  });
  return prisma.$transaction(async (transaction) => {
    const updated = (await transaction.slaEscalationRule.update({
      where: { id: ruleId },
      data: {
        triggerOffsetMinutes,
        targetGroupId: target.targetGroupId,
        targetRole: target.targetRole,
        targetUserId: target.targetUserId,
      },
    })) as SlaEscalationRuleRecord;
    await recordSlaChange(transaction as PrismaService, {
      action: changeLogActions.update,
      entityType: slaChangeLogEntityTypes.escalationRule,
      entityId: updated.id,
      reason: input.reason,
      before: toEscalationRuleSnapshot(existing),
      after: toEscalationRuleSnapshot(updated),
      actorUserId: context.actorUserId,
    });
    return updated;
  });
}
