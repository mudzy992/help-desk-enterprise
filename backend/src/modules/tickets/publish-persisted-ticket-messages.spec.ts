import type { TicketRealtimeHub } from './ticket-realtime.hub';
import {
  publishPersistedTicketMessages,
  publishPersistedTicketMessagesAwaited,
} from './publish-persisted-ticket-messages';
import type { TicketMessageRecord } from './collaboration.types';
import type { TicketRecord } from './tickets.types';

describe('publishPersistedTicketMessages', () => {
  const ticket = {
    id: 'ticket-1',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    assignedUserId: null,
    assignedGroupId: 'group-new',
    requesterId: 'user-requester',
  } as TicketRecord;
  const message: TicketMessageRecord = {
    id: 'message-1',
    ticketId: ticket.id,
    type: 'SYSTEM_EVENT',
    body: 'ticket_assignment_changed',
    authorUserId: 'user-agent',
    createdAt: new Date('2026-11-07T12:00:00.000Z'),
  };

  it('publishes the access-change projection before the related message', () => {
    const order: string[] = [];
    const hub = {
      publishTicketUpdated: jest.fn(() => order.push('updated')),
      publish: jest.fn(() => order.push('message')),
    } as unknown as TicketRealtimeHub;

    publishPersistedTicketMessages(hub, ticket, [message]);

    expect(order).toEqual(['updated', 'message']);
  });

  it('keeps the same ordering on the awaited durable path', async () => {
    const order: string[] = [];
    const hub = {
      publishTicketUpdatedAwaitedOnce: jest.fn(async () => {
        order.push('updated');
      }),
      publishAwaited: jest.fn(async () => {
        order.push('message');
      }),
    } as unknown as TicketRealtimeHub;

    await publishPersistedTicketMessagesAwaited(hub, ticket, [message]);

    expect(order).toEqual(['updated', 'message']);
  });
});
