import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IntegrationQueueError } from './integration-queue.error';
import type { IntegrationQueueErrorCode } from './integration-queue.error';

const messages: Record<IntegrationQueueErrorCode, string> = {
  NOT_FOUND: 'Integration job was not found',
  INVALID_STATUS: 'Only FAILED or DLQ jobs can be retried',
  ADMIN_UI_DISABLED: 'Integration queue admin API is disabled',
  UNAVAILABLE: 'Integration queue is unavailable',
};

export function mapIntegrationQueueError(error: unknown): HttpException {
  if (!(error instanceof IntegrationQueueError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (error.code === 'NOT_FOUND') {
    return new NotFoundException(body);
  }
  if (error.code === 'ADMIN_UI_DISABLED') {
    return new ForbiddenException(body);
  }
  if (error.code === 'UNAVAILABLE') {
    return new ServiceUnavailableException(body);
  }
  return new BadRequestException(body);
}
