import type { TicketStatus } from '../../../generated/prisma/enums';
import type { ServiceFormField } from '../../service-catalog/form-schema.types';
import type { TicketCloseCodesConfiguration } from '../close-codes/close-codes.types';
import { requiredFieldKeys } from './required-fields.constants';
import type { TicketRequiredFieldsConfiguration } from './required-fields.types';

export function isResolveOrCloseStatus(status: TicketStatus): boolean {
  return status === 'RESOLVED' || status === 'CLOSED';
}

export function collectMissingRequiredFields(input: {
  readonly currentStatus: TicketStatus;
  readonly nextStatus: TicketStatus;
  readonly closeCodeKey: string | null;
  readonly resolutionNote: string | null;
  readonly formData: unknown;
  readonly schemaFields: readonly ServiceFormField[];
  readonly serviceId: string;
  readonly closeCodes: TicketCloseCodesConfiguration;
  readonly requiredFields: TicketRequiredFieldsConfiguration;
}): readonly string[] {
  if (
    input.nextStatus === input.currentStatus ||
    !isResolveOrCloseStatus(input.nextStatus)
  ) {
    return [];
  }
  const missing: string[] = [];
  if (requiresCloseCode(input)) {
    if (input.closeCodeKey === null || input.closeCodeKey.trim().length === 0) {
      missing.push(requiredFieldKeys.closeCode);
    }
  }
  if (!input.requiredFields.enabled) {
    return missing;
  }
  const requiredKeys = effectiveRequiredKeys(input);
  if (
    requiredKeys.includes(requiredFieldKeys.resolutionNote) &&
    (input.resolutionNote === null || input.resolutionNote.trim().length === 0)
  ) {
    missing.push(requiredFieldKeys.resolutionNote);
  }
  const formData = asFormData(input.formData);
  for (const key of requiredKeys) {
    if (
      key === requiredFieldKeys.closeCode ||
      key === requiredFieldKeys.resolutionNote
    ) {
      continue;
    }
    if (!isFormValuePresent(formData[key])) {
      missing.push(key);
    }
  }
  if (input.requiredFields.enforceSchemaRequiredFields) {
    for (const field of input.schemaFields) {
      if (field.required && !isFormValuePresent(formData[field.id])) {
        if (!missing.includes(field.id)) {
          missing.push(field.id);
        }
      }
    }
  }
  return missing;
}

function requiresCloseCode(input: {
  readonly nextStatus: TicketStatus;
  readonly closeCodes: TicketCloseCodesConfiguration;
  readonly requiredFields: TicketRequiredFieldsConfiguration;
  readonly serviceId: string;
}): boolean {
  if (!input.closeCodes.enabled) {
    return false;
  }
  if (input.closeCodes.requireOnResolve && input.nextStatus === 'RESOLVED') {
    return true;
  }
  return (
    input.requiredFields.enabled &&
    effectiveRequiredKeys(input).includes(requiredFieldKeys.closeCode)
  );
}

function effectiveRequiredKeys(input: {
  readonly requiredFields: TicketRequiredFieldsConfiguration;
  readonly serviceId: string;
}): readonly string[] {
  const extra = input.requiredFields.byService[input.serviceId] ?? [];
  return [
    ...input.requiredFields.globalRequiredOnResolve,
    ...extra,
  ];
}

function asFormData(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function isFormValuePresent(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}
