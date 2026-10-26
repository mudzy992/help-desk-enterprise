import type { RoutingRuleRecord } from './routing.types';

type StringFilter = string | { readonly in?: readonly string[]; readonly gt?: string };

export type InMemoryRoutingRuleWhere = {
  originUnitId?: StringFilter;
  serviceId?: StringFilter;
  id?: StringFilter;
  OR?: readonly InMemoryRoutingRuleWhere[];
  AND?: readonly InMemoryRoutingRuleWhere[];
};

export function matchesInMemoryRoutingRule(
  rule: RoutingRuleRecord,
  where?: InMemoryRoutingRuleWhere,
): boolean {
  if (where === undefined) return true;
  if (!matchesString(rule.id, where.id)) return false;
  if (!matchesString(rule.serviceId, where.serviceId)) return false;
  if (!matchesString(rule.originUnitId, where.originUnitId)) return false;
  if (where.AND !== undefined && !where.AND.every((part) => matchesInMemoryRoutingRule(rule, part))) {
    return false;
  }
  return where.OR === undefined || where.OR.some((part) => matchesInMemoryRoutingRule(rule, part));
}

function matchesString(value: string, filter?: StringFilter): boolean {
  if (filter === undefined) return true;
  if (typeof filter === 'string') return value === filter;
  if (filter.in !== undefined && !filter.in.includes(value)) return false;
  if (filter.gt !== undefined && value <= filter.gt) return false;
  return true;
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
