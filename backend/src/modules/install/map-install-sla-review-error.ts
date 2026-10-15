import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { mapSlaError } from '../sla/map-sla-error';
import { SlaError } from '../sla/sla.error';
import { installSlaReviewErrorCodes } from './install-sla-review.constants';
import { InstallSlaReviewError } from './install-sla-review.error';
import type { InstallSlaReviewErrorCode } from './install-sla-review.error';

const messages: Record<InstallSlaReviewErrorCode, string> = {
  SUPER_ADMIN_REQUIRED: 'Initial SuperAdmin must exist before the SLA review',
  SLA_REVIEW_CALENDAR_MISSING:
    'No business-hours calendar was seeded on this deployment',
  SLA_REVIEW_EMPTY_ADJUSTMENT:
    'An adjusted review has to change the working hours or the priority matrix',
};

export function mapInstallSlaReviewError(error: unknown): HttpException {
  // Working hours and matrix cells are validated by the SLA domain; its answer is
  // the one the SLA screens give, so the wizard does not invent a second wording.
  if (error instanceof SlaError) {
    return mapSlaError(error);
  }
  if (!(error instanceof InstallSlaReviewError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (
    error.code === installSlaReviewErrorCodes.superAdminRequired ||
    error.code === installSlaReviewErrorCodes.calendarMissing
  ) {
    return new ConflictException(body);
  }
  return new BadRequestException(body);
}
