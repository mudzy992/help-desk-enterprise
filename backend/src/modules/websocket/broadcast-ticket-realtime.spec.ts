import type { Server } from 'socket.io';
import { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import type { TicketRealtimeMessagePayload } from '../tickets/collaboration.types';
import type { TicketUpdatedRealtimePayload } from '../tickets/ticket-realtime.types';
import {
  broadcastTicketMessage,
  broadcastTicketUpdated,
} from './broadcast-ticket-realtime';
import { groupFeedChangedEventName } from './group-feed-change';
import {
  groupRoomName,
  ticketPublicRoomName,
  ticketStaffRoomName,
  userRoomName,
} from './ticket-socket-rooms';

type EmittedEvent = { readonly room: string; readonly event: string; readonly payload: unknown };

function createServer() {
  const emitted: EmittedEvent[] = [];
  const server = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ room, event, payload });
      },
    }),
  } as unknown as Server;
  return { server, emitted };
}

function ticketUpdated(
  overrides: Partial<TicketUpdatedRealtimePayload> = {},
): TicketUpdatedRealtimePayload {
  return {
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
    ...overrides,
  };
}

function ticketMessage(
  overrides: Partial<TicketRealtimeMessagePayload> = {},
): TicketRealtimeMessagePayload {
  return {
    id: 'msg-public',
    ticketId: 'ticket-1',
    type: 'USER_REPLY',
    body: 'hello',
    authorUserId: 'user-requester',
    createdAt: '2026-09-13T08:00:00.000Z',
    requesterId: 'user-requester',
    assignedGroupId: 'group-it',
    visibility: 'public',
    ...overrides,
  } as TicketRealtimeMessagePayload;
}

function roomsOf(emitted: readonly EmittedEvent[]): readonly string[] {
  return [...new Set(emitted.map((item) => item.room))].sort();
}

function groupEmits(emitted: readonly EmittedEvent[]): readonly EmittedEvent[] {
  return emitted.filter((item) => item.room === groupRoomName('group-it'));
}

const originalLegacyEmit = process.env.WS_GROUP_FEED_LEGACY_FULL_EMIT;

afterEach(() => {
  if (originalLegacyEmit === undefined) {
    delete process.env.WS_GROUP_FEED_LEGACY_FULL_EMIT;
    return;
  }
  process.env.WS_GROUP_FEED_LEGACY_FULL_EMIT = originalLegacyEmit;
});

function groupFeedOf(emitted: readonly EmittedEvent[]): EmittedEvent | undefined {
  return emitted.find((item) => item.event === groupFeedChangedEventName);
}

/**
 * Faza 3.2 (plan §3.2) — matrica emit-ova.
 *
 * TKO dobija ŠTA:
 * - ticket soba (staff)            → puni payload (uvijek)
 * - javna ticket soba              → puni payload (samo javne promjene)
 * - user sobe (requester/dodijeljeni/akter) → puni payload
 * - group soba                     → SAMO `group.feed-changed` (< 200 B, bez sadržaja)
 * - interne bilješke i interne promjene → NIKAD javna ni group soba
 */
