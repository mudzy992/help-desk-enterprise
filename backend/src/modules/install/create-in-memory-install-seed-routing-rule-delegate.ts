import {
  matchesInMemoryRoutingRule,
  type InMemoryRoutingRuleWhere,
} from '../routing/in-memory-routing-store';
import type { RoutingRuleRecord } from '../routing/routing.types';

/** Routing-rule double used by the install seed: unique `(originUnitId, serviceId)`
 * pair, P2002 on duplicates and a single forced failure for rollback tests. */
export function createSeedRoutingRuleDelegate(
  rules: Map<string, RoutingRuleRecord>,
  nextId: () => string,
  now: () => Date,
  shouldFail: () => boolean,
) {
  return {
    findMany: async ({
      where,
    }: {
      where?: InMemoryRoutingRuleWhere;
    } = {}) =>
      [...rules.values()]
        .filter((rule) => matchesInMemoryRoutingRule(rule, where))
        .sort((left, right) => left.serviceId.localeCompare(right.serviceId)),
    create: async ({
      data,
    }: {
      data: { originUnitId: string; serviceId: string; groupId: string };
    }) => {
      if (shouldFail()) {
        throw new Error('forced-routing-create-failure');
      }
      for (const existing of rules.values()) {
        if (
          existing.originUnitId === data.originUnitId &&
          existing.serviceId === data.serviceId
        ) {
          throw {
            code: 'P2002',
            meta: { target: ['originUnitId', 'serviceId'] },
          };
        }
      }
      const created: RoutingRuleRecord = {
        id: nextId(),
        originUnitId: data.originUnitId,
        serviceId: data.serviceId,
        groupId: data.groupId,
        createdAt: now(),
        updatedAt: now(),
      };
      rules.set(created.id, created);
      return created;
    },
  };
}
