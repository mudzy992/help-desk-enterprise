import { apiRequest } from "@/services/api";

export type RoutingOutcome = "EXACT" | "PARENT_FALLBACK" | "UNROUTED";

export type RoutingResolution = {
  readonly outcome: RoutingOutcome;
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly groupId: string | null;
  readonly matchedRuleId: string | null;
  readonly matchedOriginUnitId: string | null;
  readonly fallbackDepth: number;
  readonly fallbackPath: readonly string[];
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
  readonly groupId: string;
  readonly groupName: string;
};

export type CreateRoutingRuleInput = {
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly groupId: string;
};

export function listRoutingCoverage(): Promise<readonly RoutingCoverageItem[]> {
  return apiRequest("/routing/coverage");
}

export function listRoutingRules(): Promise<readonly RoutingRuleResponse[]> {
  return apiRequest("/routing/rules");
}

export function createRoutingRule(
  input: CreateRoutingRuleInput,
): Promise<unknown> {
  return apiRequest("/routing/rules", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
