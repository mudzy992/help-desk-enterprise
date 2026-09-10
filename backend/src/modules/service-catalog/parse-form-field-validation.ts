import { serviceFormSchemaConstants } from './form-schema.constants';
import type {
  ServiceFormFieldType,
  ServiceFormFieldValidation,
} from './form-schema.types';
import { isPlainObject } from './is-plain-object';
import { parseFormFieldOptions } from './parse-form-field-options';
import { ServiceFormsError } from './service-forms.error';
import { assertKnownObjectKeys } from './assert-known-object-keys';

const textTypes = new Set<ServiceFormFieldType>(['text', 'textarea', 'email']);
const optionTypes = new Set<ServiceFormFieldType>(['select', 'multiselect']);

export function parseFormFieldValidation(
  type: ServiceFormFieldType,
  value: unknown,
): ServiceFormFieldValidation | undefined {
  if (value === undefined) {
    assertRequiredOptions(type, undefined);
    return undefined;
  }
  if (!isPlainObject(value)) {
    throw new ServiceFormsError('INVALID_FIELD_CONFIGURATION');
  }
  assertKnownObjectKeys(value, allowedValidationKeys, 'INVALID_FIELD_CONFIGURATION');
  const parsed = parseValidationObject(value);
  assertValidationMatchesType(type, parsed);
  assertRequiredOptions(type, parsed);
  return parsed;
}

function parseValidationObject(
  value: Record<string, unknown>,
): ServiceFormFieldValidation {
  const parsed: ServiceFormFieldValidation = {
    minLength: parseOptionalNonNegativeInteger(value.minLength),
    maxLength: parseOptionalNonNegativeInteger(value.maxLength),
    pattern: parseOptionalPattern(value.pattern),
    min: parseOptionalFiniteNumber(value.min),
    max: parseOptionalFiniteNumber(value.max),
    integer: parseOptionalBoolean(value.integer),
    minItems: parseOptionalNonNegativeInteger(value.minItems),
    maxItems: parseOptionalNonNegativeInteger(value.maxItems),
    options:
      value.options === undefined
        ? undefined
        : parseFormFieldOptions(value.options),
  };
  return Object.fromEntries(
    Object.entries(parsed).filter(([, entry]) => entry !== undefined),
  ) as ServiceFormFieldValidation;
}

function assertValidationMatchesType(
  type: ServiceFormFieldType,
  validation: ServiceFormFieldValidation,
): void {
  assertRange(validation.minLength, validation.maxLength);
  assertRange(validation.min, validation.max);
  assertRange(validation.minItems, validation.maxItems);
  if (textTypes.has(type)) {
    assertOnlyKeys(validation, ['minLength', 'maxLength', 'pattern']);
    return;
  }
  if (type === 'number') {
    assertOnlyKeys(validation, ['min', 'max', 'integer']);
    return;
  }
  if (type === 'multiselect') {
    assertOnlyKeys(validation, ['options', 'minItems', 'maxItems']);
    return;
  }
  if (type === 'select') {
    assertOnlyKeys(validation, ['options']);
    return;
  }
  assertOnlyKeys(validation, []);
}

function assertRequiredOptions(
  type: ServiceFormFieldType,
  validation: ServiceFormFieldValidation | undefined,
): void {
  if (optionTypes.has(type) && (validation?.options?.length ?? 0) === 0) {
    throw new ServiceFormsError('INVALID_FIELD_CONFIGURATION');
  }
}

function assertOnlyKeys(
  validation: ServiceFormFieldValidation,
  allowed: readonly (keyof ServiceFormFieldValidation)[],
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(validation) as (keyof ServiceFormFieldValidation)[]) {
    if (validation[key] !== undefined && !allowedKeys.has(key)) {
      throw new ServiceFormsError('INVALID_FIELD_CONFIGURATION');
    }
  }
}

function assertRange(min: number | undefined, max: number | undefined): void {
  if (min !== undefined && max !== undefined && min > max) {
    throw new ServiceFormsError('INVALID_FIELD_CONFIGURATION');
  }
}

function parseOptionalNonNegativeInteger(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ServiceFormsError('INVALID_FIELD_CONFIGURATION');
  }
  return value;
}

function parseOptionalFiniteNumber(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ServiceFormsError('INVALID_FIELD_CONFIGURATION');
  }
  return value;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new ServiceFormsError('INVALID_FIELD_CONFIGURATION');
  }
  return value;
}

function parseOptionalPattern(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > serviceFormSchemaConstants.maximumPatternLength
  ) {
    throw new ServiceFormsError('INVALID_FIELD_CONFIGURATION');
  }
  try {
    new RegExp(value);
  } catch {
    throw new ServiceFormsError('INVALID_FIELD_CONFIGURATION');
  }
  return value;
}

const allowedValidationKeys: readonly string[] = [
  'minLength',
  'maxLength',
  'pattern',
  'min',
  'max',
  'integer',
  'minItems',
  'maxItems',
  'options',
];
