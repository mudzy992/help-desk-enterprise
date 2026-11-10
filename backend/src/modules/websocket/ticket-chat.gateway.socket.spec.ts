import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server, type Socket } from 'socket.io';
import { io as createSocketClient, type Socket as ClientSocket } from 'socket.io-client';
import { attachSocketPrincipal } from './authenticated-socket';
import type { TicketRealtimeMessagePayload } from '../tickets/collaboration.types';
import { TicketRealtimeHub } from '../tickets/ticket-realtime.hub';
import type { TicketUpdatedRealtimePayload } from '../tickets/ticket-realtime.types';
import { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import { SettingsRealtimeHub } from '../settings/settings-realtime.hub';
import { TicketChatGateway } from './ticket-chat.gateway';
import { WebsocketAbuseLimiter } from './websocket-abuse-limiter';
import {
  ticketPublicRoomName,
  ticketRoomName,
  ticketStaffRoomName,
} from './ticket-socket-rooms';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../tickets/tickets-collaboration.service', () => ({
  TicketsCollaborationService: class TicketsCollaborationService {},
}));

describe('TicketChatGateway live socket room revalidation', () => {
  const authorizeSocketJoin = jest.fn();
  let gateway: TicketChatGateway | undefined;
  let ioServer: Server | undefined;
  let client: ClientSocket | undefined;
  const received: Array<{ readonly event: string; readonly value: unknown }> = [];

  afterEach(async () => {
    client?.disconnect();
    gateway?.onModuleDestroy();
    const server = ioServer;
    if (server !== undefined) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    client = undefined;
    gateway = undefined;
    ioServer = undefined;
    received.length = 0;
    authorizeSocketJoin.mockReset();
  });

  it('stops real clients receiving staff, public, presence and Edge events after access is removed', async () => {
    authorizeSocketJoin
      .mockResolvedValueOnce({ visibility: 'staff' })
      .mockResolvedValueOnce({ visibility: 'public' })
      .mockRejectedValueOnce(new Error('FORBIDDEN'));
    const realtimeHub = new TicketRealtimeHub();
    const socketGateway = new TicketChatGateway(
      { authorizeSocketJoin } as never,
      realtimeHub,
      new SettingsRealtimeHub(),
      {
        consumeUserAction: jest.fn(async () => true),
      } as unknown as WebsocketAbuseLimiter,
    );
    gateway = socketGateway;
    const httpServer = createHttpServer();
    const server = new Server(httpServer, { transports: ['websocket'] });
    ioServer = server;
    socketGateway.server = server;
    socketGateway.afterInit();
    server.on('connection', (socket: Socket) => {
      attachSocketPrincipal(socket, {
        subjectId: 'live-agent',
        sessionId: 'live-session',
        jti: 'live-token',
        issuedAt: Math.floor(Date.now() / 1000) - 1,
        expiresAt: Math.floor(Date.now() / 1000) + 3_600,
        authzVersion: 0,
      });
      socket.data.websocketConnectionLeaseMember = socket.id;
      socket.on('disconnect', () => {
        void socketGateway.handleDisconnect(socket);
      });
      void socketGateway
        .handleJoin(socket, { ticketId: 'ticket-live' })
        .then(() => socket.emit('test:joined'));
    });

    const address = await listen(httpServer);
    const liveClient = createSocketClient(address, {
      autoConnect: false,
      forceNew: true,
      reconnection: false,
      timeout: 3_000,
      transports: ['websocket'],
    });
    client = liveClient;
    liveClient.onAny((event: string, value: unknown) => {
      received.push({ event, value });
    });
    const joined = waitForClientEvent(liveClient, 'test:joined');
    liveClient.connect();
    await joined;

    const liveSocket = [...server.sockets.sockets.values()][0];
    if (liveSocket === undefined) {
      throw new Error('Expected the live Socket.IO connection to be registered');
    }
    expect(liveSocket.rooms.has(ticketStaffRoomName('ticket-live'))).toBe(true);
    const beforeDowngrade = waitForClientEvent(liveClient, 'protected:ticket');
    server.to(ticketStaffRoomName('ticket-live')).emit('protected:ticket', 'before');
    await expect(beforeDowngrade).resolves.toBe('before');

    await realtimeHub.publishTicketUpdatedAwaited(ticketUpdatedPayload('ticket-live'));
    expect(liveSocket.rooms.has(ticketStaffRoomName('ticket-live'))).toBe(false);
    expect(liveSocket.rooms.has(ticketPublicRoomName('ticket-live'))).toBe(true);

    const publicDelivery = waitForClientEvent(liveClient, 'protected:ticket');
    server.to(ticketStaffRoomName('ticket-live')).emit('protected:ticket', 'stale-staff');
    server.to(ticketPublicRoomName('ticket-live')).emit('protected:ticket', 'public-after-downgrade');
    await expect(publicDelivery).resolves.toBe('public-after-downgrade');
    await wait(50);
    expect(received.some((item) => item.value === 'stale-staff')).toBe(false);

    await realtimeHub.publishAwaited({
      ...ticketMessagePayload('ticket-live'),
      type: 'INTERNAL_NOTE',
      visibility: 'staff',
    });
    await wait(50);
    expect(
      received.some(
        (item) =>
          item.event === ticketRealtimeEventNames.messageCreated &&
          (item.value as TicketRealtimeMessagePayload).type === 'INTERNAL_NOTE',
      ),
    ).toBe(false);

    const edgeDelivery = waitForClientEvent(liveClient, 'edge.ticket.activity');
    realtimeHub.publishEdgeEvent({
      userId: 'live-agent',
      ticketId: 'ticket-live',
      eventName: 'edge.ticket.activity',
      data: { ticketId: 'ticket-live' },
    });
    await expect(edgeDelivery).resolves.toEqual({ ticketId: 'ticket-live' });

    const presenceDelivery = waitForClientEvent(
      liveClient,
      ticketRealtimeEventNames.presenceUpdate,
    );
    ioServer
      .to(ticketPublicRoomName('ticket-live'))
      .emit(ticketRealtimeEventNames.presenceUpdate, { ticketId: 'ticket-live' });
    await presenceDelivery;

    await realtimeHub.publishTicketUpdatedAwaited(ticketUpdatedPayload('ticket-live'));
    expect(liveSocket.rooms.has(ticketRoomName('ticket-live'))).toBe(false);
    expect(liveSocket.rooms.has(ticketPublicRoomName('ticket-live'))).toBe(false);
    expect(liveSocket.rooms.has(ticketStaffRoomName('ticket-live'))).toBe(false);

    const afterRevocationIndex = received.length;
    server.to(ticketStaffRoomName('ticket-live')).emit('protected:ticket', 'revoked-staff');
    server.to(ticketPublicRoomName('ticket-live')).emit('protected:ticket', 'revoked-public');
    server.to(ticketRoomName('ticket-live')).emit('edge.ticket.activity', 'revoked-edge');
    ioServer
      .to(ticketPublicRoomName('ticket-live'))
      .emit(ticketRealtimeEventNames.presenceUpdate, 'revoked-presence');
    await realtimeHub.publishAwaited(ticketMessagePayload('ticket-live'));
    await wait(100);

    expect(
      received.slice(afterRevocationIndex).some((item) =>
        String(item.value).startsWith('revoked-'),
      ),
    ).toBe(false);
    expect(liveClient.connected).toBe(true);
  }, 10_000);
});

