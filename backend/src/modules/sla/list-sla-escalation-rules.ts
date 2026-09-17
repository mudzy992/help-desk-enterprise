import { PrismaService } from '../../common/prisma/prisma.service';
import type { SlaEscalationRuleResponse } from './sla.types';
import type { SlaEscalationRuleRecord } from './ticket-sla.types';

type EscalationRuleRow = SlaEscalationRuleRecord & {
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export async function listSlaEscalationRules(
  prisma: PrismaService,
  slaProfileId: string,
): Promise<readonly EscalationRuleRow[]> {
  return (await prisma.slaEscalationRule.findMany({
    where: { slaProfileId },
    orderBy: { triggerOffsetMinutes: 'asc' },
  })) as EscalationRuleRow[];
}

export function toSlaEscalationRuleResponses(
  rules: readonly EscalationRuleRow[],
): readonly SlaEscalationRuleResponse[] {
  return rules.map((rule, index) => ({
    id: rule.id,
    slaProfileId: rule.slaProfileId,
    triggerOffsetMinutes: rule.triggerOffsetMinutes,
    level: index + 1,
    targetGroupId: rule.targetGroupId,
    targetRole: rule.targetRole,
    targetUserId: rule.targetUserId,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  }));
}
