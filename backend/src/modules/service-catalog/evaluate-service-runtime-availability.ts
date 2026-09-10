import { compareDowntimeInstants } from './parse-downtime-instant';
import {
  unavailableStoredAvailabilityStatuses,
} from './service-availability.constants';
import type {
  DowntimeWindowRecord,
  ServiceAvailabilityEvaluationContext,
  ServiceRuntimeAvailability,
  ServiceRuntimeAvailabilityState,
} from './service-availability.types';
import { toDowntimeWindowResponse } from './to-downtime-window-response';
import type { ServiceAvailability } from '../../generated/prisma/enums';

export function evaluateServiceRuntimeAvailability(input: {
  readonly storedAvailability: ServiceAvailability;
  readonly downtimeWindows: readonly DowntimeWindowRecord[];
  readonly evaluation: ServiceAvailabilityEvaluationContext;
}): ServiceRuntimeAvailability {
  const { now, availability, downtime } = input.evaluation;
  const classified = downtime.enabled
    ? classifyDowntimeWindows(input.downtimeWindows, now)
    : { active: null, upcoming: null };
  const state = resolveRuntimeState({
    storedAvailability: input.storedAvailability,
    hasActiveDowntime: classified.active !== null,
    availabilityEnabled: availability.enabled,
  });
  const effectiveAvailability = resolveEffectiveAvailability({
    storedAvailability: input.storedAvailability,
    hasActiveDowntime: classified.active !== null,
    autoSetMaintenanceStatus: downtime.autoSetMaintenanceStatus,
    downtimeEnabled: downtime.enabled,
  });
  const isCurrentlyAvailable = state === 'CURRENTLY_AVAILABLE';
  return {
    state,
    storedAvailability: input.storedAvailability,
    effectiveAvailability,
    isCurrentlyAvailable,
    isCurrentlyUnavailable: !isCurrentlyAvailable,
    hasActiveDowntime: classified.active !== null,
    hasUpcomingDowntime: classified.upcoming !== null,
    activeDowntimeWindow:
      classified.active === null
        ? null
        : toDowntimeWindowResponse(classified.active, now),
    upcomingDowntimeWindow:
      classified.upcoming === null
        ? null
        : toDowntimeWindowResponse(classified.upcoming, now),
    ticketCreationAllowed: true,
    showStatusInCatalog: availability.showStatusInCatalog,
    showStatusInTicketCreate: availability.showStatusInTicketCreate,
    evaluatedAt: now.toISOString(),
  };
}

function classifyDowntimeWindows(
  windows: readonly DowntimeWindowRecord[],
  now: Date,
): {
  active: DowntimeWindowRecord | null;
  upcoming: DowntimeWindowRecord | null;
} {
  const mapped = windows.map((window) => ({
    window,
    response: toDowntimeWindowResponse(window, now),
  }));
  const active =
    mapped
      .filter((item) => item.response.isActive)
      .sort((left, right) =>
        compareDowntimeInstants(right.window.startsAt, left.window.startsAt),
      )[0]?.window ?? null;
  const upcoming =
    mapped
      .filter((item) => item.response.isUpcoming)
      .sort((left, right) =>
        compareDowntimeInstants(left.window.startsAt, right.window.startsAt),
      )[0]?.window ?? null;
  return { active, upcoming };
}

function resolveRuntimeState(input: {
  readonly storedAvailability: ServiceAvailability;
  readonly hasActiveDowntime: boolean;
  readonly availabilityEnabled: boolean;
}): ServiceRuntimeAvailabilityState {
  if (input.hasActiveDowntime) {
    return 'SCHEDULED_DOWNTIME';
  }
  if (
    input.availabilityEnabled &&
    (unavailableStoredAvailabilityStatuses as readonly string[]).includes(
      input.storedAvailability,
    )
  ) {
    return 'CURRENTLY_UNAVAILABLE';
  }
  return 'CURRENTLY_AVAILABLE';
}

function resolveEffectiveAvailability(input: {
  readonly storedAvailability: ServiceAvailability;
  readonly hasActiveDowntime: boolean;
  readonly autoSetMaintenanceStatus: boolean;
  readonly downtimeEnabled: boolean;
}): ServiceAvailability {
  if (
    input.downtimeEnabled &&
    input.hasActiveDowntime &&
    input.autoSetMaintenanceStatus
  ) {
    return 'MAINTENANCE';
  }
  return input.storedAvailability;
}
