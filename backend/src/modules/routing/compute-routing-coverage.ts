import type { PrismaService } from '../../common/prisma/prisma.service';
import { walkOrganizationalUnitAncestors } from './load-organizational-unit-ancestors';
import {
  defaultRoutingConfiguration,
  routingCoverageDefaultTake,
  routingCoverageMaximumTake,
} from './routing.constants';
import {
  decodeRoutingCoverageCursor,
  encodeRoutingCoverageCursor,
} from './routing-coverage-cursor';
import { resolveFromAncestorChain } from './resolve-ticket-routing';
import type {
  RoutingConfiguration,
  RoutingCoverageItem,
  RoutingCoveragePage,
  RoutingCoverageQuery,
  RoutingRuleRecord,
  RoutingServiceLifecycle,
} from './routing.types';

export async function computeRoutingCoverage(
  prisma: PrismaService,
  query: RoutingCoverageQuery,
  configuration: RoutingConfiguration = defaultRoutingConfiguration,
): Promise<RoutingCoveragePage> {
  const take = Math.min(
    routingCoverageMaximumTake,
    Math.max(1, query.take ?? routingCoverageDefaultTake),
  );
  const cursor = decodeRoutingCoverageCursor(query.cursor);
  const serviceWhere = {
    ...(query.includeInactive === true ? {} : { lifecycle: 'ACTIVE' as const }),
    ...(query.serviceId === undefined ? {} : { id: query.serviceId }),
  };
  const pageServiceWhere =
    cursor === null
      ? serviceWhere
      : {
          ...serviceWhere,
          OR: [
            { name: { gt: cursor.serviceName } },
            { name: cursor.serviceName, id: { gt: cursor.serviceId } },
          ],
        };
  const [units, total, pageServicesWithLookahead] = await Promise.all([
    prisma.organizationalUnit.findMany({
      // Ancestors are required to resolve inherited rules even when one origin
      // OU is selected as a display filter.
      select: { id: true, parentId: true, ouPath: true },
      orderBy: { ouPath: 'asc' },
    }),
    prisma.service.count({ where: serviceWhere }),
    prisma.service.findMany({
      where: pageServiceWhere,
      select: { id: true, name: true, lifecycle: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: take + 1,
    }),
  ]);
  const hasMore = pageServicesWithLookahead.length > take;
  const pageServices = pageServicesWithLookahead.slice(0, take);
  const rules =
    pageServices.length === 0
      ? []
      : await prisma.routingRule.findMany({
          where: { serviceId: { in: pageServices.map((service) => service.id) } },
        });
  const originUnits = filterById(units, query.originUnitId);
  const rulesByService = groupRulesByService(rules);
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const items: RoutingCoverageItem[] = [];
  for (const service of pageServices) {
    const ruleByOrigin = rulesByService.get(service.id) ?? new Map();
    for (const origin of originUnits) {
      const ancestors = walkOrganizationalUnitAncestors(origin.id, unitById);
      items.push({
        originUnitId: origin.id,
        originUnitPath: origin.ouPath,
        serviceId: service.id,
        serviceName: service.name,
        serviceLifecycle: service.lifecycle as RoutingServiceLifecycle,
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
  const lastService = pageServices[pageServices.length - 1];
  return {
    items,
    total,
    take,
    cursor: query.cursor ?? null,
    nextCursor:
      hasMore && lastService !== undefined
        ? encodeRoutingCoverageCursor({
            serviceName: lastService.name,
            serviceId: lastService.id,
          })
        : null,
  };
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
