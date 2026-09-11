import { PrismaService } from '../../common/prisma/prisma.service';
import { loadOrganizationalUnitAncestors } from './load-organizational-unit-ancestors';
import { routingOutcomes } from './routing.constants';
import { RoutingError } from './routing.error';
import type {
  RoutingConfiguration,
  RoutingResolution,
  RoutingRuleRecord,
} from './routing.types';

export async function resolveTicketRouting(
  prisma: PrismaService,
  input: { readonly originUnitId: string; readonly serviceId: string },
  configuration: RoutingConfiguration,
): Promise<RoutingResolution> {
  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
    select: { id: true },
  });
  if (service === null) {
    throw new RoutingError('SERVICE_NOT_FOUND');
  }
  const ancestors = await loadOrganizationalUnitAncestors(
    prisma,
    input.originUnitId,
  );
  const rules = await prisma.routingRule.findMany({
    where: {
      serviceId: input.serviceId,
      originUnitId: { in: ancestors.map((unit) => unit.id) },
    },
  });
  const ruleByOrigin = new Map(rules.map((rule) => [rule.originUnitId, rule]));
  return resolveFromAncestorChain({
    originUnitId: input.originUnitId,
    serviceId: input.serviceId,
    ancestors,
    ruleByOrigin,
    configuration,
  });
}

export function resolveFromAncestorChain(input: {
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly ancestors: readonly { readonly id: string; readonly ouPath: string }[];
  readonly ruleByOrigin: ReadonlyMap<string, RoutingRuleRecord>;
  readonly configuration: RoutingConfiguration;
}): RoutingResolution {
  const walkedPaths: string[] = [];
  for (const [depth, ancestor] of input.ancestors.entries()) {
    walkedPaths.push(ancestor.ouPath);
    const rule = input.ruleByOrigin.get(ancestor.id);
    if (rule === undefined) {
      continue;
    }
    return {
      outcome:
        depth === 0 ? routingOutcomes.exact : routingOutcomes.parentFallback,
      originUnitId: input.originUnitId,
      serviceId: input.serviceId,
      groupId: rule.groupId,
      matchedRuleId: rule.id,
      matchedOriginUnitId: ancestor.id,
      fallbackDepth: depth,
      fallbackPath: walkedPaths,
      unroutedQueue: null,
    };
  }
  return {
    outcome: routingOutcomes.unrouted,
    originUnitId: input.originUnitId,
    serviceId: input.serviceId,
    groupId: null,
    matchedRuleId: null,
    matchedOriginUnitId: null,
    fallbackDepth: Math.max(input.ancestors.length - 1, 0),
    fallbackPath: input.ancestors.map((unit) => unit.ouPath),
    unroutedQueue: {
      enabled: input.configuration.unroutedQueueEnabled,
      ownerRole: input.configuration.unroutedQueueOwnerRole,
    },
  };
}
