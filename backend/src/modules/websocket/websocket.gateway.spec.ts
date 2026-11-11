import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Server, Socket } from 'socket.io';
import { SOCKET_AUTHENTICATION_FAILED_MESSAGE } from './socket-authentication-failed-message';
import { SocketAuthenticationService } from './socket-authentication.service';
import type { SocketAuthenticationResult } from './socket-authentication.types';
import { SOCKET_AUTHENTICATION_VERIFIER } from './socket-authentication.verifier-token';
import { SocketGroupMembershipService } from './socket-group-membership.service';
import { WebsocketGateway } from './websocket.gateway';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const SYNTHETIC_TOKEN = 'synthetic-handshake-token-test-only';

type HandshakeMiddleware = (
  socket: Socket,
  next: (error?: Error) => void,
) => void;

function createSocket(auth: unknown): Socket {
  return {
    id: 'connection-test-1',
    handshake: { auth, headers: {} },
    data: {},
    disconnect: jest.fn(),
    join: jest.fn(),
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

describe('WebsocketGateway', () => {
  const verify = jest.fn(
    async (): Promise<SocketAuthenticationResult> => ({
      status: 'unauthenticated',
      reason: 'invalid_credentials',
    }),
  );
  const groupIdsForUser = jest.fn(async (): Promise<readonly string[]> => []);
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
          useValue: { groupIdsForUser },
        },
      ],
    }).compile();
    return moduleRef.get(WebsocketGateway);
  };

  beforeEach(() => {
    verify.mockReset();
    groupIdsForUser.mockReset();
    groupIdsForUser.mockResolvedValue([]);
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
      principal: { subjectId: 'subject-user-1' },
    });
    const gateway = await createGateway();
    const socket = createSocket({ token: SYNTHETIC_TOKEN });
    const error = await completeHandshake(
      captureHandshakeMiddleware(gateway),
      socket,
    );
    expect(error).toBeUndefined();
    expect(verify).toHaveBeenCalledWith({ token: SYNTHETIC_TOKEN });
    expect(socket.data.principal).toEqual({ subjectId: 'subject-user-1' });
    expect(socket.data.principal).not.toHaveProperty('token');
    expect(typeof socket.data.requestId).toBe('string');
    expect(joinedLogOutput(logSpy, warnSpy)).not.toContain(SYNTHETIC_TOKEN);
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
    socket.data.principal = { subjectId: 'subject-user-1' };
    gateway.handleConnection(socket);
    expect(socket.join).toHaveBeenCalledWith('user:subject-user-1');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('joins handler group rooms for the connected user', async () => {
    groupIdsForUser.mockResolvedValue(['group-it']);
    const gateway = await createGateway();
    const socket = createSocket({ token: SYNTHETIC_TOKEN });
    socket.data.principal = { subjectId: 'subject-user-1' };
    gateway.handleConnection(socket);
    await Promise.resolve();
    await Promise.resolve();
    expect(groupIdsForUser).toHaveBeenCalledWith('subject-user-1');
    expect(socket.join).toHaveBeenCalledWith('group:group-it');
  });

  it('disconnects unauthenticated sockets that reach the connection handler', async () => {
    const gateway = await createGateway();
    const socket = createSocket(undefined);
    gateway.handleConnection(socket);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.data.principal).toBeUndefined();
  });

  it('does not throw on disconnect', async () => {
    const gateway = await createGateway();
    const socket = createSocket({ token: SYNTHETIC_TOKEN });
    expect(() => {
      gateway.handleDisconnect(socket);
    }).not.toThrow();
  });
});
