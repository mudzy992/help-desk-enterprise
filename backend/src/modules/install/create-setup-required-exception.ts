import { ServiceUnavailableException } from '@nestjs/common';
import { installSetupErrorCodes } from './install-setup.constants';

export function createSetupRequiredException(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: installSetupErrorCodes.setupRequired,
    message: 'Application setup is required',
  });
}
