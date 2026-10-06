import type { ServiceFormField, ServiceFormSchema } from './form-schema.types';

export type ServiceFormDataValidationCode = 'REQUIRED' | 'INVALID';

export type ServiceFormDataValidationError = {
  readonly fieldId: string;
  readonly code: ServiceFormDataValidationCode;
};

type ValidationOptions = {
  /** Validate only fields explicitly present in `formData` (PATCH semantics). */
  readonly partial?: boolean;
};

/**
 * Server-side counterpart to `frontend/src/lib/tickets/validate-service-form.ts`.
 * The schema is trusted only after `parseFormSchema`; submitted data is not.
 * Unknown keys are rejected so API clients cannot persist unmodelled data.
 */
export function validateServiceFormData(
  schema: ServiceFormSchema | null,
  formData: unknown,
  options: ValidationOptions = {},
): readonly ServiceFormDataValidationError[] {
  const data = toFormDataRecord(formData, options.partial === true);
  if (data === null) {
    return [{ fieldId: 'formData', code: 'INVALID' }];
  }

  const fields = schema?.fields ?? [];
  const knownFieldIds = new Set(fields.map((field) => field.id));
  const errors: ServiceFormDataValidationError[] = [];
  for (const key of Object.keys(data)) {
    if (!knownFieldIds.has(key)) {
      errors.push({ fieldId: key, code: 'INVALID' });
    }
  }

  for (const field of fields) {
    if (options.partial === true && !Object.hasOwn(data, field.id)) {
      continue;
    }
    const error = validateField(field, data[field.id]);
    if (error !== null) {
      errors.push(error);
    }
  }
  return errors;
}

function toFormDataRecord(
  value: unknown,
  partial: boolean,
): Record<string, unknown> | null {
  if (value === undefined || value === null) {
    return partial && value === null ? null : {};
  }
  if (
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
  ) {
    return null;
  }
  return value as Record<string, unknown>;
}

function validateField(
  field: ServiceFormField,
  value: unknown,
): ServiceFormDataValidationError | null {
  if (field.type === 'boolean') {
    if (value === undefined || value === null) {
      return field.required ? required(field.id) : null;
    }
    return typeof value === 'boolean' ? null : invalid(field.id);
  }

  if (field.type === 'multiselect') {
    if (value === undefined || value === null) {
      return field.required ? required(field.id) : null;
    }
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      return invalid(field.id);
    }
    if (field.required && value.length === 0) {
      return required(field.id);
    }
    const minItems = field.validation?.minItems;
    const maxItems = field.validation?.maxItems;
    if (
      (minItems !== undefined && value.length < minItems) ||
      (maxItems !== undefined && value.length > maxItems)
    ) {
      return invalid(field.id);
    }
    return null;
  }

  if (field.type === 'number') {
    if (isEmptyNumber(value)) {
      return field.required ? required(field.id) : null;
    }
    if (typeof value !== 'number' && typeof value !== 'string') {
      return invalid(field.id);
    }
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
      return invalid(field.id);
    }
    if (field.validation?.integer === true && !Number.isInteger(numeric)) {
      return invalid(field.id);
    }
    if (
      (field.validation?.min !== undefined && numeric < field.validation.min) ||
      (field.validation?.max !== undefined && numeric > field.validation.max)
    ) {
      return invalid(field.id);
    }
    return null;
  }

  if (value === undefined || value === null) {
    return field.required ? required(field.id) : null;
  }
  if (typeof value !== 'string') {
    return invalid(field.id);
  }
  const text = value.trim();
  if (field.required && text.length === 0) {
    return required(field.id);
  }
  if (text.length === 0) {
    return null;
  }
  const minLength = field.validation?.minLength;
  const maxLength = field.validation?.maxLength;
  if (
    (minLength !== undefined && text.length < minLength) ||
    (maxLength !== undefined && text.length > maxLength)
  ) {
    return invalid(field.id);
  }
  if (field.type === 'email' && !text.includes('@')) {
    return invalid(field.id);
  }
  const pattern = field.validation?.pattern;
  if (pattern !== undefined && !new RegExp(pattern).test(text)) {
    return invalid(field.id);
  }
  return null;
}

function isEmptyNumber(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (typeof value === 'string' && value.trim().length === 0)
  );
}

function required(fieldId: string): ServiceFormDataValidationError {
  return { fieldId, code: 'REQUIRED' };
}

function invalid(fieldId: string): ServiceFormDataValidationError {
  return { fieldId, code: 'INVALID' };
}
