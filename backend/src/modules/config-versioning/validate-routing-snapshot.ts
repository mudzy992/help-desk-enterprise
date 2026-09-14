import { routingOutcomes } from '../routing/routing.constants';
import { walkOrganizationalUnitAncestors } from '../routing/load-organizational-unit-ancestors';
import { resolveFromAncestorChain } from '../routing/resolve-ticket-routing';
import type { RoutingRuleRecord } from '../routing/routing.types';
import type {
  ConfigSnapshot,
  ConfigValidationIssue,
} from './config-versioning.types';

export function validateRoutingSnapshot(
  snapshot: ConfigSnapshot,
): readonly ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];
  const unitIds = new Set(
    snapshot.references.organizationalUnits.map((unit) => unit.id),
  );
  const groupIds = new Set(snapshot.references.groups.map((group) => group.id));
  const serviceIds = new Set(snapshot.catalog.services.map((service) => service.id));
  for (const rule of snapshot.routing.rules) {
    if (!unitIds.has(rule.originUnitId)) {
      issues.push(issue('ROUTING_ORIGIN_MISSING', `routing.rules.${rule.id}.originUnitId`));
    }
    if (!serviceIds.has(rule.serviceId)) {
      issues.push(issue('ROUTING_SERVICE_MISSING', `routing.rules.${rule.id}.serviceId`));
    }
    if (!groupIds.has(rule.groupId)) {
      issues.push(issue('ROUTING_GROUP_MISSING', `routing.rules.${rule.id}.groupId`));
    }
  }
  const unitById = new Map(
    snapshot.references.organizationalUnits.map((unit) => [unit.id, unit]),
  );
  const rulesByService = new Map<string, Map<string, RoutingRuleRecord>>();
  for (const rule of snapshot.routing.rules) {
    const byOrigin = rulesByService.get(rule.serviceId) ?? new Map();
    byOrigin.set(rule.originUnitId, {
      ...rule,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    rulesByService.set(rule.serviceId, byOrigin);
  }
  const activeServices = snapshot.catalog.services.filter(
    (service) => service.lifecycle === 'ACTIVE',
  );
  for (const service of activeServices) {
    const ruleByOrigin = rulesByService.get(service.id) ?? new Map();
    for (const origin of snapshot.references.organizationalUnits) {
      const resolution = resolveFromAncestorChain({
        originUnitId: origin.id,
        serviceId: service.id,
        ancestors: walkOrganizationalUnitAncestors(origin.id, unitById),
        ruleByOrigin,
        configuration: snapshot.routing.configuration,
      });
      if (
        resolution.outcome === routingOutcomes.unrouted &&
        !snapshot.routing.configuration.unroutedQueueEnabled
      ) {
        issues.push(
          issue(
            'ROUTING_UNCOVERED',
            `routing.coverage.${origin.id}.${service.id}`,
          ),
        );
      }
    }
  }
  return issues;
}

function issue(code: string, path: string): ConfigValidationIssue {
  return { code, path, message: code };
}
