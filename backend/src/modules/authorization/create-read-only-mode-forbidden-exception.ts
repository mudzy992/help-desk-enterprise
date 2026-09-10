import { ForbiddenException } from '@nestjs/common';
import { readOnlyModeErrorCodes } from './read-only-mode.constants';

export function createReadOnlyModeForbiddenException(): ForbiddenException {
  return new ForbiddenException({
    code: readOnlyModeErrorCodes.forbidden,
    message: 'Admin module is read-only',
  });
}
