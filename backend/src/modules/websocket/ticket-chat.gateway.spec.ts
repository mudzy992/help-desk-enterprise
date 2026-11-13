import { WsException } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import type { TicketRealtimeMessagePayload } from '../tickets/collaboration.types';
import { TicketRealtimeHub } from '../tickets/ticket-realtime.hub';
import type { TicketUpdatedRealtimePayload } from '../tickets/ticket-realtime.types';
import { SettingsRealtimeHub } from '../settings/settings-realtime.hub';
import { joinLeaveRateLimit } from './join-leave-rate-limiter';
import { TicketChatGateway } from './ticket-chat.gateway';
import { WebsocketAbuseLimiter } from './websocket-abuse-limiter';
import {
  ticketPublicRoomName,
  ticketStaffRoomName,
  userRoomName,
} from './ticket-socket-rooms';
import { ticketSocketRevalidationIntervalMs } from './ticket-socket-revalidation';
import { maxTicketSubscriptionsPerSocket } from './ticket-socket-subscriptions';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../tickets/tickets-collaboration.service', () => ({
  TicketsCollaborationService: class TicketsCollaborationService {},
}));

const originalLegacyGroupEmit = process.env.WS_GROUP_FEED_LEGACY_FULL_EMIT;

describe('TicketChatGateway', () => {
  const authorizeSocketJoin = jest.fn();
  const abuseLimiter = {
    consumeUserAction: jest.fn(async () => true),
  };
  let hub: TicketRealtimeHub;
  let gateway: TicketChatGateway;
  let presenceService: { update: jest.Mock };
  const emitted: { room: string; event: string; payload: unknown }[] = [];

  beforeEach(() => {
    delete process.env.WS_GROUP_FEED_LEGACY_FULL_EMIT;
    authorizeSocketJoin.mockReset();
    abuseLimiter.consumeUserAction.mockReset().mockResolvedValue(true);
    emitted.length = 0;
    presenceService = {
      update: jest.fn().mockResolvedValue({
        staff: { ticketId: 'ticket-1', audience: 'staff', people: [] },
        requester: {
          ticketId: 'ticket-1',
          audience: 'requester',
          agentTyping: false,
        },
      }),
    };
    hub = new TicketRealtimeHub();
    gateway = new TicketChatGateway(
      { authorizeSocketJoin } as never,
      hub,
      new SettingsRealtimeHub(),
      abuseLimiter as unknown as WebsocketAbuseLimiter,
      undefined,
      presenceService as never,
    );
    gateway.server = {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          emitted.push({ room, event, payload });
        },
      }),
      emit: jest.fn(),
    } as unknown as Server;
    gateway.afterInit();
  });

  afterEach(() => {
    gateway.onModuleDestroy();
    jest.useRealTimers();
    if (originalLegacyGroupEmit === undefined) {
      delete process.env.WS_GROUP_FEED_LEGACY_FULL_EMIT;
      return;
    }
    process.env.WS_GROUP_FEED_LEGACY_FULL_EMIT = originalLegacyGroupEmit;
  });

  it('joins public or staff rooms after the same ticket authorization', async () => {
    authorizeSocketJoin.mockResolvedValue({ visibility: 'public' });
    const requester = createClient('user-requester');
    await expect(
      gateway.handleJoin(requester, { ticketId: 'ticket-1' }),
    ).resolves.toEqual({ ok: true, visibility: 'public' });
    expect(authorizeSocketJoin).toHaveBeenCalledWith('ticket-1', {
      actorUserId: 'user-requester',
    });
    expect(requester.join).toHaveBeenCalledWith(ticketPublicRoomName('ticket-1'));
    authorizeSocketJoin.mockResolvedValue({ visibility: 'staff' });
    const agent = createClient('user-agent-it');
    await gateway.handleJoin(agent, { ticketId: 'ticket-1' });
    expect(agent.join).toHaveBeenCalledWith(ticketStaffRoomName('ticket-1'));
  });

  it('rejects unauthorized socket joins and does not join rooms', async () => {
    authorizeSocketJoin.mockRejectedValue({
      response: { code: 'FORBIDDEN' },
    });
    const foreign = createClient('user-agent-hr');
    await expect(
      gateway.handleJoin(foreign, { ticketId: 'ticket-1' }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(foreign.join).not.toHaveBeenCalled();
    await expect(gateway.handleJoin(foreign, {})).rejects.toBeInstanceOf(
      WsException,
    );
  });

  it('replaces public and staff rooms without overlapping visibility', async () => {
    authorizeSocketJoin
      .mockResolvedValueOnce({ visibility: 'public' })
      .mockResolvedValueOnce({ visibility: 'staff' })
      .mockResolvedValueOnce({ visibility: 'public' });
    const client = createClient('user-agent-it');

    await gateway.handleJoin(client, { ticketId: 'ticket-1' });
    client.operationLog.length = 0;
    await gateway.handleJoin(client, { ticketId: 'ticket-1' });
    expect([...client.rooms].sort()).toEqual(
      ['ticket:ticket-1', ticketStaffRoomName('ticket-1')].sort(),
    );
    expect(
      client.operationLog.indexOf(`leave:${ticketPublicRoomName('ticket-1')}`),
    ).toBeLessThan(
      client.operationLog.indexOf(`join:${ticketStaffRoomName('ticket-1')}`),
    );

    client.operationLog.length = 0;
    await gateway.handleJoin(client, { ticketId: 'ticket-1' });
    expect([...client.rooms].sort()).toEqual(
      ['ticket:ticket-1', ticketPublicRoomName('ticket-1')].sort(),
    );
    expect(
      client.operationLog.indexOf(`leave:${ticketStaffRoomName('ticket-1')}`),
    ).toBeLessThan(
      client.operationLog.indexOf(`join:${ticketPublicRoomName('ticket-1')}`),
    );
  });

  it('removes an existing subscription when a later authorization is denied', async () => {
    authorizeSocketJoin
      .mockResolvedValueOnce({ visibility: 'public' })
      .mockRejectedValueOnce({ response: { code: 'FORBIDDEN' } });
    const client = createClient('user-agent-it');

    await gateway.handleJoin(client, { ticketId: 'ticket-1' });
    await expect(
      gateway.handleJoin(client, { ticketId: 'ticket-1' }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(client.rooms.size).toBe(0);
  });

  it('reauthorizes before forwarding a ticket update and swaps visibility', async () => {
    authorizeSocketJoin
      .mockResolvedValueOnce({ visibility: 'staff' })
      .mockResolvedValueOnce({ visibility: 'public' });
    const client = createClient('user-agent-it');
    await gateway.handleJoin(client, { ticketId: 'ticket-1' });

    await hub.publishTicketUpdatedAwaited(ticketUpdatedPayload());

    expect([...client.rooms].sort()).toEqual(
      ['ticket:ticket-1', ticketPublicRoomName('ticket-1')].sort(),
    );
    expect(
      emitted.some((item) => item.event === ticketRealtimeEventNames.ticketUpdated),
    ).toBe(true);
    expect(
      client.operationLog.indexOf(`leave:${ticketStaffRoomName('ticket-1')}`),
    ).toBeLessThan(
      client.operationLog.indexOf(`join:${ticketPublicRoomName('ticket-1')}`),
    );
  });

  it('fails closed when ticket-update reauthorization is denied', async () => {
    authorizeSocketJoin
      .mockResolvedValueOnce({ visibility: 'staff' })
      .mockRejectedValueOnce({ response: { code: 'FORBIDDEN' } });
    const client = createClient('user-agent-it');
    await gateway.handleJoin(client, { ticketId: 'ticket-1' });

    await hub.publishTicketUpdatedAwaited(ticketUpdatedPayload());

    expect(client.rooms.size).toBe(0);
    expect(
      emitted.some((item) => item.event === ticketRealtimeEventNames.ticketUpdated),
    ).toBe(true);
  });

  it('holds message and Edge fan-out until the new access epoch is checked', async () => {
    authorizeSocketJoin.mockResolvedValueOnce({ visibility: 'staff' });
    const client = createClient('user-agent-it');
    await gateway.handleJoin(client, { ticketId: 'ticket-1' });

    let resolveAuthorization:
      | ((access: { visibility: 'public' | 'staff' }) => void)
      | undefined;
    authorizeSocketJoin.mockImplementationOnce(
      () =>
        new Promise<{ visibility: 'public' | 'staff' }>((resolve) => {
          resolveAuthorization = resolve;
        }),
    );
    const update = hub.publishTicketUpdatedAwaited(ticketUpdatedPayload());
    await flushMicrotasks();
    hub.publishEdgeEvent({
      userId: 'user-agent-it',
      ticketId: 'ticket-1',
      eventName: 'edge.ticket.activity',
      data: { ticketId: 'ticket-1' },
    });
    const message = hub.publishAwaited(ticketMessagePayload());
    await flushMicrotasks();

    expect(emitted).toEqual([]);
    resolveAuthorization?.({ visibility: 'public' });
    await Promise.all([update, message]);
    await flushMicrotasks();

    expect([...client.rooms].sort()).toEqual(
      ['ticket:ticket-1', ticketPublicRoomName('ticket-1')].sort(),
    );
    expect(
      emitted.some((item) => item.event === ticketRealtimeEventNames.ticketUpdated),
    ).toBe(true);
    expect(
      emitted.some((item) => item.event === ticketRealtimeEventNames.messageCreated),
    ).toBe(true);
    expect(emitted.some((item) => item.event === 'edge.ticket.activity')).toBe(true);
  });

  it('rejects presence from a ticket subscription revoked by revalidation', async () => {
    authorizeSocketJoin
      .mockResolvedValueOnce({ visibility: 'staff' })
      .mockRejectedValueOnce({ response: { code: 'FORBIDDEN' } });
    const client = createClient('user-agent-it');
    await gateway.handleJoin(client, { ticketId: 'ticket-1' });
    await hub.publishTicketUpdatedAwaited(ticketUpdatedPayload());

    await expect(
      gateway.handlePresence(client, {
        ticketId: 'ticket-1',
        state: 'typing',
        channel: 'internal',
      }),
    ).resolves.toEqual({ ok: false });
    expect(presenceService.update).not.toHaveBeenCalled();
  });

  it('periodically reauthorizes active ticket subscriptions as a fallback', async () => {
    gateway.onModuleDestroy();
    jest.useFakeTimers();
    hub = new TicketRealtimeHub();
    gateway = new TicketChatGateway(
      { authorizeSocketJoin } as never,
      hub,
      new SettingsRealtimeHub(),
      abuseLimiter as unknown as WebsocketAbuseLimiter,
      undefined,
      presenceService as never,
    );
    gateway.server = {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          emitted.push({ room, event, payload });
        },
      }),
      emit: jest.fn(),
    } as unknown as Server;
    gateway.afterInit();
    authorizeSocketJoin
      .mockResolvedValueOnce({ visibility: 'public' })
      .mockRejectedValueOnce(new Error('authority unavailable'));
    const client = createClient('user-requester');
    await gateway.handleJoin(client, { ticketId: 'ticket-1' });

    await jest.advanceTimersByTimeAsync(ticketSocketRevalidationIntervalMs);
    await flushMicrotasks();

    expect(authorizeSocketJoin).toHaveBeenCalledTimes(2);
    expect(client.rooms.size).toBe(0);
  });

  it('limits ticket:join and ticket:leave per socket (Val 3, M11/B2)', async () => {
    authorizeSocketJoin.mockResolvedValue({ visibility: 'public' });
    const client = createClient('user-agent-it');
    for (let i = 0; i < joinLeaveRateLimit.maxMessagesPerMinute; i += 1) {
      await expect(
        gateway.handleJoin(client, { ticketId: 'ticket-1' }),
      ).resolves.toEqual({ ok: true, visibility: 'public' });
    }
    const authorizations = authorizeSocketJoin.mock.calls.length;
    await expect(
      gateway.handleJoin(client, { ticketId: 'ticket-1' }),
    ).resolves.toEqual({ ok: false });
    // Over the limit nothing is authorized and nothing is joined.
    expect(authorizeSocketJoin).toHaveBeenCalledTimes(authorizations);
    await expect(
      gateway.handleLeave(client, { ticketId: 'ticket-1' }),
    ).resolves.toEqual({ ok: false });
  });

  it('caps distinct active tickets, permits duplicate joins and frees a slot on leave', async () => {
    authorizeSocketJoin.mockResolvedValue({ visibility: 'public' });
    const client = createClient('user-cap');
    for (let i = 0; i < maxTicketSubscriptionsPerSocket; i += 1) {
      await expect(gateway.handleJoin(client, { ticketId: `cap-${i}` })).resolves.toEqual({ ok: true, visibility: 'public' });
    }
    await expect(gateway.handleJoin(client, { ticketId: 'cap-0' })).resolves.toEqual({ ok: true, visibility: 'public' });
    const calls = authorizeSocketJoin.mock.calls.length;
    await expect(gateway.handleJoin(client, { ticketId: 'overflow' })).resolves.toEqual({ ok: false, code: 'TICKET_ROOM_LIMIT' });
    expect(authorizeSocketJoin).toHaveBeenCalledTimes(calls);
    await expect(gateway.handleLeave(client, { ticketId: 'cap-0' })).resolves.toEqual({ ok: true });
    await expect(gateway.handleJoin(client, { ticketId: 'overflow' })).resolves.toEqual({ ok: true, visibility: 'public' });
  });

  it('retains a slot until an asynchronous room leave completes', async () => {
    authorizeSocketJoin.mockResolvedValue({ visibility: 'public' });
    const client = createClient('user-leave-cap');
    for (let i = 0; i < maxTicketSubscriptionsPerSocket; i += 1) {
      await gateway.handleJoin(client, { ticketId: `leave-${i}` });
    }
    let finishLeave: (() => void) | undefined;
    const originalLeave = client.leave.bind(client);
    client.leave = jest.fn(async (room: string) => {
      if (room === 'ticket:leave-0') {
        await new Promise<void>((resolve) => { finishLeave = resolve; });
      }
      await originalLeave(room);
    }) as Socket['leave'];
    const leaving = gateway.handleLeave(client, { ticketId: 'leave-0' });
    await flushMicrotasks();
    await expect(gateway.handleJoin(client, { ticketId: 'overflow' })).resolves.toEqual({ ok: false, code: 'TICKET_ROOM_LIMIT' });
    finishLeave?.();
    await leaving;
    await expect(gateway.handleJoin(client, { ticketId: 'overflow' })).resolves.toEqual({ ok: true, visibility: 'public' });
  });

  it('reserves capacity before concurrent authorization and releases failed joins', async () => {
    const pending: Array<{ ticketId: string; resolve: (v: { visibility: 'public' }) => void; reject: (e: Error) => void }> = [];
    authorizeSocketJoin.mockImplementation((ticketId: string) => new Promise((resolve, reject) => pending.push({ ticketId, resolve, reject })));
    const client = createClient('user-pending-cap');
    const joins = Array.from({ length: maxTicketSubscriptionsPerSocket }, (_, i) => gateway.handleJoin(client, { ticketId: `pending-${i}` }));
    await flushMicrotasks();
    await expect(gateway.handleJoin(client, { ticketId: 'overflow' })).resolves.toEqual({ ok: false, code: 'TICKET_ROOM_LIMIT' });
    expect(authorizeSocketJoin).toHaveBeenCalledTimes(maxTicketSubscriptionsPerSocket);
    const failed = joins[0]!.catch(() => undefined);
    pending[0]!.reject(new Error('denied'));
    await failed;
    authorizeSocketJoin.mockResolvedValue({ visibility: 'public' });
    await expect(gateway.handleJoin(client, { ticketId: 'overflow' })).resolves.toEqual({ ok: true, visibility: 'public' });
    for (const item of pending.slice(1)) item.resolve({ visibility: 'public' });
    await Promise.all(joins.slice(1));
  });

  it('applies a shared per-user join/leave ceiling before authorization work', async () => {
    abuseLimiter.consumeUserAction.mockResolvedValue(false);
    const client = createClient('user-agent-it');
    await expect(
      gateway.handleJoin(client, { ticketId: 'ticket-1' }),
    ).resolves.toEqual({ ok: false });
    expect(abuseLimiter.consumeUserAction).toHaveBeenCalledWith(
      'user-agent-it',
      'join_leave',
    );
    expect(authorizeSocketJoin).not.toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('fails closed when the shared presence limiter is unavailable', async () => {
    authorizeSocketJoin.mockResolvedValue({ visibility: 'public' });
    const client = createClient('user-requester');
    await gateway.handleJoin(client, { ticketId: 'ticket-1' });
    abuseLimiter.consumeUserAction.mockRejectedValueOnce(
      new Error('Redis unavailable'),
    );
    await expect(
      gateway.handlePresence(client, {
        ticketId: 'ticket-1',
        state: 'typing',
        channel: 'public',
      }),
    ).resolves.toEqual({ ok: false });
    expect(presenceService.update).not.toHaveBeenCalled();
  });

  it('leaves previously joined ticket rooms', async () => {
    const client = createClient('user-agent-it');
    await gateway.handleLeave(client, { ticketId: 'ticket-1' });
    expect(client.leave).toHaveBeenCalledWith('ticket:ticket-1');
    expect(client.leave).toHaveBeenCalledWith(ticketPublicRoomName('ticket-1'));
    expect(client.leave).toHaveBeenCalledWith(ticketStaffRoomName('ticket-1'));
  });

  it('broadcasts public messages to public+staff rooms and keeps notes staff-only', () => {
    const publicPayload: TicketRealtimeMessagePayload = {
      id: 'msg-public',
      ticketId: 'ticket-1',
      type: 'AGENT_REPLY',
      body: 'Working on it',
      authorUserId: 'user-agent-it',
      createdAt: '2026-09-11T12:00:00.000Z',
      requesterId: 'user-requester',
      assignedGroupId: 'group-it',
      visibility: 'public',
    };
    hub.publish(publicPayload);
    // Group membership alone is not ticket-level authorization: default room
    // fan-out is limited to the lightweight change signal.
    expect(
      emitted.filter((item) => item.room === 'group:group-it').map((item) => item.event),
    ).toEqual(['group.feed-changed']);
    expect([...new Set(emitted.map((item) => item.room))].sort()).toEqual([
      'group:group-it',
      ticketPublicRoomName('ticket-1'),
      ticketStaffRoomName('ticket-1'),
      userRoomName('user-requester'),
    ]);
    emitted.length = 0;
    hub.publish({
      ...publicPayload,
      id: 'msg-internal',
      type: 'INTERNAL_NOTE',
      visibility: 'staff',
    });
    // Internal notes stay in the ticket's staff room: membership of a group
    // room alone does not prove staff access to this specific ticket.
    expect(emitted.map((item) => item.room).sort()).toEqual([
      ticketStaffRoomName('ticket-1'),
    ]);
    expect(
      emitted.every((item) => item.event === ticketRealtimeEventNames.messageCreated),
    ).toBe(true);
  });

  it('forwards ticket.updated from the hub after init', () => {
    hub.publishTicketUpdated({
      ticketId: 'ticket-1',
      change: 'status',
      sourceAction: 'ticket_resolved',
      sourceMessageId: 'msg-1',
      status: 'RESOLVED',
      priority: 'HIGH',
      assignedUserId: null,
      assignedGroupId: 'group-it',
      requesterId: 'user-requester',
      archivedAt: null,
      resolvedAt: '2026-09-13T08:00:00.000Z',
      closedAt: null,
      actorUserId: 'user-agent-it',
      occurredAt: '2026-09-13T08:00:00.000Z',
      visibility: 'public',
    });
    expect(
      emitted.some((item) => item.event === ticketRealtimeEventNames.ticketUpdated),
    ).toBe(true);
    expect([...new Set(emitted.map((item) => item.room))].sort()).toEqual([
      'group:group-it',
      ticketPublicRoomName('ticket-1'),
      ticketStaffRoomName('ticket-1'),
      userRoomName('user-agent-it'),
      userRoomName('user-requester'),
    ]);
  });
});

type TestSocket = Socket & {
  readonly rooms: Set<string>;
  readonly operationLog: string[];
};

function createClient(subjectId: string): TestSocket {
  const rooms = new Set<string>();
  const operationLog: string[] = [];
  return {
    id: `socket-${subjectId}`,
    data: {
      principal: {
        subjectId,
        sessionId: `session-${subjectId}`,
        jti: `jti-${subjectId}`,
        issuedAt: 1,
        expiresAt: 9_999_999_999,
        authzVersion: 0,
      },
      websocketConnectionLeaseMember: `socket-${subjectId}`,
    },
    rooms,
    operationLog,
    emit: jest.fn(),
    join: jest.fn(async (room: string) => {
      operationLog.push(`join:${room}`);
      rooms.add(room);
    }),
    leave: jest.fn(async (room: string) => {
      operationLog.push(`leave:${room}`);
      rooms.delete(room);
    }),
  } as unknown as TestSocket;
}

function ticketMessagePayload(): TicketRealtimeMessagePayload {
  return {
    id: 'message-1',
    ticketId: 'ticket-1',
    type: 'AGENT_REPLY',
    body: 'Update after authorization',
    authorUserId: 'user-agent-it',
    createdAt: '2026-11-07T12:00:00.000Z',
    requesterId: 'user-requester',
    assignedGroupId: 'group-it',
    visibility: 'public',
  };
}

function ticketUpdatedPayload(): TicketUpdatedRealtimePayload {
  return {
    ticketId: 'ticket-1',
    change: 'assignment',
    sourceAction: 'ticket_assigned',
    sourceMessageId: 'message-1',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    assignedUserId: null,
    assignedGroupId: 'group-it',
    requesterId: 'user-requester',
    archivedAt: null,
    resolvedAt: null,
    closedAt: null,
    actorUserId: 'user-agent-it',
    occurredAt: '2026-11-07T12:00:00.000Z',
    visibility: 'public',
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
}
