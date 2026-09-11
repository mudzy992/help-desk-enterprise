import { PrismaService } from '../../common/prisma/prisma.service';
import { walkOrganizationalUnitAncestors } from './load-organizational-unit-ancestors';
import { defaultRoutingConfiguration } from './routing.constants';
import { resolveFromAncestorChain } from './resolve-ticket-routing';
import type {
  RoutingConfiguration,
  RoutingCoverageItem,
  RoutingCoverageQuery,
  RoutingRuleRecord,
} from './routing.types';

export async function computeRoutingCoverage(
  prisma: PrismaService,
  query: RoutingCoverageQuery,
  configuration: RoutingConfiguration = defaultRoutingConfiguration,
): Promise<readonly RoutingCoverageItem[]> {
  const [units, services, rules] = await Promise.all([
    prisma.organizationalUnit.findMany({
      select: { id: true, parentId: true, ouPath: true },
      orderBy: { ouPath: 'asc' },
    }),
    prisma.service.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.routingRule.findMany(),
  ]);
  const originUnits = filterById(units, query.originUnitId);
  const catalog = filterById(services, query.serviceId);
  const rulesByService = groupRulesByService(rules);
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const items: RoutingCoverageItem[] = [];
  for (const service of catalog) {
    const ruleByOrigin = rulesByService.get(service.id) ?? new Map();
    for (const origin of originUnits) {
      const ancestors = walkOrganizationalUnitAncestors(origin.id, unitById);
      items.push({
        originUnitId: origin.id,
        originUnitPath: origin.ouPath,
        serviceId: service.id,
        serviceName: service.name,
        hasExactRule: ruleByOrigin.has(origin.id),
        resolution: resolveFromAncestorChain({
          originUnitId: origin.id,
          serviceId: service.id,
          ancestors,
          ruleByOrigin,
          configuration,
        }),
      });
    }
  }
  return items;
}

function filterById<T extends { readonly id: string }>(
  records: readonly T[],
  id: string | undefined,
): readonly T[] {
  if (id === undefined) {
    return records;
  }
  return records.filter((record) => record.id === id);
}

function groupRulesByService(
  rules: readonly RoutingRuleRecord[],
): Map<string, Map<string, RoutingRuleRecord>> {
  const grouped = new Map<string, Map<string, RoutingRuleRecord>>();
  for (const rule of rules) {
    const byOrigin = grouped.get(rule.serviceId) ?? new Map();
    byOrigin.set(rule.originUnitId, rule);
    grouped.set(rule.serviceId, byOrigin);
  }
  return grouped;
}
