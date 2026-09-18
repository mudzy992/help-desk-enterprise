import { PrismaService } from '../../common/prisma/prisma.service';
import { RoutingError } from './routing.error';

export async function assertRoutingRuleScope(
  prisma: PrismaService,
  ruleId: string,
  originUnitId: string,
  serviceId: string,
): Promise<void> {
  const rule = await prisma.routingRule.findUnique({
    where: { id: ruleId },
    select: { originUnitId: true, serviceId: true },
  });
  if (rule === null) {
    throw new RoutingError('RULE_NOT_FOUND');
  }
  if (rule.originUnitId !== originUnitId || rule.serviceId !== serviceId) {
    throw new RoutingError('RULE_NOT_FOUND');
  }
}
