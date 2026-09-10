import { ServiceFormsError } from './service-forms.error';
import type { ServiceFormsConfiguration } from './service-forms.types';

export function assertServiceFormsEnabled(
  configuration: ServiceFormsConfiguration,
): void {
  if (!configuration.enabled) {
    throw new ServiceFormsError('FORMS_DISABLED');
  }
}

export function assertFormVersioningEnabled(
  configuration: ServiceFormsConfiguration,
): void {
  assertServiceFormsEnabled(configuration);
  if (!configuration.versioningEnabled) {
    throw new ServiceFormsError('FORM_VERSIONING_DISABLED');
  }
}
