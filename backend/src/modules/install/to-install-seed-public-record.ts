import { routingOutcomes } from '../routing/routing.constants';
import type { RoutingResolution } from '../routing/routing.types';
import type {
  InstallSeedFallbackGroup,
  InstallSeedOrganizationalUnit,
  InstallSeedPublicRecord,
  InstallSeedRoutingRule,
  InstallSeedService,
} from './install-seed.types';

export function toInstallSeedPublicRecord(input: {
  readonly organizationalUnit: InstallSeedOrganizationalUnit | null;
  readonly fallbackGroup: InstallSeedFallbackGroup | null;
  readonly service: InstallSeedService | null;
  readonly routingRule: InstallSeedRoutingRule | null;
  readonly resolution: RoutingResolution | null;
}): InstallSeedPublicRecord {
  const isSeeded =
    input.organizationalUnit !== null &&
    input.fallbackGroup !== null &&
    input.fallbackGroup.isFallback &&
    input.service !== null &&
    input.service.lifecycle === 'ACTIVE' &&
    (input.service.activeFormVersionRef ?? '').length > 0 &&
    input.routingRule !== null &&
    input.routingRule.groupId === input.fallbackGroup.id &&
    input.resolution?.outcome === routingOutcomes.exact &&
    input.resolution.groupId === input.fallbackGroup.id;
  return {
    isSeeded,
    organizationalUnit:
      input.organizationalUnit === null
        ? null
        : {
            id: input.organizationalUnit.id,
            name: input.organizationalUnit.name,
            ouPath: input.organizationalUnit.ouPath,
          },
    fallbackGroup:
      input.fallbackGroup === null
        ? null
        : {
            id: input.fallbackGroup.id,
            name: input.fallbackGroup.name,
            key: input.fallbackGroup.key,
            isFallback: input.fallbackGroup.isFallback,
          },
    service:
      input.service === null
        ? null
        : {
            id: input.service.id,
            name: input.service.name,
            slug: input.service.slug,
            lifecycle: input.service.lifecycle,
            activeFormVersionRef: input.service.activeFormVersionRef ?? null,
          },
    routingRule:
      input.routingRule === null
        ? null
        : {
            id: input.routingRule.id,
            originUnitId: input.routingRule.originUnitId,
            serviceId: input.routingRule.serviceId,
            groupId: input.routingRule.groupId,
          },
    resolution:
      input.resolution === null
        ? null
        : {
            outcome: input.resolution.outcome,
            groupId: input.resolution.groupId,
            fallbackDepth: input.resolution.fallbackDepth,
          },
  };
}
