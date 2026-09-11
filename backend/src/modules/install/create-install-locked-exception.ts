import { ConflictException } from '@nestjs/common';
import { installSetupErrorCodes } from './install-setup.constants';

export function createInstallLockedException(): ConflictException {
  return new ConflictException({
    code: installSetupErrorCodes.installLocked,
    message: 'Install wizard is locked; use Settings for further changes',
  });
}
