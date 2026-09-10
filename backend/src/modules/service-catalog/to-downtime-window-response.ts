import { resolveDowntimeWindowPhase } from './resolve-downtime-window-phase';
import type {
  DowntimeWindowRecord,
  DowntimeWindowResponse,
} from './service-availability.types';

export function toDowntimeWindowResponse(
  record: DowntimeWindowRecord,
  now: Date,
): DowntimeWindowResponse {
  const phase = resolveDowntimeWindowPhase({
    startsAt: record.startsAt,
    endsAt: record.endsAt,
    now,
  });
  return {
    id: record.id,
    serviceId: record.serviceId,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt.toISOString(),
    message: record.message,
    phase,
    isActive: phase === 'ACTIVE',
    isUpcoming: phase === 'UPCOMING',
    isExpired: phase === 'EXPIRED',
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
