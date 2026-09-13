import type { Server } from 'socket.io';
import { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import {
  broadcastTicketMessage,
  broadcastTicketUpdated,
} from './broadcast-ticket-realtime';
import {
  ticketPublicRoomName,
  ticketStaffRoomName,
} from './ticket-socket-rooms';

function createServer() {
  const emitted: { room: string; event: string }[] = [];
  const server = {
    to: (room: string) => ({
      emit: (event: string) => {
        emitted.push({ room, event });
      },
    }),
  } as unknown as Server;
  return { server, emitted };
}

describe('broadcastTicketRealtime', () => {
  it('sends public ticket updates to staff and public rooms', () => {
    const { server, emitted } = createServer();
    broadcastTicketUpdated(server, {
      ticketId: 'ticket-1',
      change: 'status',
      sourceAction: 'ticket_resolved',
      sourceMessageId: 'msg-1',
      status: 'RESOLVED',
      priority: 'HIGH',
      assignedUserId: 'user-agent-it',
      assignedGroupId: 'group-it',
      archivedAt: null,
      resolvedAt: '2026-09-13T08:00:00.000Z',
      closedAt: null,
      actorUserId: 'user-agent-it',
      occurredAt: '2026-09-13T08:00:00.000Z',
      visibility: 'public',
    });
    expect(emitted.map((item) => item.event)).toEqual([
      ticketRealtimeEventNames.ticketUpdated,
      ticketRealtimeEventNames.ticketUpdated,
    ]);
    expect(emitted.map((item) => item.room).sort()).toEqual([
      ticketPublicRoomName('ticket-1'),
      ticketStaffRoomName('ticket-1'),
    ]);
  });

  it('keeps staff-only ticket updates off the public room', () => {
    const { server, emitted } = createServer();
    broadcastTicketUpdated(server, {
      ticketId: 'ticket-1',
      change: 'updated',
      sourceAction: 'ticket_confidential_viewed',
      sourceMessageId: 'msg-2',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      assignedUserId: 'user-agent-it',
      assignedGroupId: 'group-it',
      archivedAt: null,
      resolvedAt: null,
      closedAt: null,
      actorUserId: 'user-agent-it',
      occurredAt: '2026-09-13T08:00:00.000Z',
      visibility: 'staff',
    });
    expect(emitted.map((item) => item.room)).toEqual([
      ticketStaffRoomName('ticket-1'),
    ]);
  });

  it('does not send internal notes to the public ticket room', () => {
    const { server, emitted } = createServer();
    broadcastTicketMessage(server, {
      id: 'msg-internal',
      ticketId: 'ticket-1',
      type: 'INTERNAL_NOTE',
      body: 'private note',
      authorUserId: 'user-agent-it',
      createdAt: '2026-09-13T08:00:00.000Z',
      requesterId: 'user-requester',
      assignedGroupId: null,
      visibility: 'staff',
    });
    expect(emitted.map((item) => item.room)).toEqual([
      ticketStaffRoomName('ticket-1'),
    ]);
  });
});
