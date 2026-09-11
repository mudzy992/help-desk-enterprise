import { PrismaService } from '../../common/prisma/prisma.service';
import type { SlaRuleRecord, SlaRuleResponse } from './sla.types';

export async function listSlaRules(
  prisma: PrismaService,
  slaProfileId?: string,
): Promise<readonly SlaRuleRecord[]> {
  return prisma.slaRule.findMany({
    where: slaProfileId === undefined ? undefined : { slaProfileId },
    orderBy: [{ evaluationOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function toSlaRuleResponses(
  prisma: PrismaService,
  rules: readonly SlaRuleRecord[],
): Promise<readonly SlaRuleResponse[]> {
  if (rules.length === 0) {
    return [];
  }
  const organizationalUnitIds = [
    ...new Set(
      rules
        .map((rule) => rule.organizationalUnitId)
        .filter((value): value is string => value !== null),
    ),
  ];
  const serviceIds = [
    ...new Set(
      rules
        .map((rule) => rule.serviceId)
        .filter((value): value is string => value !== null),
    ),
  ];
  const [units, services] = await Promise.all([
    organizationalUnitIds.length === 0
      ? []
      : prisma.organizationalUnit.findMany({
          where: { id: { in: organizationalUnitIds } },
          select: { id: true, ouPath: true },
        }),
    serviceIds.length === 0
      ? []
      : prisma.service.findMany({
          where: { id: { in: serviceIds } },
          select: { id: true, name: true },
        }),
  ]);
  const unitPath = new Map(units.map((unit) => [unit.id, unit.ouPath]));
  const serviceName = new Map(services.map((service) => [service.id, service.name]));
  return rules.map((rule) => ({
    id: rule.id,
    slaProfileId: rule.slaProfileId,
    priority: rule.priority,
    responseMinutes: rule.responseMinutes,
    resolutionMinutes: rule.resolutionMinutes,
    evaluationOrder: rule.evaluationOrder,
    organizationalUnitId: rule.organizationalUnitId,
    organizationalUnitPath:
      rule.organizationalUnitId === null
        ? null
        : (unitPath.get(rule.organizationalUnitId) ?? rule.organizationalUnitId),
    serviceId: rule.serviceId,
    serviceName:
      rule.serviceId === null
        ? null
        : (serviceName.get(rule.serviceId) ?? rule.serviceId),
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  }));
}
