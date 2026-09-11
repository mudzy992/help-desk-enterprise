import type { TicketPriority } from '../../generated/prisma/enums';
import type { SlaRuleRecord } from './sla.types';

export function slaRuleSpecificity(rule: SlaRuleRecord): number {
  return (
    (rule.serviceId === null ? 0 : 2) +
    (rule.organizationalUnitId === null ? 0 : 1)
  );
}

export function doesSlaRuleMatch(
  rule: SlaRuleRecord,
  input: {
    readonly priority: TicketPriority;
    readonly serviceId?: string;
    readonly organizationalUnitId?: string;
  },
): boolean {
  if (rule.priority !== input.priority) {
    return false;
  }
  if (rule.serviceId !== null && rule.serviceId !== input.serviceId) {
    return false;
  }
  if (
    rule.organizationalUnitId !== null &&
    rule.organizationalUnitId !== input.organizationalUnitId
  ) {
    return false;
  }
  return true;
}

export function compareSlaRuleEvaluationOrder(
  left: SlaRuleRecord,
  right: SlaRuleRecord,
): number {
  if (left.evaluationOrder !== right.evaluationOrder) {
    return left.evaluationOrder - right.evaluationOrder;
  }
  const specificityDelta = slaRuleSpecificity(right) - slaRuleSpecificity(left);
  if (specificityDelta !== 0) {
    return specificityDelta;
  }
  return left.id.localeCompare(right.id);
}

export function resolveMatchingSlaRule(
  rules: readonly SlaRuleRecord[],
  input: {
    readonly priority: TicketPriority;
    readonly serviceId?: string;
    readonly organizationalUnitId?: string;
  },
): SlaRuleRecord | null {
  const matches = rules
    .filter((rule) => doesSlaRuleMatch(rule, input))
    .sort(compareSlaRuleEvaluationOrder);
  return matches[0] ?? null;
}
