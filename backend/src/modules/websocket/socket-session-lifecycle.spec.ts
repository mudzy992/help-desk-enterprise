import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
import {
  parseSocketSessionInvalidation,
  socketSessionInvalidationChannel,
} from '../../common/security/socket-session-invalidation';
import { SessionRevocationStore } from '../authentication/session-revocation.store';
import { SessionTokenService } from '../authentication/session-token.service';
import { disconnectInvalidatedSockets } from './socket-session-invalidation-subscriber';
import type { SocketPrincipal } from './socket-authentication.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

type FakeSocket = Socket & {
  readonly delivered: string[];
  readonly deliver: (event: string) => void;
};

function createPrincipal(): SocketPrincipal {
  return {
    subjectId: 'user-1',
    sessionId: 'session-1',
    jti: 'token-1',
    issuedAt: Math.floor(Date.now() / 1000) - 1,
    expiresAt: Math.floor(Date.now() / 1000) + 3_600,
    authzVersion: 3,
  };
}

function createLifecycleHarness() {
  const sockets = new Map<string, Socket>();
  let connected = true;
  const delivered: string[] = [];
  const socket = {
    id: 'socket-live',
    data: { principal: createPrincipal() },
    disconnect: jest.fn(() => {
      connected = false;
      sockets.delete('socket-live');
    }),
    deliver: (event: string) => {
      if (connected) delivered.push(event);
    },
    delivered,
  } as unknown as FakeSocket;
  sockets.set(socket.id, socket);
  const server = { sockets: { sockets } } as unknown as Server;
  const redisValues = new Map<string, string>();
  const redis = {
    status: 'ready',
    mget: jest.fn(async (...keys: string[]) =>
      keys.map((key) => redisValues.get(key) ?? null),
    ),
    set: jest.fn(async (key: string, value: string) => {
      redisValues.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => (redisValues.delete(key) ? 1 : 0)),
    publish: jest.fn(async (channel: string, message: string) => {
      expect(channel).toBe(socketSessionInvalidationChannel);
      const event = parseSocketSessionInvalidation(message);
      if (event !== null) disconnectInvalidatedSockets(server, event);
      return 1;
    }),
  };
  const store = new SessionRevocationStore(redis as never);
  const tokens = new SessionTokenService(
    new JwtService({}),
    { load: async () => 'socket-lifecycle-test-secret-value' } as never,
    store,
  );
  return { socket, redis, store, tokens };
}

describe('BA-websocket-01 session lifecycle acceptance', () => {
  it('disconnects an open socket on logout, session revoke, password revoke-all and deactivation', async () => {
    const now = Math.floor(Date.now() / 1000);
    const logout = createLifecycleHarness();
    logout.socket.deliver('ticket.updated:before-logout');
    await logout.tokens.revoke({
      subjectId: 'user-1',
      sessionId: 'session-1',
      jti: 'token-1',
      issuedAt: now - 1,
      expiresAt: now + 3_600,
      rememberMe: false,
    });
    logout.socket.deliver('ticket.updated:after-logout');
    expect(logout.socket.disconnect).toHaveBeenCalledWith(true);
    expect(logout.socket.delivered).toEqual(['ticket.updated:before-logout']);

    const revoke = createLifecycleHarness();
    await revoke.tokens.revokeSession('session-1');
    revoke.socket.deliver('ticket.updated:after-session-revoke');
    expect(revoke.socket.disconnect).toHaveBeenCalledWith(true);
    expect(revoke.socket.delivered).toEqual([]);

    const password = createLifecycleHarness();
    await password.tokens.revokeAllForUser('user-1');
    password.socket.deliver('ticket.updated:after-password-change');
    expect(password.socket.disconnect).toHaveBeenCalledWith(true);
    expect(password.socket.delivered).toEqual([]);

    const deactivation = createLifecycleHarness();
    const prisma = {
      user: {
        update: jest.fn(async () => ({ authzVersion: 4 })),
      },
    };
    const invalidator = new PrincipalContextInvalidator(
      prisma as never,
      deactivation.redis as never,
    );
    await invalidator.invalidateUser('user-1');
    deactivation.socket.deliver('ticket.updated:after-deactivation');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { authzVersion: { increment: 1 } },
      }),
    );
    expect(deactivation.socket.disconnect).toHaveBeenCalledWith(true);
    expect(deactivation.socket.delivered).toEqual([]);
  });
});
