import { PrismaService } from '../../common/prisma/prisma.service';
import { SlaError } from './sla.error';
import type { SlaRuleRecord } from './sla.types';

export async function requireSlaRule(
  prisma: PrismaService,
  ruleId: string,
): Promise<SlaRuleRecord> {
  const rule = await prisma.slaRule.findUnique({ where: { id: ruleId } });
  if (rule === null) {
    throw new SlaError('RULE_NOT_FOUND');
  }
  return rule;
}
