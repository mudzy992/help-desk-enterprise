import { PrismaService } from '../../common/prisma/prisma.service';
import { assertEscalationOffsetOrder, assertEscalationTargetExists, normalizeEscalationTarget } from './assert-sla-escalation-constraints';
import { requireSlaEscalationRule } from './load-sla-escalation-rule';
import { changeLogActions, recordSlaChange } from './record-sla-change';
import { slaChangeLogEntityTypes } from './sla.constants';
import { toEscalationRuleSnapshot } from './to-escalation-rule-snapshot';
import type { SlaMutationContext, UpdateEscalationRuleInput } from './sla.types';
import type { SlaEscalationRuleRecord } from './ticket-sla.types';
import { withSlaProfileWriteLock } from './with-sla-profile-write-lock';

export async function updateSlaEscalationRule(prisma: PrismaService, ruleId: string, input: UpdateEscalationRuleInput, context: SlaMutationContext): Promise<SlaEscalationRuleRecord> {
  const observed = await requireSlaEscalationRule(prisma, ruleId);
  return withSlaProfileWriteLock(prisma, observed.slaProfileId, async (client) => {
    const existing = await requireSlaEscalationRule(client, ruleId);
    const target = normalizeEscalationTarget({
      targetGroupId: input.targetGroupId !== undefined ? input.targetGroupId : existing.targetGroupId,
      targetRole: input.targetRole !== undefined ? input.targetRole : existing.targetRole,
      targetUserId: input.targetUserId !== undefined ? input.targetUserId : existing.targetUserId,
      targetOnCall: input.targetOnCall !== undefined ? input.targetOnCall : (input.targetGroupId === undefined || input.targetGroupId === existing.targetGroupId) && existing.targetOnCall === true,
    });
    await assertEscalationTargetExists(client, target);
    const triggerOffsetMinutes = input.triggerOffsetMinutes ?? existing.triggerOffsetMinutes;
    await assertEscalationOffsetOrder(client, { slaProfileId: existing.slaProfileId, triggerOffsetMinutes, excludeRuleId: ruleId });
    const updated = await client.slaEscalationRule.update({ where: { id: ruleId }, data: {
      triggerOffsetMinutes, targetGroupId: target.targetGroupId, targetRole: target.targetRole,
      targetUserId: target.targetUserId, targetOnCall: target.targetOnCall,
    } }) as SlaEscalationRuleRecord;
    await recordSlaChange(client, { action: changeLogActions.update, entityType: slaChangeLogEntityTypes.escalationRule, entityId: updated.id, reason: input.reason, before: toEscalationRuleSnapshot(existing), after: toEscalationRuleSnapshot(updated), actorUserId: context.actorUserId });
    return updated;
  });
}
