export type RoutingRuleGroupReference = {
  readonly groupId: string;
};

export function countRoutingRulesByGroup(
  rules: readonly RoutingRuleGroupReference[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const rule of rules) {
    counts.set(rule.groupId, (counts.get(rule.groupId) ?? 0) + 1);
  }
  return counts;
}
