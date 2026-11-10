import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Server, Socket } from 'socket.io';
import { SOCKET_AUTHENTICATION_FAILED_MESSAGE } from './socket-authentication-failed-message';
import { SocketAuthenticationService } from './socket-authentication.service';
import type { SocketAuthenticationResult } from './socket-authentication.types';
import { SOCKET_AUTHENTICATION_VERIFIER } from './socket-authentication.verifier-token';
import { SocketGroupMembershipService } from './socket-group-membership.service';
import { SessionTokenService } from '../authentication/session-token.service';
import { WebsocketAdapterHealthService } from './websocket-adapter-health.service';
import { WebsocketAbuseLimiter } from './websocket-abuse-limiter';
import { WebsocketGateway } from './websocket.gateway';
import { consumeWebsocketRoomSetupFailures } from './websocket-room-setup-counter';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const SYNTHETIC_TOKEN = 'synthetic-handshake-token-test-only';
const LEASE_PRINCIPAL = {
  subjectId: 'subject-user-1',
  sessionId: 'session-user-1',
  jti: 'token-id-1',
  issuedAt: 1_800_000_000,
  expiresAt: 1_800_003_600,
  authzVersion: 7,
} as const;

type HandshakeMiddleware = (
  socket: Socket,
  next: (error?: Error) => void,
) => void;

function createSocket(auth: unknown): Socket {
  const rooms = new Set(['connection-test-1']);
  return {
    id: 'connection-test-1',
    handshake: { auth, headers: {}, address: '203.0.113.20' },
    data: {},
    rooms,
    disconnected: false,
    disconnect: jest.fn(() => rooms.clear()),
    join: jest.fn(async (room: string) => rooms.add(room)),
    leave: jest.fn(async (room: string) => rooms.delete(room)),
  } as unknown as Socket;
}

function captureHandshakeMiddleware(
  gateway: WebsocketGateway,
): HandshakeMiddleware {
  let middleware: HandshakeMiddleware | undefined;
  const server = {
    use: (handler: HandshakeMiddleware) => {
      middleware = handler;
    },
  };
  gateway.afterInit(server as Server);
  if (middleware === undefined) {
    throw new Error('handshake middleware was not registered');
  }
  return middleware;
}

async function completeHandshake(
  middleware: HandshakeMiddleware,
  socket: Socket,
): Promise<Error | undefined> {
  return new Promise((resolve) => {
    middleware(socket, (error?: Error) => {
      resolve(error);
    });
  });
}