async function listen(httpServer: ReturnType<typeof createHttpServer>): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    httpServer.once('error', onError);
    httpServer.listen(0, '127.0.0.1', () => {
      httpServer.off('error', onError);
      resolve();
    });
  });
  const address = httpServer.address() as AddressInfo | null;
  if (address === null) {
    throw new Error('Socket.IO integration server did not bind');
  }
  return `http://127.0.0.1:${address.port}`;
}

function waitForClientEvent(
  socket: ClientSocket,
  event: string,
  timeoutMs = 3_000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, onEvent);
      socket.off('connect_error', onError);
      reject(new Error(`Timed out waiting for Socket.IO event ${event}`));
    }, timeoutMs);
    const onEvent = (value: unknown) => {
      clearTimeout(timeout);
      socket.off('connect_error', onError);
      resolve(value);
    };
    const onError = (error: Error) => {
      clearTimeout(timeout);
      socket.off(event, onEvent);
      reject(error);
    };
    socket.once(event, onEvent);
    socket.once('connect_error', onError);
  });
}

function ticketMessagePayload(ticketId: string): TicketRealtimeMessagePayload {
  return {
    id: 'message-live',
    ticketId,
    type: 'AGENT_REPLY',
    body: 'Public reply',
    authorUserId: 'live-agent',
    createdAt: '2026-11-07T12:00:00.000Z',
    requesterId: 'live-requester',
    assignedGroupId: 'group-live',
    visibility: 'public',
  };
}

function ticketUpdatedPayload(ticketId: string): TicketUpdatedRealtimePayload {
  return {
    ticketId,
    change: 'assignment',
    sourceAction: 'ticket_assigned',
    sourceMessageId: 'message-live',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    assignedUserId: null,
    assignedGroupId: 'group-live',
    requesterId: 'live-requester',
    archivedAt: null,
    resolvedAt: null,
    closedAt: null,
    actorUserId: 'live-agent',
    occurredAt: '2026-11-07T12:00:00.000Z',
    visibility: 'public',
  };
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
