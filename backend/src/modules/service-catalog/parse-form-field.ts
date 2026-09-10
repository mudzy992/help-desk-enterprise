import { assertFormFieldIdentifier } from './assert-form-field-identifier';
import { assertKnownObjectKeys } from './assert-known-object-keys';
import {
  serviceFormFieldTypes,
  serviceFormSchemaConstants,
} from './form-schema.constants';
import type { ServiceFormField, ServiceFormFieldType } from './form-schema.types';
import { isPlainObject } from './is-plain-object';
import { parseFormFieldConfig } from './parse-form-field-config';
import { parseFormFieldValidation } from './parse-form-field-validation';
import { ServiceFormsError } from './service-forms.error';

export function parseFormField(value: unknown): ServiceFormField {
  if (!isPlainObject(value)) {
    throw new ServiceFormsError('INVALID_FORM_SCHEMA');
  }
  assertKnownObjectKeys(value, [
    'id',
    'label',
    'type',
    'required',
    'order',
    'validation',
    'config',
  ]);
  const type = parseFieldType(value.type);
  const field: ServiceFormField = {
    id: assertFormFieldIdentifier(value.id),
    label: parseLabel(value.label),
    type,
    required: parseRequired(value.required),
    order: parseOrder(value.order),
    validation: parseFormFieldValidation(type, value.validation),
    config: parseFormFieldConfig(value.config),
  };
  return omitUndefined(field);
}

function parseFieldType(value: unknown): ServiceFormFieldType {
  if (
    typeof value !== 'string' ||
    !(serviceFormFieldTypes as readonly string[]).includes(value)
  ) {
    throw new ServiceFormsError('INVALID_FIELD_CONFIGURATION');
  }
  return value as ServiceFormFieldType;
}

function parseLabel(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ServiceFormsError('INVALID_FORM_SCHEMA');
  }
  const label = value.trim();
  if (label.length > serviceFormSchemaConstants.maximumLabelLength) {
    throw new ServiceFormsError('INVALID_FORM_SCHEMA');
  }
  return label;
}

function parseRequired(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new ServiceFormsError('INVALID_FORM_SCHEMA');
  }
  return value;
}

function parseOrder(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ServiceFormsError('INVALID_FORM_SCHEMA');
  }
  return value;
}

function omitUndefined(field: ServiceFormField): ServiceFormField {
  return {
    id: field.id,
    label: field.label,
    type: field.type,
    required: field.required,
    order: field.order,
    ...(field.validation === undefined ? {} : { validation: field.validation }),
    ...(field.config === undefined ? {} : { config: field.config }),
  };
}
