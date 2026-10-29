import { configVersioningErrorCodes } from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';

export function assertConfigVersionReadyForActivation(status: string): void {
  if (status !== 'VALIDATED' && status !== 'SHADOW') {
    throw new ConfigVersioningError(configVersioningErrorCodes.validationFailed);
  }
}
