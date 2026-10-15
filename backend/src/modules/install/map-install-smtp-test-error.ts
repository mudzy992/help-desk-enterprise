import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { installSmtpTestErrorCodes } from './install-smtp-test.constants';
import { InstallSmtpTestError } from './install-smtp-test.error';
import type { InstallSmtpTestErrorCode } from './install-smtp-test.error';

const messages: Record<InstallSmtpTestErrorCode, string> = {
  SUPER_ADMIN_REQUIRED: 'Initial SuperAdmin must exist before the SMTP test',
  SMTP_TEST_NOT_CONFIGURED:
    'SMTP is off or incomplete: host, credentials and a From address are required',
  SMTP_TEST_INVALID_RECIPIENT: 'The test address is not a valid e-mail address',
  SMTP_TEST_RATE_LIMITED:
    'Too many test e-mails, try again in a few minutes',
  SMTP_TEST_AUTH_FAILED:
    'The server refused the credentials (check username and password)',
  SMTP_TEST_TLS_FAILED:
    'The encrypted connection failed (check TLS and the port: 587 with STARTTLS, 465 with TLS)',
  SMTP_TEST_UNREACHABLE:
    'The server could not be reached (check host, port and that the server allows this address)',
  SMTP_TEST_TIMEOUT: 'The server did not answer in time',
  SMTP_TEST_SEND_FAILED: 'The server refused the test message',
};

export function mapInstallSmtpTestError(error: unknown): HttpException {
  if (!(error instanceof InstallSmtpTestError)) {
    throw error;
  }
  const body = {
    code: error.code,
    message: messages[error.code],
    // The server's own answer helps when the mapped advice is not enough; it is
    // never the configuration (no host, no password).
    detail: error.message === error.code ? null : error.message.slice(0, 300),
  };
  if (
    error.code === installSmtpTestErrorCodes.superAdminRequired ||
    error.code === installSmtpTestErrorCodes.notConfigured
  ) {
    return new ConflictException(body);
  }
  if (error.code === installSmtpTestErrorCodes.rateLimited) {
    return new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
  }
  return new BadRequestException(body);
}
