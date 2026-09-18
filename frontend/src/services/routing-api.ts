import { apiRequest } from "@/services/api";

export type RoutingOutcome = "EXACT" | "PARENT_FALLBACK" | "UNROUTED";

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
  readonly unroutedQueue?: UnroutedQueueDescriptor | null;
};

export type RoutingCoverageItem = {
  readonly originUnitId: string;
  readonly originUnitPath: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly hasExactRule: boolean;
  readonly resolution: RoutingResolution;
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

export type RoutingHandlerGroup = {
  readonly id: string;
  readonly name: string;
};

export type CreateRoutingRuleInput = {
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly groupId: string;
  readonly reason: string;
};

export function listRoutingHandlerGroups(): Promise<
  readonly RoutingHandlerGroup[]
> {
  return apiRequest("/routing/groups");
}

export function listRoutingCoverage(): Promise<readonly RoutingCoverageItem[]> {
  return apiRequest("/routing/coverage");
}

export function listRoutingRules(): Promise<readonly RoutingRuleResponse[]> {
  return apiRequest("/routing/rules");
}

export function resolveRouting(
  originUnitId: string,
  serviceId: string,
): Promise<RoutingResolution> {
  const search = new URLSearchParams({ originUnitId, serviceId });
  return apiRequest(`/routing/resolve?${search.toString()}`);
}

export type UpdateRoutingRuleInput = {
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly groupId: string;
  readonly reason: string;
};

export type DeleteRoutingRuleInput = {
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly reason: string;
};

export type RoutingChangeLogEntry = {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly reason: string;
  readonly actorUserId: string | null;
  readonly actorDisplayName: string | null;
  readonly createdAt: string;
  readonly diff: {
    readonly action: string;
    readonly changes: readonly {
      readonly path: string;
      readonly before: unknown;
      readonly after: unknown;
    }[];
  };
};

export type RoutingRuleDeleteImpact = {
  readonly ruleId: string;
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly before: RoutingResolution;
  readonly after: RoutingResolution;
};

export function createRoutingRule(
  input: CreateRoutingRuleInput,
): Promise<unknown> {
  return apiRequest("/routing/rules", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateRoutingRule(
  ruleId: string,
  input: UpdateRoutingRuleInput,
): Promise<RoutingRuleResponse> {
  return apiRequest(`/routing/rules/${ruleId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteRoutingRule(
  ruleId: string,
  input: DeleteRoutingRuleInput,
): Promise<RoutingRuleDeleteImpact> {
  return apiRequest(`/routing/rules/${ruleId}`, {
    method: "DELETE",
    body: JSON.stringify(input),
  });
}

export function getRoutingRuleDeleteImpact(
  ruleId: string,
): Promise<RoutingRuleDeleteImpact> {
  return apiRequest(`/routing/rules/${ruleId}/delete-impact`);
}

export function listRoutingChanges(): Promise<readonly RoutingChangeLogEntry[]> {
  return apiRequest("/routing/changes");
}
