import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import {
  installProfileErrorCodes,
  installStepSkipErrorCodes,
} from './install-profile.constants';
import {
  InstallProfileError,
  InstallStepSkipError,
} from './install-profile.error';

export function mapInstallProfileError(error: unknown): HttpException {
  if (!(error instanceof InstallProfileError)) {
    throw error;
  }
  const body = { code: error.code, message: profileMessages[error.code] };
  if (error.code === installProfileErrorCodes.downgradeLockedAfterSeed) {
    return new ConflictException(body);
  }
  return new ConflictException(body);
}

const profileMessages: Record<string, string> = {
  [installProfileErrorCodes.downgradeLockedAfterSeed]:
    'Initial data already exists, so the package can only be upgraded',
};

const skipMessages: Record<string, string> = {
  [installStepSkipErrorCodes.unknownStep]: 'Unknown install wizard step',
  [installStepSkipErrorCodes.notSkippable]:
    'This step cannot be deferred: the installation would not receive tickets',
  [installStepSkipErrorCodes.superAdminRequired]:
    'Initial SuperAdmin must exist before a step can be deferred',
};

export function mapInstallStepSkipError(error: unknown): HttpException {
  if (!(error instanceof InstallStepSkipError)) {
    throw error;
  }
  const body = { code: error.code, message: skipMessages[error.code] };
  if (error.code === installStepSkipErrorCodes.superAdminRequired) {
    return new ConflictException(body);
  }
  return new BadRequestException(body);
}
