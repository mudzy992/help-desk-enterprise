import { timeTrackingSettingRanges } from '../../settings/definitions/time-tracking-settings';
import { TicketsError } from '../tickets.error';
import { defaultTimeTrackingConfiguration } from './time-tracking.constants';
import type { TimeTrackingConfiguration } from './time-tracking.types';

type Range = { readonly min: number; readonly max: number; readonly default: number };

/**
 * Package 1.3 (T1). A missing value falls back to its default (installs that
 * predate the package); a present but invalid one is a configuration error.
 */
export function parseTimeTrackingConfiguration(input: {
  readonly idleAutoPauseMinutes: unknown;
  readonly autoResume: unknown;
  readonly maxSessionHours: unknown;
  readonly singleActivePerUser: unknown;
  readonly manualEntryEnabled: unknown;
  readonly maxBackdateDays: unknown;
  readonly manualMaxMinutes: unknown;
}): TimeTrackingConfiguration {
  const r = timeTrackingSettingRanges;
  const d = defaultTimeTrackingConfiguration;
  return {
    idleAutoPauseMinutes: readInteger(input.idleAutoPauseMinutes, r.idleAutoPauseMinutes),
    autoResume: readBoolean(input.autoResume, d.autoResume),
    maxSessionHours: readInteger(input.maxSessionHours, r.maxSessionHours),
    singleActivePerUser: readBoolean(input.singleActivePerUser, d.singleActivePerUser),
    manualEntryEnabled: readBoolean(input.manualEntryEnabled, d.manualEntryEnabled),
    maxBackdateDays: readInteger(input.maxBackdateDays, r.maxBackdateDays),
    manualMaxMinutes: readInteger(input.manualMaxMinutes, r.manualMaxMinutes),
  };
}

function readInteger(value: unknown, range: Range): number {
  if (value === undefined || value === null) {
    return range.default;
  }
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < range.min ||
    value > range.max
  ) {
    throw new TicketsError('TIME_TRACKING_UNAVAILABLE');
  }
  return value;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== 'boolean') {
    throw new TicketsError('TIME_TRACKING_UNAVAILABLE');
  }
  return value;
}