describe('broadcastTicketRealtime — matrica emit-ova', () => {
  it('public ticket update: puni payload u ticket/user sobe, laki event u group sobu', () => {
    const { server, emitted } = createServer();
    broadcastTicketUpdated(server, ticketUpdated());

    expect(
      emitted.every(
        (item) =>
          item.event === ticketRealtimeEventNames.ticketUpdated ||
          item.event === groupFeedChangedEventName,
      ),
    ).toBe(true);
    expect(roomsOf(emitted)).toEqual([
      groupRoomName('group-it'),
      ticketPublicRoomName('ticket-1'),
      ticketStaffRoomName('ticket-1'),
      userRoomName('user-agent-it'),
      userRoomName('user-requester'),
    ]);
    expect(groupFeedOf(emitted)?.payload).toEqual({
      groupId: 'group-it',
      ticketId: 'ticket-1',
      kind: 'status',
      occurredAt: '2026-09-13T08:00:00.000Z',
    });
    expect(JSON.stringify(groupFeedOf(emitted)?.payload).length).toBeLessThan(200);
    // Tranzicija: dok flag stoji, group soba dobija i stari puni payload (isti
    // oblik kao prije faze), pa rolling deploy ne gubi nijedan događaj.
    expect(groupEmits(emitted).map((item) => item.event)).toEqual([
      ticketRealtimeEventNames.ticketUpdated,
      groupFeedChangedEventName,
    ]);
  });

  it('sa isključenim tranzicionim flagom: group soba dobija samo laki event', () => {
    process.env.WS_GROUP_FEED_LEGACY_FULL_EMIT = 'off';
    const { server, emitted } = createServer();
    broadcastTicketUpdated(server, ticketUpdated());

    expect(groupEmits(emitted).map((item) => item.event)).toEqual([
      groupFeedChangedEventName,
    ]);
    // Nijedan emit u group sobu ne nosi sadržaj tiketa (naslov, opis, status).
    expect(JSON.stringify(groupEmits(emitted))).not.toContain('"title"');
    expect(JSON.stringify(groupEmits(emitted))).not.toContain('"assignment"');
    expect(groupEmits(emitted)[0]?.payload).toEqual({
      groupId: 'group-it',
      ticketId: 'ticket-1',
      kind: 'status',
      occurredAt: '2026-09-13T08:00:00.000Z',
    });
  });

  it('staff-only ticket update: bez javne sobe i bez ijednog group eventa', () => {
    const { server, emitted } = createServer();
    broadcastTicketUpdated(
      server,
      ticketUpdated({
        change: 'updated',
        sourceAction: 'ticket_confidential_viewed',
        sourceMessageId: 'msg-2',
        status: 'IN_PROGRESS',
        resolvedAt: null,
        visibility: 'staff',
      }),
    );

    expect(roomsOf(emitted)).toEqual([
      ticketStaffRoomName('ticket-1'),
      userRoomName('user-agent-it'),
    ]);
    expect(groupEmits(emitted)).toHaveLength(0);
  });

  it('ticket bez grupe: nema group sobe uopšte', () => {
    const { server, emitted } = createServer();
    broadcastTicketUpdated(server, ticketUpdated({ assignedGroupId: null }));
    expect(emitted.some((item) => item.room.startsWith('group:'))).toBe(false);
  });

  it('javna poruka: puni payload u ticket/user sobe, laki event "message" u group sobu', () => {
    const { server, emitted } = createServer();
    broadcastTicketMessage(server, ticketMessage());

    expect(roomsOf(emitted)).toEqual([
      groupRoomName('group-it'),
      ticketPublicRoomName('ticket-1'),
      ticketStaffRoomName('ticket-1'),
      userRoomName('user-requester'),
    ]);
    expect(groupFeedOf(emitted)?.payload).toEqual({
      groupId: 'group-it',
      ticketId: 'ticket-1',
      kind: 'message',
      occurredAt: '2026-09-13T08:00:00.000Z',
    });
    expect(groupEmits(emitted).map((item) => item.event)).toEqual([
      ticketRealtimeEventNames.messageCreated,
      groupFeedChangedEventName,
    ]);
  });

  it('interna bilješka: samo staff soba — nikad javna, nikad group', () => {
    const { server, emitted } = createServer();
    broadcastTicketMessage(
      server,
      ticketMessage({
        id: 'msg-internal',
        type: 'INTERNAL_NOTE',
        body: 'private note',
        visibility: 'staff',
      }),
    );

    expect(roomsOf(emitted)).toEqual([ticketStaffRoomName('ticket-1')]);
    expect(groupEmits(emitted)).toHaveLength(0);
    // Sadržaj smije vidjeti samo staff soba — ni javna ni group soba ga ne dobijaju.
    const outsideStaff = emitted.filter(
      (item) => item.room !== ticketStaffRoomName('ticket-1'),
    );
    expect(JSON.stringify(outsideStaff)).not.toContain('private note');
  });
});
