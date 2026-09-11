import { TicketsError } from '../tickets.error';
import {
  defaultTicketGuardrailsConfiguration,
  disabledTicketGuardrailsConfiguration,
  guardrailModes,
  type GuardrailMode,
} from './guardrails.constants';
import type { TicketGuardrailsConfiguration } from './guardrails.types';

export function parseTicketGuardrailsConfiguration(input: {
  readonly enabled: unknown;
  readonly duplicateWindowMinutes: unknown;
  readonly similarityThreshold: unknown;
  readonly mode: unknown;
  readonly confirmAboveRecipients: unknown;
}): TicketGuardrailsConfiguration {
  const confirmAboveRecipients = parseConfirmAbove(input.confirmAboveRecipients);
  if (input.enabled === false) {
    return {
      ...disabledTicketGuardrailsConfiguration,
      confirmAboveRecipients,
    };
  }
  if (
    input.enabled !== true ||
    typeof input.duplicateWindowMinutes !== 'number' ||
    typeof input.similarityThreshold !== 'number' ||
    typeof input.mode !== 'string' ||
    typeof input.confirmAboveRecipients !== 'number'
  ) {
    throw new TicketsError('GUARDRAILS_UNAVAILABLE');
  }
  const mode = input.mode.trim() as GuardrailMode;
  if (!guardrailModes.includes(mode)) {
    throw new TicketsError('GUARDRAILS_UNAVAILABLE');
  }
  if (
    !isPositiveFinite(input.duplicateWindowMinutes) ||
    !isUnitInterval(input.similarityThreshold)
  ) {
    throw new TicketsError('GUARDRAILS_UNAVAILABLE');
  }
  return {
    enabled: true,
    duplicateWindowMinutes: input.duplicateWindowMinutes,
    similarityThreshold: input.similarityThreshold,
    mode,
    confirmAboveRecipients,
    maxRepeatsPerSubject: defaultTicketGuardrailsConfiguration.maxRepeatsPerSubject,
  };
}

function parseConfirmAbove(value: unknown): number {
  if (typeof value !== 'number' || !isPositiveFinite(value)) {
    throw new TicketsError('GUARDRAILS_UNAVAILABLE');
  }
  return value;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isUnitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}
