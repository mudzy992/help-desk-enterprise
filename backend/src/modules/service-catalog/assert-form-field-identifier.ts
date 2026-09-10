import { serviceFormFieldIdentifierPattern } from './form-schema.constants';
import { ServiceFormsError } from './service-forms.error';

export function assertFormFieldIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !serviceFormFieldIdentifierPattern.test(value)) {
    throw new ServiceFormsError('INVALID_FIELD_IDENTIFIER');
  }
  return value;
}
