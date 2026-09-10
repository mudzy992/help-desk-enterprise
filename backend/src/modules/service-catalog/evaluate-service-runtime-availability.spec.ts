import { defaultServiceAvailabilityEvaluationContext } from './parse-service-availability-configuration';
import { evaluateServiceRuntimeAvailability } from './evaluate-service-runtime-availability';
import type { DowntimeWindowRecord } from './service-availability.types';

const now = new Date('2026-09-10T10:00:00.000Z');

function windowRecord(input: {
  readonly id: string;
  readonly startsAt: string;
  readonly endsAt: string;
}): DowntimeWindowRecord {
  return {
    id: input.id,
    serviceId: 'service-1',
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    message: 'Planned maintenance',
    createdAt: now,
    updatedAt: now,
  };
}

function evaluate(
  storedAvailability: 'OPERATIONAL' | 'DEGRADED' | 'DOWN' | 'MAINTENANCE',
  windows: readonly DowntimeWindowRecord[] = [],
  at: Date = now,
) {
  return evaluateServiceRuntimeAvailability({
    storedAvailability,
    downtimeWindows: windows,
    evaluation: defaultServiceAvailabilityEvaluationContext(at),
  });
}

describe('evaluateServiceRuntimeAvailability', () => {
  it('marks an operational service without windows as currently available', () => {
    const runtime = evaluate('OPERATIONAL');
    expect(runtime.state).toBe('CURRENTLY_AVAILABLE');
    expect(runtime.isCurrentlyAvailable).toBe(true);
    expect(runtime.isCurrentlyUnavailable).toBe(false);
    expect(runtime.effectiveAvailability).toBe('OPERATIONAL');
    expect(runtime.ticketCreationAllowed).toBe(true);
    expect(runtime.hasActiveDowntime).toBe(false);
    expect(runtime.hasUpcomingDowntime).toBe(false);
  });

  it('marks stored DOWN and MAINTENANCE as currently unavailable', () => {
    const down = evaluate('DOWN');
    expect(down.state).toBe('CURRENTLY_UNAVAILABLE');
    expect(down.isCurrentlyUnavailable).toBe(true);
    expect(down.effectiveAvailability).toBe('DOWN');
    expect(down.ticketCreationAllowed).toBe(true);
    const maintenance = evaluate('MAINTENANCE');
    expect(maintenance.state).toBe('CURRENTLY_UNAVAILABLE');
    expect(maintenance.ticketCreationAllowed).toBe(true);
  });

  it('keeps DEGRADED as currently available with stored effective status', () => {
    const runtime = evaluate('DEGRADED');
    expect(runtime.state).toBe('CURRENTLY_AVAILABLE');
    expect(runtime.effectiveAvailability).toBe('DEGRADED');
    expect(runtime.ticketCreationAllowed).toBe(true);
  });

  it('treats an active window as scheduled downtime and overlays MAINTENANCE', () => {
    const runtime = evaluate('OPERATIONAL', [
      windowRecord({
        id: 'active',
        startsAt: '2026-09-10T09:00:00.000Z',
        endsAt: '2026-09-10T11:00:00.000Z',
      }),
    ]);
    expect(runtime.state).toBe('SCHEDULED_DOWNTIME');
    expect(runtime.hasActiveDowntime).toBe(true);
    expect(runtime.effectiveAvailability).toBe('MAINTENANCE');
    expect(runtime.activeDowntimeWindow?.phase).toBe('ACTIVE');
    expect(runtime.ticketCreationAllowed).toBe(true);
  });

  it('keeps a future window as upcoming without changing current availability', () => {
    const runtime = evaluate('OPERATIONAL', [
      windowRecord({
        id: 'future',
        startsAt: '2026-09-10T12:00:00.000Z',
        endsAt: '2026-09-10T13:00:00.000Z',
      }),
    ]);
    expect(runtime.state).toBe('CURRENTLY_AVAILABLE');
    expect(runtime.hasUpcomingDowntime).toBe(true);
    expect(runtime.hasActiveDowntime).toBe(false);
    expect(runtime.upcomingDowntimeWindow?.phase).toBe('UPCOMING');
    expect(runtime.effectiveAvailability).toBe('OPERATIONAL');
    expect(runtime.ticketCreationAllowed).toBe(true);
  });

  it('ignores expired windows after the exclusive end boundary', () => {
    const runtime = evaluate('OPERATIONAL', [
      windowRecord({
        id: 'expired',
        startsAt: '2026-09-10T08:00:00.000Z',
        endsAt: '2026-09-10T09:00:00.000Z',
      }),
    ]);
    expect(runtime.state).toBe('CURRENTLY_AVAILABLE');
    expect(runtime.hasActiveDowntime).toBe(false);
    expect(runtime.effectiveAvailability).toBe('OPERATIONAL');
    expect(runtime.ticketCreationAllowed).toBe(true);
  });

  it('activates at startsAt and expires at endsAt (half-open)', () => {
    const window = windowRecord({
      id: 'boundary',
      startsAt: '2026-09-10T10:00:00.000Z',
      endsAt: '2026-09-10T11:00:00.000Z',
    });
    const atStart = evaluate('OPERATIONAL', [window], new Date(window.startsAt));
    expect(atStart.state).toBe('SCHEDULED_DOWNTIME');
    expect(atStart.activeDowntimeWindow?.isActive).toBe(true);
    const beforeEnd = evaluate(
      'OPERATIONAL',
      [window],
      new Date('2026-09-10T10:59:59.999Z'),
    );
    expect(beforeEnd.state).toBe('SCHEDULED_DOWNTIME');
    const atEnd = evaluate('OPERATIONAL', [window], new Date(window.endsAt));
    expect(atEnd.state).toBe('CURRENTLY_AVAILABLE');
    expect(atEnd.hasActiveDowntime).toBe(false);
    expect(atEnd.ticketCreationAllowed).toBe(true);
  });
});
