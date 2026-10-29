import type { PrismaService } from '../../common/prisma/prisma.service';
import { walkOrganizationalUnitAncestors } from './load-organizational-unit-ancestors';
import {
  defaultRoutingConfiguration,
  routingCoverageDefaultTake,
  routingCoverageMaximumBytes,
  routingCoverageMaximumDurationMs,
  routingCoverageMaximumItems,
  routingCoverageMaximumTake,
} from './routing.constants';
import {
  decodeRoutingCoverageCursor,
  encodeRoutingCoverageCursor,
} from './routing-coverage-cursor';
import { resolveFromAncestorChain } from './resolve-ticket-routing';
import { isRoutingScopeVisible } from './routing-access-filter';
import { RoutingError } from './routing.error';
import type {
  RoutingConfiguration,
  RoutingCoverageItem,
  RoutingCoveragePage,
  RoutingCoverageQuery,
  RoutingRuleRecord,
  RoutingServiceLifecycle,
} from './routing.types';

export type RoutingCoverageScopeAssignment = {
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
};

export async function computeRoutingCoverage(
  prisma: PrismaService,
  query: RoutingCoverageQuery,
  configuration: RoutingConfiguration = defaultRoutingConfiguration,
  scopeAssignments?: readonly RoutingCoverageScopeAssignment[],
): Promise<RoutingCoveragePage> {
  const startedAt = Date.now();
  const take = Math.min(
    routingCoverageMaximumTake,
    Math.max(1, query.take ?? routingCoverageDefaultTake),
  );
  const cursor = decodeRoutingCoverageCursor(query.cursor);
  const scopedServiceIds = resolveScopedServiceIds(scopeAssignments);
  const requestedServiceId = query.serviceId;
  const serviceIdFilter =
    requestedServiceId !== undefined
      ? scopedServiceIds === null || scopedServiceIds.includes(requestedServiceId)
        ? requestedServiceId
        : { in: [] as string[] }
      : scopedServiceIds === null
        ? undefined
        : { in: scopedServiceIds };
  const serviceWhere = {
    ...(query.includeInactive === true ? {} : { lifecycle: 'ACTIVE' as const }),
    ...(serviceIdFilter === undefined ? {} : { id: serviceIdFilter }),
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
  let estimatedBytes = 0;
  let includedServiceCount = 0;
  let budgetLimited = false;
  for (const service of pageServices) {
    assertCoverageTimeBudget(startedAt);
    const ruleByOrigin = rulesByService.get(service.id) ?? new Map();
    const visibleOrigins = scopeAssignments === undefined
      ? originUnits
      : originUnits.filter((origin) => isRoutingScopeVisible({
          originUnitPath: origin.ouPath,
          serviceId: service.id,
        }, scopeAssignments));
    const serviceItems: RoutingCoverageItem[] = [];
    let serviceBytes = 0;
    for (const origin of visibleOrigins) {
      assertCoverageTimeBudget(startedAt);
      const ancestors = walkOrganizationalUnitAncestors(origin.id, unitById);
      const item: RoutingCoverageItem = {
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
      };
      serviceItems.push(item);
      serviceBytes += Buffer.byteLength(JSON.stringify(item), 'utf8');
    }
    const exceedsBudget =
      items.length + serviceItems.length > routingCoverageMaximumItems ||
      estimatedBytes + serviceBytes > routingCoverageMaximumBytes;
    if (exceedsBudget) {
      if (includedServiceCount === 0) {
        throw new RoutingError('ROUTING_COVERAGE_BUDGET_EXCEEDED');
      }
      budgetLimited = true;
      break;
    }
    items.push(...serviceItems);
    estimatedBytes += serviceBytes;
    includedServiceCount += 1;
  }
  const lastService = pageServices[includedServiceCount - 1];
  return {
    items,
    total,
    take,
    cursor: query.cursor ?? null,
    nextCursor:
      (hasMore || budgetLimited) && lastService !== undefined
        ? encodeRoutingCoverageCursor({
            serviceName: lastService.name,
            serviceId: lastService.id,
          })
        : null,
    resourceBudget: {
      maximumItems: routingCoverageMaximumItems,
      maximumBytes: routingCoverageMaximumBytes,
      maximumDurationMs: routingCoverageMaximumDurationMs,
      itemCount: items.length,
      estimatedBytes,
      limited: budgetLimited,
    },
  };
}

function assertCoverageTimeBudget(startedAt: number): void {
  if (Date.now() - startedAt > routingCoverageMaximumDurationMs) {
    throw new RoutingError('ROUTING_COVERAGE_BUDGET_EXCEEDED');
  }
}

function resolveScopedServiceIds(
  assignments: readonly RoutingCoverageScopeAssignment[] | undefined,
): string[] | null {
  if (assignments === undefined || assignments.some((item) => item.serviceId === null)) {
    return null;
  }
  return [...new Set(assignments.flatMap((item) =>
    item.serviceId === null ? [] : [item.serviceId],
  ))].sort();
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
