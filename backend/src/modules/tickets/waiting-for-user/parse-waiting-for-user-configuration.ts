import { TicketsError } from '../tickets.error';
import { defaultWaitingForUserConfiguration } from './waiting-for-user.constants';
import type { WaitingForUserConfiguration } from './waiting-for-user.types';

export function parseWaitingForUserConfiguration(input: {
  readonly enabled: unknown;
  readonly reminderAfterDays: unknown;
  readonly autoCloseAfterDays: unknown;
}): WaitingForUserConfiguration {
  if (input.enabled === false) {
    return {
      ...defaultWaitingForUserConfiguration,
      enabled: false,
    };
  }
  if (input.enabled !== true) {
    throw new TicketsError('WAITING_FOR_USER_UNAVAILABLE');
  }
  return {
    enabled: true,
    reminderAfterDays: readPositiveDays(input.reminderAfterDays),
    autoCloseAfterDays: readPositiveDays(input.autoCloseAfterDays),
  };
}

function readPositiveDays(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TicketsError('WAITING_FOR_USER_UNAVAILABLE');
  }
  return value;
}
