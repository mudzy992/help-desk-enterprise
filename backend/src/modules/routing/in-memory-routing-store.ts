import type { RoutingRuleRecord } from './routing.types';

export type InMemoryRoutingRuleWhere = {
  originUnitId?: string | { in: readonly string[] };
  serviceId?: string;
};

export function matchesInMemoryRoutingRule(
  rule: RoutingRuleRecord,
  where?: InMemoryRoutingRuleWhere,
): boolean {
  if (where === undefined) {
    return true;
  }
  if (where.serviceId !== undefined && rule.serviceId !== where.serviceId) {
    return false;
  }
  if (where.originUnitId === undefined) {
    return true;
  }
  if (typeof where.originUnitId === 'string') {
    return rule.originUnitId === where.originUnitId;
  }
  return where.originUnitId.in.includes(rule.originUnitId);
}

export function pickInMemoryFields<T extends object>(
  record: T | undefined,
  select?: Record<string, boolean>,
): T | Record<string, unknown> | null {
  if (record === undefined) {
    return null;
  }
  if (select === undefined) {
    return record;
  }
  const picked: Record<string, unknown> = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled) {
      picked[key] = record[key as keyof T];
    }
  }
  return picked;
}
