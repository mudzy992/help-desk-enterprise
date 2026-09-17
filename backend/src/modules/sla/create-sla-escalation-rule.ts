import { PrismaService } from '../../common/prisma/prisma.service';
import {
  assertEscalationLevelAllowed,
  assertEscalationOffsetOrder,
  assertEscalationTargetExists,
  normalizeEscalationTarget,
} from './assert-sla-escalation-constraints';
import { requireSlaProfile } from './load-sla-profile';
import { changeLogActions, recordSlaChange } from './record-sla-change';
import { slaChangeLogEntityTypes } from './sla.constants';
import { SlaError } from './sla.error';
import { toEscalationRuleSnapshot } from './to-escalation-rule-snapshot';
import type {
  EscalationRuleWriteInput,
  SlaConfiguration,
  SlaMutationContext,
} from './sla.types';
import type { SlaEscalationRuleRecord } from './ticket-sla.types';

export async function createSlaEscalationRule(
  prisma: PrismaService,
  input: EscalationRuleWriteInput,
  context: SlaMutationContext,
  configuration: SlaConfiguration,
): Promise<SlaEscalationRuleRecord> {
  const profile = await requireSlaProfile(prisma, input.slaProfileId);
  if (!profile.isActive) {
    throw new SlaError('PROFILE_INACTIVE');
  }
  const target = normalizeEscalationTarget(input);
  await assertEscalationTargetExists(prisma, target);
  await assertEscalationLevelAllowed(prisma, {
    slaProfileId: input.slaProfileId,
    maxEscalationLevels: configuration.maxEscalationLevels,
  });
  await assertEscalationOffsetOrder(prisma, {
    slaProfileId: input.slaProfileId,
    triggerOffsetMinutes: input.triggerOffsetMinutes,
  });
  return prisma.$transaction(async (transaction) => {
    const created = (await transaction.slaEscalationRule.create({
      data: {
        slaProfileId: input.slaProfileId,
        triggerOffsetMinutes: input.triggerOffsetMinutes,
        targetGroupId: target.targetGroupId,
        targetRole: target.targetRole,
        targetUserId: target.targetUserId,
      },
    })) as SlaEscalationRuleRecord;
    await recordSlaChange(transaction as PrismaService, {
      action: changeLogActions.create,
      entityType: slaChangeLogEntityTypes.escalationRule,
      entityId: created.id,
      reason: input.reason,
      before: {},
      after: toEscalationRuleSnapshot(created),
      actorUserId: context.actorUserId,
    });
    return created;
  });
}
