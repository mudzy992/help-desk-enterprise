import type { TicketStatus } from '../../../generated/prisma/enums';
import { timeTrackingSettingRanges } from '../../settings/definitions/time-tracking-settings';
import type { TimeTrackingConfiguration } from './time-tracking.types';

/** Package 1.3 — time tracking guard (plan modules/1.3-mjerenje-vremena.md). */
export const timeTrackingConstants = {
  /** Extra minutes before the sweep closes a timer without heartbeats (T3). */
  heartbeatGraceMinutes: 2,
  /** A client idle end may lie at most this far before the last heartbeat (T3). */
  heartbeatClockSkewSeconds: 60,
  /** Minimum spacing of accepted heartbeats; faster calls are ignored. */
  heartbeatMinimumIntervalSeconds: 20,
  minimumReasonLength: 3,
  maximumReasonLength: 500,
  /** Rows the sweep closes per run and kind; the next run continues. */
  sweepBatchSize: 500,
} as const;

/** Timers cannot run on these tickets (T6). */
export const timeTrackingLockedStatuses: readonly TicketStatus[] = [
  'RESOLVED',
  'CLOSED',
  'ARCHIVED',
];

export const defaultTimeTrackingConfiguration: TimeTrackingConfiguration = {
  idleAutoPauseMinutes: timeTrackingSettingRanges.idleAutoPauseMinutes.default,
  autoResume: true,
  maxSessionHours: timeTrackingSettingRanges.maxSessionHours.default,
  singleActivePerUser: true,
  manualEntryEnabled: true,
  maxBackdateDays: timeTrackingSettingRanges.maxBackdateDays.default,
  manualMaxMinutes: timeTrackingSettingRanges.manualMaxMinutes.default,
};
