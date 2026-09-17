import { PrismaService } from '../../common/prisma/prisma.service';
import { SlaError } from './sla.error';
import type { SlaEscalationRuleRecord } from './ticket-sla.types';

export async function requireSlaEscalationRule(
  prisma: PrismaService,
  ruleId: string,
): Promise<SlaEscalationRuleRecord> {
  const rule = await prisma.slaEscalationRule.findUnique({
    where: { id: ruleId },
  });
  if (rule === null) {
    throw new SlaError('ESCALATION_RULE_NOT_FOUND');
  }
  return rule as SlaEscalationRuleRecord;
}
