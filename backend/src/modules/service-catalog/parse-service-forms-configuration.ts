import { ServiceFormsError } from './service-forms.error';
import type { ServiceFormsConfiguration } from './service-forms.types';

export function parseServiceFormsConfiguration(input: {
  readonly enabled: unknown;
  readonly requireStructuredFields: unknown;
  readonly versioningEnabled: unknown;
  readonly allowMultipleActiveVersions: unknown;
  readonly requireVersionOnTicket: unknown;
}): ServiceFormsConfiguration {
  if (
    typeof input.enabled !== 'boolean' ||
    typeof input.requireStructuredFields !== 'boolean' ||
    typeof input.versioningEnabled !== 'boolean' ||
    typeof input.allowMultipleActiveVersions !== 'boolean' ||
    typeof input.requireVersionOnTicket !== 'boolean'
  ) {
    throw new ServiceFormsError('FORMS_UNAVAILABLE');
  }
  return {
    enabled: input.enabled,
    requireStructuredFields: input.requireStructuredFields,
    versioningEnabled: input.versioningEnabled,
    allowMultipleActiveVersions: input.allowMultipleActiveVersions,
    requireVersionOnTicket: input.requireVersionOnTicket,
  };
}
