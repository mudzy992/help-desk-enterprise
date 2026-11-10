import type { ServiceFormSchema } from './form-schema.types';
import { parseFormSchema } from './parse-form-schema';
import { ServiceFormsError } from './service-forms.error';
import type { ServiceFormsConfiguration } from './service-forms.types';

export function parseConfiguredFormSchema(
  input: unknown,
  configuration: ServiceFormsConfiguration,
): ServiceFormSchema {
  const schema = parseFormSchema(input);
  if (configuration.requireStructuredFields && schema.fields.length === 0) {
    throw new ServiceFormsError('INVALID_FORM_SCHEMA');
  }
  return schema;
}
