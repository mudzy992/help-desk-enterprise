import { slaConstants } from './sla.constants';
import { SlaError } from './sla.error';
import type { SlaConfiguration, SlaRuleRecord } from './sla.types';

export function normalizeSlaTargets(input: {
  readonly responseMinutes: number;
  readonly resolutionMinutes: number;
}): { readonly responseMinutes: number; readonly resolutionMinutes: number } {
  if (
    !Number.isInteger(input.responseMinutes) ||
    !Number.isInteger(input.resolutionMinutes) ||
    input.responseMinutes < 1 ||
    input.resolutionMinutes < 1 ||
    input.resolutionMinutes < input.responseMinutes
  ) {
    throw new SlaError('INVALID_SLA_TARGETS');
  }
  return {
    responseMinutes: input.responseMinutes,
    resolutionMinutes: input.resolutionMinutes,
  };
}

export function normalizeEvaluationOrder(value: number | undefined): number {
  const evaluationOrder = value ?? slaConstants.defaultEvaluationOrder;
  if (!Number.isInteger(evaluationOrder) || evaluationOrder < 0) {
    throw new SlaError('INVALID_EVALUATION_ORDER');
  }
  return evaluationOrder;
}

export function matchesSlaRuleKey(
  left: Pick<
    SlaRuleRecord,
    'priority' | 'organizationalUnitId' | 'serviceId'
  >,
  right: Pick<
    SlaRuleRecord,
    'priority' | 'organizationalUnitId' | 'serviceId'
  >,
): boolean {
  return (
    left.priority === right.priority &&
    (left.organizationalUnitId ?? null) === (right.organizationalUnitId ?? null) &&
    (left.serviceId ?? null) === (right.serviceId ?? null)
  );
}

export function assertOverrideFlagsAllowed(
  configuration: SlaConfiguration,
  input: {
    readonly organizationalUnitId: string | null;
    readonly serviceId: string | null;
  },
): void {
  if (input.serviceId !== null && !configuration.allowServiceOverrides) {
    throw new SlaError('SERVICE_OVERRIDE_DISABLED');
  }
  if (input.organizationalUnitId !== null && !configuration.allowOuOverrides) {
    throw new SlaError('OU_OVERRIDE_DISABLED');
  }
}
