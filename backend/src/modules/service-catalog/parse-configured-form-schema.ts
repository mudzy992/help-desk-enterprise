import type { ServiceFormSchema } from './form-schema.types';
import { parseFormSchema } from './parse-form-schema';
import { ServiceFormsError } from './service-forms.error';
import { assertServiceFormPatternsSafe } from './assert-service-form-patterns-safe';
import type { ServiceFormsConfiguration } from './service-forms.types';

export function parseConfiguredFormSchema(
  input: unknown,
  configuration: ServiceFormsConfiguration,
): ServiceFormSchema {
  const schema = parseConfiguredSchemaShape(input, configuration);
  assertServiceFormPatternsSafe(schema);
  return schema;
}

/**
 * Compatibility parser for catalog snapshots that may carry unchanged legacy
 * DRAFT/RETIRED schemas. Callers must compare against live state and invoke
 * `assertServiceFormPatternsSafe` before changing a schema or activating it.
 */
export function parseConfiguredLegacyFormSchema(
  input: unknown,
  configuration: ServiceFormsConfiguration,
): ServiceFormSchema {
  return parseConfiguredSchemaShape(input, configuration);
}

function parseConfiguredSchemaShape(
  input: unknown,
  configuration: ServiceFormsConfiguration,
): ServiceFormSchema {
  const schema = parseFormSchema(input);
  if (configuration.requireStructuredFields && schema.fields.length === 0) {
    throw new ServiceFormsError('INVALID_FORM_SCHEMA');
  }
  return schema;
}
