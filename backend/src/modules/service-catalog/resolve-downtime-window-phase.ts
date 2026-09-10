import {
  isDowntimeWindowActive,
  isDowntimeWindowExpired,
} from './assert-downtime-window-range';
import type { DowntimeWindowPhase } from './service-availability.types';

export function resolveDowntimeWindowPhase(input: {
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly now: Date;
}): DowntimeWindowPhase {
  if (isDowntimeWindowActive(input.startsAt, input.endsAt, input.now)) {
    return 'ACTIVE';
  }
  if (isDowntimeWindowExpired(input.endsAt, input.now)) {
    return 'EXPIRED';
  }
  return 'UPCOMING';
}
