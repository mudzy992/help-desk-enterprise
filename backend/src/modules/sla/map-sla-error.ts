import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChangeLogError } from '../change-log/change-log.error';
import { changeLogErrorCodes } from '../change-log/change-log.constants';
import { SlaError, type SlaErrorCode } from './sla.error';

const notFoundCodes: readonly SlaErrorCode[] = [
  'CALENDAR_NOT_FOUND',
  'PROFILE_NOT_FOUND',
  'RULE_NOT_FOUND',
  'ESCALATION_RULE_NOT_FOUND',
  'SERVICE_NOT_FOUND',
  'ORGANIZATIONAL_UNIT_NOT_FOUND',
  'NO_MATCHING_RULE',
];

const conflictCodes: readonly SlaErrorCode[] = [
  'DUPLICATE_KEY',
  'DUPLICATE_RULE',
  'DUPLICATE_HOLIDAY',
  'DUPLICATE_ESCALATION_OFFSET',
  'MAX_ESCALATION_LEVELS_EXCEEDED',
  'CALENDAR_IN_USE',
  'PROFILE_IN_USE',
];

const messages: Record<SlaErrorCode, string> = {
  REASON_REQUIRED: 'A reason is required for this SLA change',
  INVALID_KEY: 'SLA key is invalid',
  INVALID_NAME: 'Name is invalid',
  INVALID_TIMEZONE: 'Timezone is invalid',
  INVALID_WEEKLY_HOURS: 'Weekly business hours are invalid',
  OVERLAPPING_INTERVALS: 'Business-hour intervals overlap or are inverted',
  INVALID_HOLIDAY: 'Holiday date or name is invalid',
  DUPLICATE_HOLIDAY: 'A holiday already exists for this date',
  CALENDAR_NOT_FOUND: 'Business-hours calendar was not found',
  CALENDAR_INACTIVE: 'Business-hours calendar is inactive',
  CALENDAR_IN_USE: 'Calendar is still used by SLA profiles',
  CALENDAR_HAS_NO_BUSINESS_HOURS: 'Calendar has no working intervals',
  DUPLICATE_KEY: 'An SLA record with this key already exists',
  PROFILE_NOT_FOUND: 'SLA profile was not found',
  PROFILE_INACTIVE: 'SLA profile is inactive',
  PROFILE_IN_USE: 'SLA profile is still used by services or policy packs',
  RULE_NOT_FOUND: 'SLA rule was not found',
  DUPLICATE_RULE: 'An SLA rule already exists for this match key',
  INVALID_SLA_TARGETS: 'Response and resolution targets are invalid',
  INVALID_EVALUATION_ORDER: 'Evaluation order is invalid',
  SERVICE_NOT_FOUND: 'Service was not found',
  ORGANIZATIONAL_UNIT_NOT_FOUND: 'Organizational unit was not found',
  SERVICE_OVERRIDE_DISABLED: 'Service-specific SLA rules are disabled',
  OU_OVERRIDE_DISABLED: 'Organizational-unit SLA rules are disabled',
  NO_MATCHING_RULE: 'No SLA rule matches the given profile and conditions',
  ESCALATION_RULE_NOT_FOUND: 'SLA escalation rule was not found',
  MAX_ESCALATION_LEVELS_EXCEEDED:
    'Maximum number of escalation levels for this profile is exceeded',
  INVALID_ESCALATION_TARGET:
    'Exactly one escalation target (group, role, or user) is required',
  INVALID_ESCALATION_OFFSET:
    'Escalation trigger offset must increase with each level',
  DUPLICATE_ESCALATION_OFFSET:
    'An escalation rule with this trigger offset already exists on the profile',
  UNAVAILABLE: 'SLA configuration is unavailable',
};

export function mapSlaError(error: unknown): HttpException {
  if (
    error instanceof ChangeLogError &&
    error.code === changeLogErrorCodes.reasonRequired
  ) {
    return new BadRequestException({
      code: 'REASON_REQUIRED',
      message: messages.REASON_REQUIRED,
    });
  }
  if (!(error instanceof SlaError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (notFoundCodes.includes(error.code)) {
    return new NotFoundException(body);
  }
  if (conflictCodes.includes(error.code)) {
    return new ConflictException(body);
  }
  if (error.code === 'UNAVAILABLE') {
    return new ServiceUnavailableException(body);
  }
  return new BadRequestException(body);
}
