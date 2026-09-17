import { PrismaService } from '../../common/prisma/prisma.service';
import { changeLogActions, recordSlaChange } from './record-sla-change';
import { slaChangeLogEntityTypes } from './sla.constants';
import {
  startingSlaEscalationDefinitions,
  startingSlaEscalationTargetRole,
  startingSlaSeedContext,
  startingSlaSeedReason,
} from './starting-sla.constants';
import { toEscalationRuleSnapshot } from './to-escalation-rule-snapshot';
import type { SlaEscalationRuleRecord } from './ticket-sla.types';

export async function ensureStartingSlaEscalations(
  prisma: PrismaService,
  slaProfileId: string,
): Promise<number> {
  const existingCount = await prisma.slaEscalationRule.count({
    where: { slaProfileId },
  });
  if (existingCount > 0) {
    return 0;
  }
  let createdCount = 0;
  for (const definition of startingSlaEscalationDefinitions) {
    await persistStartingEscalation(prisma, {
      slaProfileId,
      triggerOffsetMinutes: definition.triggerOffsetMinutes,
      targetGroupId: null,
      targetRole: startingSlaEscalationTargetRole,
      targetUserId: null,
    });
    createdCount += 1;
  }
  return createdCount;
}

async function persistStartingEscalation(
  prisma: PrismaService,
  data: Omit<SlaEscalationRuleRecord, 'id'>,
): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    const created = (await transaction.slaEscalationRule.create({
      data,
    })) as SlaEscalationRuleRecord;
    await recordSlaChange(transaction as PrismaService, {
      action: changeLogActions.create,
      entityType: slaChangeLogEntityTypes.escalationRule,
      entityId: created.id,
      reason: startingSlaSeedReason,
      before: {},
      after: toEscalationRuleSnapshot(created),
      actorUserId: startingSlaSeedContext.actorUserId,
    });
  });
}
