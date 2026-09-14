import { walkOrganizationalUnitAncestors } from '../routing/load-organizational-unit-ancestors';
import { resolveFromAncestorChain } from '../routing/resolve-ticket-routing';
import type { RoutingRuleRecord } from '../routing/routing.types';
import { resolveMatchingSlaRule } from '../sla/resolve-matching-sla-rule';
import type { SlaRuleRecord } from '../sla/sla.types';
import type {
  ConfigShadowDiff,
  ConfigSnapshot,
  ShadowTicketSample,
} from './config-versioning.types';

export function computeShadowDiff(
  active: ConfigSnapshot,
  candidate: ConfigSnapshot,
  tickets: readonly ShadowTicketSample[],
): ConfigShadowDiff {
  let routingGroupMismatches = 0;
  let slaRuleMismatches = 0;
  for (const ticket of tickets) {
    const activeGroup = resolveGroup(active, ticket);
    const candidateGroup = resolveGroup(candidate, ticket);
    if (activeGroup !== candidateGroup) {
      routingGroupMismatches += 1;
    }
    const activeRule = resolveSlaRuleId(active, ticket);
    const candidateRule = resolveSlaRuleId(candidate, ticket);
    if (activeRule !== candidateRule) {
      slaRuleMismatches += 1;
    }
  }
  return {
    sampleSize: tickets.length,
    routingGroupMismatches,
    slaRuleMismatches,
  };
}

function resolveGroup(
  snapshot: ConfigSnapshot,
  ticket: ShadowTicketSample,
): string | null {
  const unitById = new Map(
    snapshot.references.organizationalUnits.map((unit) => [unit.id, unit]),
  );
  if (!unitById.has(ticket.originUnitId)) {
    return null;
  }
  const ruleByOrigin = new Map<string, RoutingRuleRecord>();
  for (const rule of snapshot.routing.rules) {
    if (rule.serviceId === ticket.serviceId) {
      ruleByOrigin.set(rule.originUnitId, {
        ...rule,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      });
    }
  }
  return resolveFromAncestorChain({
    originUnitId: ticket.originUnitId,
    serviceId: ticket.serviceId,
    ancestors: walkOrganizationalUnitAncestors(ticket.originUnitId, unitById),
    ruleByOrigin,
    configuration: snapshot.routing.configuration,
  }).groupId;
}

function resolveSlaRuleId(
  snapshot: ConfigSnapshot,
  ticket: ShadowTicketSample,
): string | null {
  const service = snapshot.catalog.services.find(
    (entry) => entry.id === ticket.serviceId,
  );
  if (service?.slaProfileId === null || service === undefined) {
    return null;
  }
  const rules = snapshot.sla.rules.filter(
    (rule) => rule.slaProfileId === service.slaProfileId,
  ) as SlaRuleRecord[];
  return (
    resolveMatchingSlaRule(rules, {
      priority: ticket.priority,
      serviceId: ticket.serviceId,
      organizationalUnitId: ticket.originUnitId,
    })?.id ?? null
  );
}
