import { PrismaService } from '../../common/prisma/prisma.service';
import type { RoutingRuleRecord, RoutingRuleResponse } from './routing.types';

export async function toRoutingRuleResponses(
  prisma: PrismaService,
  rules: readonly RoutingRuleRecord[],
): Promise<readonly RoutingRuleResponse[]> {
  if (rules.length === 0) {
    return [];
  }
  const originUnitIds = [...new Set(rules.map((rule) => rule.originUnitId))];
  const serviceIds = [...new Set(rules.map((rule) => rule.serviceId))];
  const groupIds = [...new Set(rules.map((rule) => rule.groupId))];
  const [units, services, groups] = await Promise.all([
    prisma.organizationalUnit.findMany({
      where: { id: { in: originUnitIds } },
      select: { id: true, ouPath: true },
    }),
    prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, name: true },
    }),
    prisma.group.findMany({
      where: { id: { in: groupIds } },
      select: { id: true, name: true },
    }),
  ]);
  const unitPath = new Map(units.map((unit) => [unit.id, unit.ouPath]));
  const serviceName = new Map(services.map((service) => [service.id, service.name]));
  const groupName = new Map(groups.map((group) => [group.id, group.name]));
  return rules.map((rule) => ({
    id: rule.id,
    originUnitId: rule.originUnitId,
    originUnitPath: unitPath.get(rule.originUnitId) ?? rule.originUnitId,
    serviceId: rule.serviceId,
    serviceName: serviceName.get(rule.serviceId) ?? rule.serviceId,
    groupId: rule.groupId,
    groupName: groupName.get(rule.groupId) ?? rule.groupId,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  }));
}
