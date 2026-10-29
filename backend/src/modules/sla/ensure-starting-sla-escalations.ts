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
  const existing = await prisma.slaEscalationRule.findMany({
    where: { slaProfileId },
  });
  let createdCount = 0;
  for (const definition of startingSlaEscalationDefinitions) {
    if (existing.some((rule) =>
      rule.triggerOffsetMinutes === definition.triggerOffsetMinutes
    )) continue;
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
  const created = (await prisma.slaEscalationRule.create({
    data,
  })) as SlaEscalationRuleRecord;
  await recordSlaChange(prisma, {
    action: changeLogActions.create,
    entityType: slaChangeLogEntityTypes.escalationRule,
    entityId: created.id,
    reason: startingSlaSeedReason,
    before: {},
    after: toEscalationRuleSnapshot(created),
    actorUserId: startingSlaSeedContext.actorUserId,
  });
}
