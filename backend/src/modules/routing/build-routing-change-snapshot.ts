import type { JsonValue } from '../change-log/change-log.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { routingOutcomes } from './routing.constants';
import type { RoutingResolution } from './routing.types';

export async function buildRoutingChangeSnapshot(
  prisma: PrismaService,
  resolution: RoutingResolution,
): Promise<JsonValue> {
  const [originUnit, service, group] = await Promise.all([
    prisma.organizationalUnit.findUnique({
      where: { id: resolution.originUnitId },
      select: { ouPath: true },
    }),
    prisma.service.findUnique({
      where: { id: resolution.serviceId },
      select: { name: true },
    }),
    resolution.groupId === null
      ? Promise.resolve(null)
      : prisma.group.findUnique({
          where: { id: resolution.groupId },
          select: { name: true },
        }),
  ]);
  return {
    originUnitId: resolution.originUnitId,
    originUnitPath: originUnit?.ouPath ?? null,
    serviceId: resolution.serviceId,
    serviceName: service?.name ?? null,
    targetGroupId: resolution.groupId,
    targetGroupName: group?.name ?? null,
    matchedRuleId: resolution.matchedRuleId,
    matchedOriginUnitId: resolution.matchedOriginUnitId,
    fallbackDepth: resolution.fallbackDepth,
    fallbackPath: [...resolution.fallbackPath],
    outcome: resolution.outcome,
    unrouted: resolution.outcome === routingOutcomes.unrouted,
    unroutedQueue: resolution.unroutedQueue,
  };
}
