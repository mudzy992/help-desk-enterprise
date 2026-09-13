import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { NotificationsError } from './notifications.error';

const messages: Readonly<Record<NotificationsError['code'], string>> = {
  NOT_FOUND: 'Notification was not found',
  FORBIDDEN: 'Authorization failed',
};

export function mapNotificationError(error: unknown): HttpException {
  if (!(error instanceof NotificationsError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (error.code === 'NOT_FOUND') {
    return new NotFoundException(body);
  }
  return new ForbiddenException(body);
}
