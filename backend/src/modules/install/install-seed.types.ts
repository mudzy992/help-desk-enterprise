import type { ServiceLifecycle } from '../../generated/prisma/enums';
import type { RoutingConfiguration } from '../routing/routing.types';
import type { ServiceLifecycleConfiguration } from '../service-catalog/service-catalog.types';

export type InstallSeedOrganizationalUnit = {
  readonly id: string;
  readonly name: string;
  readonly ouPath: string;
};

export type InstallSeedFallbackGroup = {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly isFallback: boolean;
};

export type InstallSeedService = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly lifecycle: ServiceLifecycle;
};

export type InstallSeedRoutingRule = {
  readonly id: string;
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly groupId: string;
};

export type InstallSeedResolution = {
  readonly outcome: string;
  readonly groupId: string | null;
  readonly fallbackDepth: number;
};

export type InstallSeedPublicRecord = {
  readonly isSeeded: boolean;
  readonly organizationalUnit: InstallSeedOrganizationalUnit | null;
  readonly fallbackGroup: InstallSeedFallbackGroup | null;
  readonly service: InstallSeedService | null;
  readonly routingRule: InstallSeedRoutingRule | null;
  readonly resolution: InstallSeedResolution | null;
};

export type InstallSeedCreatedFlags = {
  readonly organizationalUnit: boolean;
  readonly fallbackGroup: boolean;
  readonly serviceCategory: boolean;
  readonly service: boolean;
  readonly routingRule: boolean;
};

export type InstallSeedResult = InstallSeedPublicRecord & {
  readonly created: InstallSeedCreatedFlags;
};

export type InstallSeedStatus = {
  readonly seed: InstallSeedPublicRecord;
};

export type InstallSeedContext = {
  readonly actorUserId: string;
  readonly lifecycle: ServiceLifecycleConfiguration;
  readonly routing: RoutingConfiguration;
};
