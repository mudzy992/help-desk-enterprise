import { serviceFormSchemaConstants } from './form-schema.constants';
import type { ServiceFormFieldConfig } from './form-schema.types';
import { assertKnownObjectKeys } from './assert-known-object-keys';
import { isPlainObject } from './is-plain-object';
import { ServiceFormsError } from './service-forms.error';

export function parseFormFieldConfig(value: unknown): ServiceFormFieldConfig | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    throw new ServiceFormsError('INVALID_FIELD_CONFIGURATION');
  }
  assertKnownObjectKeys(value, ['placeholder', 'helpText'], 'INVALID_FIELD_CONFIGURATION');
  const placeholder = parseOptionalText(
    value.placeholder,
    serviceFormSchemaConstants.maximumLabelLength,
  );
  const helpText = parseOptionalText(
    value.helpText,
    serviceFormSchemaConstants.maximumHelpTextLength,
  );
  if (placeholder === undefined && helpText === undefined) {
    return undefined;
  }
  return {
    ...(placeholder === undefined ? {} : { placeholder }),
    ...(helpText === undefined ? {} : { helpText }),
  };
}

function parseOptionalText(value: unknown, maximumLength: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ServiceFormsError('INVALID_FIELD_CONFIGURATION');
  }
  const trimmed = value.trim();
  if (trimmed.length > maximumLength) {
    throw new ServiceFormsError('INVALID_FIELD_CONFIGURATION');
  }
  return trimmed;
}
