import { assertKnownObjectKeys } from './assert-known-object-keys';
import {
  serviceFormSchemaConstants,
  serviceFormSchemaVersion,
} from './form-schema.constants';
import type { ServiceFormField, ServiceFormSchema } from './form-schema.types';
import { isPlainObject } from './is-plain-object';
import { parseFormField } from './parse-form-field';
import { ServiceFormsError } from './service-forms.error';

export function parseFormSchema(input: unknown): ServiceFormSchema {
  if (!isPlainObject(input)) {
    throw new ServiceFormsError('INVALID_FORM_SCHEMA');
  }
  assertKnownObjectKeys(input, ['schemaVersion', 'fields']);
  if (input.schemaVersion !== serviceFormSchemaVersion) {
    throw new ServiceFormsError('INVALID_FORM_SCHEMA');
  }
  if (!Array.isArray(input.fields)) {
    throw new ServiceFormsError('INVALID_FORM_SCHEMA');
  }
  if (input.fields.length > serviceFormSchemaConstants.maximumFieldCount) {
    throw new ServiceFormsError('INVALID_FORM_SCHEMA');
  }
  const fields = input.fields.map((field) => parseFormField(field));
  assertUniqueFieldIdentifiers(fields);
  assertUniqueFieldOrders(fields);
  return {
    schemaVersion: serviceFormSchemaVersion,
    fields: [...fields].sort((left, right) => left.order - right.order),
  };
}

function assertUniqueFieldIdentifiers(fields: readonly ServiceFormField[]): void {
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.id)) {
      throw new ServiceFormsError('DUPLICATE_FIELD_IDENTIFIER');
    }
    seen.add(field.id);
  }
}

function assertUniqueFieldOrders(fields: readonly ServiceFormField[]): void {
  const seen = new Set<number>();
  for (const field of fields) {
    if (seen.has(field.order)) {
      throw new ServiceFormsError('INVALID_FORM_SCHEMA');
    }
    seen.add(field.order);
  }
}
