import type { TicketPriority } from "@/services/tickets-api";
import type { SlaRule } from "@/services/sla-types";

const PRIORITY_ORDER: readonly TicketPriority[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
];

export function isBaselineSlaRule(rule: SlaRule): boolean {
  return rule.organizationalUnitId === null && rule.serviceId === null;
}

export function selectBaselineSlaRules(
  rules: readonly SlaRule[],
): readonly SlaRule[] {
  const byPriority = new Map<string, SlaRule>();
  for (const rule of rules) {
    if (!isBaselineSlaRule(rule)) {
      continue;
    }
    const current = byPriority.get(rule.priority);
    if (current === undefined || rule.evaluationOrder < current.evaluationOrder) {
      byPriority.set(rule.priority, rule);
    }
  }
  return PRIORITY_ORDER.flatMap((priority) => {
    const rule = byPriority.get(priority);
    return rule === undefined ? [] : [rule];
  });
}

export function selectOverrideSlaRules(
  rules: readonly SlaRule[],
): readonly SlaRule[] {
  return rules.filter((rule) => !isBaselineSlaRule(rule));
}
