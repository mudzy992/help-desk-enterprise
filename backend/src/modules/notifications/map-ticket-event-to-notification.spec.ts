import { mapTicketEventToNotification } from './fan-out/map-ticket-event-to-notification';
import { notificationTypes } from './notifications.constants';
import { ticketSystemEventActions } from '../tickets/collaboration.constants';
import type { TicketRealtimeMessagePayload } from '../tickets/collaboration.types';

describe('mapTicketEventToNotification', () => {
  it('maps chat replies and allow-listed system events', () => {
    expect(mapTicketEventToNotification(payload('USER_REPLY', 'hello'))?.type).toBe(
      notificationTypes.ticketMessage,
    );
    expect(
      mapTicketEventToNotification(
        payload('SYSTEM_EVENT', ticketSystemEventActions.created),
      )?.type,
    ).toBe(notificationTypes.ticketCreated);
    expect(
      mapTicketEventToNotification(
        payload('SYSTEM_EVENT', ticketSystemEventActions.slaResponseBreached),
      )?.type,
    ).toBe(notificationTypes.ticketSla);
    expect(
      mapTicketEventToNotification(
        payload('SYSTEM_EVENT', ticketSystemEventActions.remoteRequested),
      )?.type,
    ).toBe(notificationTypes.remoteRequested);
    expect(mapTicketEventToNotification(payload('INTERNAL_NOTE', 'secret'))).toBeNull();
    expect(
      mapTicketEventToNotification(
        payload('SYSTEM_EVENT', ticketSystemEventActions.timeStarted),
      ),
    ).toBeNull();
  });
});

function payload(
  type: TicketRealtimeMessagePayload['type'],
  body: string,
): TicketRealtimeMessagePayload {
  return {
    id: 'message-1',
    ticketId: 'ticket-1',
    type,
    body,
    authorUserId: 'user-1',
    createdAt: '2026-09-13T08:00:00.000Z',
    requesterId: 'user-requester',
    assignedGroupId: 'group-it',
    visibility: type === 'USER_REPLY' ? 'public' : 'staff',
  };
}

describe('mapTicketEventToNotification — package 1.3 timer auto stop', () => {
  const event = (body: string) =>
    ({ type: 'SYSTEM_EVENT', body }) as Parameters<typeof mapTicketEventToNotification>[0];

  it('notifies only when the maximum-duration guard stopped the timer', () => {
    expect(
      mapTicketEventToNotification(event('ticket_time_auto_stopped:AUTO_MAX_DURATION:u1')),
    ).toEqual({ type: 'ticket.timeAutoStopped', event: 'ticket_time_auto_stopped' });
    expect(
      mapTicketEventToNotification(event('ticket_time_auto_stopped:AUTO_IDLE:u1')),
    ).toBeNull();
    expect(
      mapTicketEventToNotification(event('ticket_time_auto_stopped:AUTO_TICKET_CLOSED:u1')),
    ).toBeNull();
  });
});
