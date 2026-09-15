import { ticketUpdatedBroadcastRooms } from './ticket-updated-broadcast-rooms';
import type { TicketUpdatedRealtimePayload } from '../tickets/ticket-realtime.types';
import {
  groupRoomName,
  ticketPublicRoomName,
  ticketStaffRoomName,
  userRoomName,
} from './ticket-socket-rooms';

const basePayload: TicketUpdatedRealtimePayload = {
  ticketId: 'ticket-1',
  change: 'status',
  sourceAction: 'ticket_resolved',
  sourceMessageId: 'msg-1',
  status: 'RESOLVED',
  priority: 'HIGH',
  assignedUserId: 'user-agent-it',
  assignedGroupId: 'group-it',
  requesterId: 'user-requester',
  archivedAt: null,
  resolvedAt: '2026-09-13T08:00:00.000Z',
  closedAt: null,
  actorUserId: 'user-agent-it',
  occurredAt: '2026-09-13T08:00:00.000Z',
  visibility: 'public',
};

describe('ticketUpdatedBroadcastRooms', () => {
  it('fans public updates to ticket, user, and group rooms without duplicating actor=assignee', () => {
    expect([...ticketUpdatedBroadcastRooms(basePayload)].sort()).toEqual(
      [
        groupRoomName('group-it'),
        ticketPublicRoomName('ticket-1'),
        ticketStaffRoomName('ticket-1'),
        userRoomName('user-agent-it'),
        userRoomName('user-requester'),
      ].sort(),
    );
  });

  it('keeps staff-only updates off the requester and public ticket rooms', () => {
    expect(
      [
        ...ticketUpdatedBroadcastRooms({
          ...basePayload,
          visibility: 'staff',
          sourceAction: 'ticket_confidential_viewed',
          actorUserId: 'user-admin',
        }),
      ].sort(),
    ).toEqual(
      [
        groupRoomName('group-it'),
        ticketStaffRoomName('ticket-1'),
        userRoomName('user-admin'),
        userRoomName('user-agent-it'),
      ].sort(),
    );
  });
});
