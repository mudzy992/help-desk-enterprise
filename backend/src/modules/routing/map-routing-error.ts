import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RoutingError } from './routing.error';
import type { RoutingErrorCode } from './routing.error';

const notFoundCodes: readonly RoutingErrorCode[] = [
  'ORIGIN_UNIT_NOT_FOUND',
  'SERVICE_NOT_FOUND',
  'GROUP_NOT_FOUND',
];

const messages: Record<RoutingErrorCode, string> = {
  ORIGIN_UNIT_NOT_FOUND: 'Origin organizational unit was not found',
  SERVICE_NOT_FOUND: 'Service was not found',
  GROUP_NOT_FOUND: 'Target group was not found',
  DUPLICATE_RULE: 'A routing rule already exists for this origin unit and service',
  REASON_REQUIRED: 'A reason is required for this routing change',
  UNAVAILABLE: 'Routing configuration is unavailable',
};

export function mapRoutingError(error: unknown): HttpException {
  if (!(error instanceof RoutingError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (notFoundCodes.includes(error.code)) {
    return new NotFoundException(body);
  }
  if (error.code === 'DUPLICATE_RULE') {
    return new ConflictException(body);
  }
  if (error.code === 'UNAVAILABLE') {
    return new ServiceUnavailableException(body);
  }
  return new BadRequestException(body);
}
