import type { routingOutcomes } from './routing.constants';

export type RoutingOutcome =
  (typeof routingOutcomes)[keyof typeof routingOutcomes];

export type RoutingConfiguration = {
  readonly unroutedQueueEnabled: boolean;
  readonly unroutedQueueOwnerRole: string;
};

export type RoutingRuleRecord = {
  readonly id: string;
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly groupId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type CreateRoutingRuleInput = {
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly groupId: string;
  readonly reason: string;
};

export type RoutingMutationContext = {
  readonly actorUserId: string | null;
};

export type ListRoutingRulesQuery = {
  readonly originUnitId?: string;
  readonly serviceId?: string;
};

export type ResolveRoutingInput = {
  readonly originUnitId: string;
  readonly serviceId: string;
};

export type UnroutedQueueDescriptor = {
  readonly enabled: boolean;
  readonly ownerRole: string;
};

export type RoutingResolution = {
  readonly outcome: RoutingOutcome;
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly groupId: string | null;
  readonly matchedRuleId: string | null;
  readonly matchedOriginUnitId: string | null;
  readonly fallbackDepth: number;
  readonly fallbackPath: readonly string[];
  readonly unroutedQueue: UnroutedQueueDescriptor | null;
};

export type RoutingRuleResponse = {
  readonly id: string;
  readonly originUnitId: string;
  readonly originUnitPath: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type RoutingCoverageItem = {
  readonly originUnitId: string;
  readonly originUnitPath: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly hasExactRule: boolean;
  readonly resolution: RoutingResolution;
};

export type RoutingCoverageQuery = {
  readonly originUnitId?: string;
  readonly serviceId?: string;
};

export type OrganizationalUnitAncestor = {
  readonly id: string;
  readonly parentId: string | null;
  readonly ouPath: string;
};
