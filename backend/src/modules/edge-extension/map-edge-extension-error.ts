import {
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { EdgeExtensionError } from './edge-extension.error';

const messages: Readonly<Record<EdgeExtensionError['code'], string>> = {
  NOT_FOUND: 'The requested resource was not found',
  FORBIDDEN: 'Authorization failed',
  RECEIPTS_DISABLED: 'Edge notification receipts are disabled',
  REMOTE_DISABLED: 'Edge remote assistance is disabled',
  REMOTE_NOT_REQUESTED: 'No remote request exists for this ticket',
};

export function mapEdgeExtensionError(error: unknown): HttpException {
  if (!(error instanceof EdgeExtensionError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (error.code === 'NOT_FOUND' || error.code === 'REMOTE_NOT_REQUESTED') {
    return new NotFoundException(body);
  }
  return new ForbiddenException(body);
}
