import { serviceFormSchemaConstants } from './form-schema.constants';
import type { ServiceFormFieldOption } from './form-schema.types';
import { isPlainObject } from './is-plain-object';
import { ServiceFormsError } from './service-forms.error';

export function parseFormFieldOptions(value: unknown): readonly ServiceFormFieldOption[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ServiceFormsError('INVALID_FIELD_CONFIGURATION');
  }
  if (value.length > serviceFormSchemaConstants.maximumOptionCount) {
    throw new ServiceFormsError('INVALID_FIELD_CONFIGURATION');
  }
  const seen = new Set<string>();
  return value.map((item) => parseOption(item, seen));
}

function parseOption(
  value: unknown,
  seen: Set<string>,
): ServiceFormFieldOption {
  if (!isPlainObject(value)) {
    throw new ServiceFormsError('INVALID_FIELD_CONFIGURATION');
  }
  if (
    typeof value.value !== 'string' ||
    value.value.length === 0 ||
    typeof value.label !== 'string' ||
    value.label.trim().length === 0
  ) {
    throw new ServiceFormsError('INVALID_FIELD_CONFIGURATION');
  }
  if (seen.has(value.value)) {
    throw new ServiceFormsError('INVALID_FIELD_CONFIGURATION');
  }
  seen.add(value.value);
  return { value: value.value, label: value.label.trim() };
}
