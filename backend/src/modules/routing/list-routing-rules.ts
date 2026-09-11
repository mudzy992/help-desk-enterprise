import { PrismaService } from '../../common/prisma/prisma.service';
import type { ListRoutingRulesQuery, RoutingRuleRecord } from './routing.types';

export async function listRoutingRules(
  prisma: PrismaService,
  query: ListRoutingRulesQuery,
): Promise<readonly RoutingRuleRecord[]> {
  return prisma.routingRule.findMany({
    where: {
      originUnitId: query.originUnitId,
      serviceId: query.serviceId,
    },
    orderBy: [{ serviceId: 'asc' }, { originUnitId: 'asc' }],
  });
}