function joinedLogOutput(
  logSpy: jest.SpiedFunction<Logger['log']>,
  warnSpy: jest.SpiedFunction<Logger['warn']>,
): string {
  return [...logSpy.mock.calls, ...warnSpy.mock.calls]
    .map((call) => JSON.stringify(call))
    .join('\n');
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('WebsocketGateway', () => {
  const verify = jest.fn(
    async (): Promise<SocketAuthenticationResult> => ({
      status: 'unauthenticated',
      reason: 'invalid_credentials',
    }),
  );
  const abuseLimiter = {
    consumeHandshakeIp: jest.fn(async () => true),
    admitConnection: jest.fn(async () => true),
    renewConnection: jest.fn(async () => true),
    releaseConnection: jest.fn(async () => undefined),
  };
  const roomAccessForUser = jest.fn(async () => ({
    authzVersion: LEASE_PRINCIPAL.authzVersion,
    isActive: true,
    groupIds: [] as readonly string[],
    isAdmin: false,
  }));
  let moduleRef: TestingModule | undefined;
  let logSpy: jest.SpiedFunction<Logger['log']>;
  let warnSpy: jest.SpiedFunction<Logger['warn']>;

  const createGateway = async (): Promise<WebsocketGateway> => {
    moduleRef = await Test.createTestingModule({
      providers: [
        WebsocketGateway,
        SocketAuthenticationService,
        { provide: SOCKET_AUTHENTICATION_VERIFIER, useValue: { verify } },
        {
          provide: SocketGroupMembershipService,
          useValue: { roomAccessForUser },
        },
        {
          provide: SessionTokenService,
          useValue: { isSocketSessionCurrent: jest.fn(async () => true) },
        },
        { provide: WebsocketAbuseLimiter, useValue: abuseLimiter },
        WebsocketAdapterHealthService,
      ],
    }).compile();
    return moduleRef.get(WebsocketGateway);
  };

  beforeEach(() => {
    verify.mockReset();
    abuseLimiter.consumeHandshakeIp.mockReset().mockResolvedValue(true);
    abuseLimiter.admitConnection.mockReset().mockResolvedValue(true);
    abuseLimiter.renewConnection.mockReset().mockResolvedValue(true);
    abuseLimiter.releaseConnection.mockReset().mockResolvedValue(undefined);
    roomAccessForUser.mockReset();
    consumeWebsocketRoomSetupFailures();
    roomAccessForUser.mockResolvedValue({
      authzVersion: LEASE_PRINCIPAL.authzVersion,
      isActive: true,
      groupIds: [],
      isAdmin: false,
    });
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(async () => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    if (moduleRef !== undefined) {
      await moduleRef.close();
    }
  });

  it('attaches a minimal principal on a valid authenticated handshake', async () => {
    verify.mockResolvedValue({
      status: 'authenticated',
      principal: LEASE_PRINCIPAL,
    });
    const gateway = await createGateway();
    const socket = createSocket({ token: SYNTHETIC_TOKEN });
    socket.handshake.headers.cookie =
      `helpdesk_session=${SYNTHETIC_TOKEN}; theme=compact`;
    socket.handshake.headers.authorization = `Bearer ${SYNTHETIC_TOKEN}`;
    const error = await completeHandshake(
      captureHandshakeMiddleware(gateway),
      socket,
    );
    expect(error).toBeUndefined();
    expect(verify).toHaveBeenCalledWith({ token: SYNTHETIC_TOKEN });
    expect(socket.data.principal).toEqual(LEASE_PRINCIPAL);
    expect(socket.data.websocketConnectionLeaseMember).toBe(socket.id);
    expect(abuseLimiter.consumeHandshakeIp).toHaveBeenCalledWith('203.0.113.20');
    expect(abuseLimiter.admitConnection).toHaveBeenCalledWith(
      LEASE_PRINCIPAL.subjectId,
      socket.id,
    );
    expect(socket.data.principal).not.toHaveProperty('token');
    expect(socket.handshake.auth).not.toHaveProperty('token');
    expect(socket.handshake.headers.cookie).toBe('theme=compact');
    expect(socket.handshake.headers.authorization).toBeUndefined();
    expect(JSON.stringify(socket.handshake)).not.toContain(SYNTHETIC_TOKEN);
    expect(typeof socket.data.requestId).toBe('string');
    expect(joinedLogOutput(logSpy, warnSpy)).not.toContain(SYNTHETIC_TOKEN);
  });

  it('rejects over-limit IP handshakes before credential verification', async () => {
    abuseLimiter.consumeHandshakeIp.mockResolvedValue(false);
    const gateway = await createGateway();
    const socket = createSocket({ token: SYNTHETIC_TOKEN });
    const error = await completeHandshake(
      captureHandshakeMiddleware(gateway),
      socket,
    );
    expect(error?.message).toBe(SOCKET_AUTHENTICATION_FAILED_MESSAGE);
    expect(verify).not.toHaveBeenCalled();
    expect(abuseLimiter.admitConnection).not.toHaveBeenCalled();
    expect(socket.data.principal).toBeUndefined();
  });

  it('rejects reconnects when the shared user bucket or connection cap denies admission', async () => {
    verify.mockResolvedValue({
      status: 'authenticated',
      principal: LEASE_PRINCIPAL,
    });
    abuseLimiter.admitConnection.mockResolvedValue(false);
    const gateway = await createGateway();
    const socket = createSocket({ token: SYNTHETIC_TOKEN });
    const error = await completeHandshake(
      captureHandshakeMiddleware(gateway),
      socket,
    );
    expect(error?.message).toBe(SOCKET_AUTHENTICATION_FAILED_MESSAGE);
    expect(socket.data.principal).toBeUndefined();
    expect(socket.data.websocketConnectionLeaseMember).toBeUndefined();
    expect(joinedLogOutput(logSpy, warnSpy)).toContain(
      'reason=user_rate_or_connection_cap',
    );
  });

  it('fails closed when authenticated admission cannot reserve a user connection slot', async () => {
    verify.mockResolvedValue({
      status: 'authenticated',
      principal: LEASE_PRINCIPAL,
    });
    abuseLimiter.admitConnection.mockRejectedValue(new Error('Redis unavailable'));
    const gateway = await createGateway();
    const socket = createSocket({ token: SYNTHETIC_TOKEN });
    const error = await completeHandshake(
      captureHandshakeMiddleware(gateway),
      socket,
    );
    expect(error?.message).toBe(SOCKET_AUTHENTICATION_FAILED_MESSAGE);
    expect(socket.data.principal).toBeUndefined();
    expect(socket.data.websocketConnectionLeaseMember).toBeUndefined();
    expect(joinedLogOutput(logSpy, warnSpy)).toContain(
      'reason=admission_control_unavailable fail_closed=1',
    );
  });

  it('keeps readiness failed when only the in-memory adapter is available', async () => {
    const gateway = await createGateway();
    const adapter = jest.fn();
    gateway.afterInit({ use: jest.fn(), adapter } as unknown as Server);

    expect(moduleRef?.get(WebsocketAdapterHealthService).isReady()).toBe(false);
    expect(adapter).not.toHaveBeenCalled();
    expect(joinedLogOutput(logSpy, warnSpy)).toContain(
      'ws_adapter_redis_state=degraded fallback=in_memory reason=redis_unconfigured',
    );
  });

  it('keeps readiness failed when the boot ACL probe denies adapter channels', async () => {
    const gateway = await createGateway();
    Object.assign(gateway, { adapterSubscriptionCheck: 'denied' });
    const adapter = jest.fn();
    gateway.afterInit({ use: jest.fn(), adapter } as unknown as Server);

    expect(moduleRef?.get(WebsocketAdapterHealthService).isReady()).toBe(false);
    expect(adapter).not.toHaveBeenCalled();
    expect(joinedLogOutput(logSpy, warnSpy)).toContain(
      'ws_adapter_redis_state=degraded fallback=in_memory reason=acl_denied',
    );
  });

  it('rejects missing authentication without exposing credentials', async () => {
    const gateway = await createGateway();
    const socket = createSocket(undefined);
    const error = await completeHandshake(
      captureHandshakeMiddleware(gateway),
      socket,
    );
    expect(error).toBeDefined();
    expect(error?.message).toBe(SOCKET_AUTHENTICATION_FAILED_MESSAGE);
    expect(error?.message).not.toContain(SYNTHETIC_TOKEN);
    expect(verify).not.toHaveBeenCalled();
    expect(socket.data.principal).toBeUndefined();
    expect(joinedLogOutput(logSpy, warnSpy)).not.toContain(SYNTHETIC_TOKEN);
  });

  it('rejects verifier failure without leaking the token', async () => {
    verify.mockResolvedValue({
      status: 'unauthenticated',
      reason: 'invalid_credentials',
    });
    const gateway = await createGateway();
    const socket = createSocket({ token: SYNTHETIC_TOKEN });
    const error = await completeHandshake(
      captureHandshakeMiddleware(gateway),
      socket,
    );
    expect(error?.message).toBe(SOCKET_AUTHENTICATION_FAILED_MESSAGE);
    expect(error?.message).not.toContain(SYNTHETIC_TOKEN);
    expect(socket.data.principal).toBeUndefined();
    expect(joinedLogOutput(logSpy, warnSpy)).not.toContain(SYNTHETIC_TOKEN);
  });

  it('rejects when the verifier throws a message that includes the token', async () => {
    verify.mockRejectedValue(new Error(`invalid token ${SYNTHETIC_TOKEN}`));
    const gateway = await createGateway();
    const socket = createSocket({ token: SYNTHETIC_TOKEN });
    const error = await completeHandshake(
      captureHandshakeMiddleware(gateway),
      socket,
    );
    expect(error?.message).toBe(SOCKET_AUTHENTICATION_FAILED_MESSAGE);
    expect(error?.message).not.toContain(SYNTHETIC_TOKEN);
    expect(joinedLogOutput(logSpy, warnSpy)).not.toContain(SYNTHETIC_TOKEN);
  });

  it('joins the user room after an authenticated connection', async () => {
    const gateway = await createGateway();
    const socket = createSocket({ token: SYNTHETIC_TOKEN });
    socket.data.principal = LEASE_PRINCIPAL;
    socket.data.websocketConnectionLeaseMember = socket.id;
    await gateway.handleConnection(socket);
    expect(socket.join).toHaveBeenCalledWith('user:subject-user-1');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('waits for the user room join before reading group membership', async () => {
    const gateway = await createGateway();
    const socket = createSocket({ token: SYNTHETIC_TOKEN });
    const joinGate = createDeferred();
    const join = socket.join as unknown as jest.Mock;
    join.mockReturnValueOnce(joinGate.promise);
    socket.data.principal = LEASE_PRINCIPAL;
    socket.data.websocketConnectionLeaseMember = socket.id;

    const pending = gateway.handleConnection(socket);
    expect(socket.join).toHaveBeenCalledWith('user:subject-user-1');
    expect(roomAccessForUser).not.toHaveBeenCalled();
    expect(joinedLogOutput(logSpy, warnSpy)).not.toContain('socket_connected');

    joinGate.resolve();
    await pending;

    expect(roomAccessForUser).toHaveBeenCalledWith('subject-user-1');
    expect(joinedLogOutput(logSpy, warnSpy)).toContain('socket_connected');
  });

  it('waits for authorized group room joins before logging the connection ready', async () => {
    roomAccessForUser.mockResolvedValue({
      authzVersion: LEASE_PRINCIPAL.authzVersion,
      isActive: true,
      groupIds: ['group-it'],
      isAdmin: false,
    });
    const gateway = await createGateway();
    const socket = createSocket({ token: SYNTHETIC_TOKEN });
    const groupJoinGate = createDeferred();
    const groupJoinStarted = createDeferred();
    const join = socket.join as unknown as jest.Mock;
    join.mockImplementation(async (room: string) => {
      if (room === 'group:group-it') {
        groupJoinStarted.resolve();
        await groupJoinGate.promise;
      }
      socket.rooms.add(room);
    });
    socket.data.principal = LEASE_PRINCIPAL;
    socket.data.websocketConnectionLeaseMember = socket.id;

    const pending = gateway.handleConnection(socket);
    await groupJoinStarted.promise;
    expect(joinedLogOutput(logSpy, warnSpy)).not.toContain('socket_connected');

    groupJoinGate.resolve();
    await pending;

    expect(joinedLogOutput(logSpy, warnSpy)).toContain(
      'socket_connected connectionId=connection-test-1 group_rooms_ready=1',
    );
  });

  it('joins the groups in one current room-authorization snapshot', async () => {
    roomAccessForUser.mockResolvedValue({
      authzVersion: LEASE_PRINCIPAL.authzVersion,
      isActive: true,
      groupIds: ['group-it'],
      isAdmin: false,
    });
    const gateway = await createGateway();
    const socket = createSocket({ token: SYNTHETIC_TOKEN });
    socket.data.principal = LEASE_PRINCIPAL;
    socket.data.websocketConnectionLeaseMember = socket.id;
    await gateway.handleConnection(socket);
    expect(roomAccessForUser).toHaveBeenCalledWith('subject-user-1');
    expect(socket.join).toHaveBeenCalledWith('group:group-it');
  });

  it('disconnects and counts user room join failures', async () => {
    const gateway = await createGateway();
    const socket = createSocket({ token: SYNTHETIC_TOKEN });
    const join = socket.join as unknown as jest.Mock;
    join.mockRejectedValueOnce(new Error('user room join failed'));
    socket.data.principal = LEASE_PRINCIPAL;
    socket.data.websocketConnectionLeaseMember = socket.id;

    await gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(consumeWebsocketRoomSetupFailures()).toEqual({ user: 1, group: 0 });
    expect(joinedLogOutput(logSpy, warnSpy)).toContain(
      'socket_room_setup_failed connectionId=connection-test-1 room=user fail_closed=1',
    );
  });

  it('counts group room join failures while retaining the fail-closed user room', async () => {
    roomAccessForUser.mockResolvedValue({
      authzVersion: LEASE_PRINCIPAL.authzVersion,
      isActive: true,
      groupIds: ['group-it'],
      isAdmin: false,
    });
    const gateway = await createGateway();
    const socket = createSocket({ token: SYNTHETIC_TOKEN });
    const join = socket.join as unknown as jest.Mock;
    join.mockImplementation(async (room: string) => {
      if (room === 'group:group-it') {
        throw new Error('group room join failed');
      }
      socket.rooms.add(room);
    });
    socket.data.principal = LEASE_PRINCIPAL;
    socket.data.websocketConnectionLeaseMember = socket.id;

    await gateway.handleConnection(socket);

    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(consumeWebsocketRoomSetupFailures()).toEqual({ user: 0, group: 1 });
    expect(joinedLogOutput(logSpy, warnSpy)).toContain(
      'socket_group_rooms_failed connectionId=connection-test-1 fail_closed=1',
    );
    expect(joinedLogOutput(logSpy, warnSpy)).toContain(
      'socket_connected connectionId=connection-test-1 group_rooms_ready=0',
    );
  });

  it('disconnects authenticated sockets that bypass admission middleware', async () => {
    const gateway = await createGateway();
    const socket = createSocket({ token: SYNTHETIC_TOKEN });
    socket.data.principal = LEASE_PRINCIPAL;
    await gateway.handleConnection(socket);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('disconnects unauthenticated sockets that reach the connection handler', async () => {
    const gateway = await createGateway();
    const socket = createSocket(undefined);
    await gateway.handleConnection(socket);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.data.principal).toBeUndefined();
  });

  it('releases the active user connection lease on disconnect', async () => {
    const gateway = await createGateway();
    const socket = createSocket({ token: SYNTHETIC_TOKEN });
    socket.data.principal = LEASE_PRINCIPAL;
    socket.data.websocketConnectionLeaseMember = socket.id;
    expect(() => {
      gateway.handleDisconnect(socket);
    }).not.toThrow();
    expect(abuseLimiter.releaseConnection).toHaveBeenCalledWith(
      LEASE_PRINCIPAL.subjectId,
      socket.id,
    );
    expect(socket.data.websocketConnectionLeaseMember).toBeUndefined();
  });
});
