import type { Server, Socket } from 'socket.io';
import type Redis from 'ioredis';
import { closeRedisClient } from '../../common/redis/close-redis-client';
import { createRedisClient } from '../../common/redis/create-redis-client';
import { loadRedisConfiguration } from '../../common/redis/load-redis-configuration';
import {
  parseSocketSessionInvalidation,
  socketSessionInvalidationChannel,
} from '../../common/security/socket-session-invalidation';
import { SessionRevocationStore } from '../authentication/session-revocation.store';
import { disconnectInvalidatedSockets } from './socket-session-invalidation-subscriber';
import type { SocketPrincipal } from './socket-authentication.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const describeIfRedis = process.env.REDIS_HOST ? describe : describe.skip;

function createInstanceSocket(instanceId: string) {
  let resolveDisconnected: (() => void) | undefined;
  let connected = true;
  const disconnected = new Promise<void>((resolve) => {
    resolveDisconnected = resolve;
  });
  const principal: SocketPrincipal = {
    subjectId: 'integration-user',
    sessionId: 'integration-session',
    jti: `integration-token-${instanceId}`,
    issuedAt: Math.floor(Date.now() / 1000) - 1,
    expiresAt: Math.floor(Date.now() / 1000) + 3_600,
    authzVersion: 1,
  };
  const socket = {
    id: `socket-${instanceId}`,
    data: { principal },
    disconnect: jest.fn(() => {
      connected = false;
      resolveDisconnected?.();
    }),
    deliver: () => connected,
  } as unknown as Socket & { readonly deliver: () => boolean };
  const server = {
    sockets: { sockets: new Map([[socket.id, socket]]) },
  } as unknown as Server;
  return { socket, server, disconnected };
}

function attachInvalidationListener(
  subscriber: Redis,
  server: Server,
  channel: string,
): void {
  subscriber.on('message', (receivedChannel: string, message: string) => {
    if (receivedChannel !== channel) return;
    const event = parseSocketSessionInvalidation(message);
    if (event !== null) disconnectInvalidatedSockets(server, event);
  });
}

describeIfRedis('socket session invalidation across Redis-backed API instances (integration)', () => {
  let publisher: Redis | undefined;
  let subscriberA: Redis | undefined;
  let subscriberB: Redis | undefined;

  afterEach(async () => {
    await Promise.all(
      [publisher, subscriberA, subscriberB]
        .filter((client): client is Redis => client !== undefined)
        .map(closeRedisClient),
    );
    publisher = undefined;
    subscriberA = undefined;
    subscriberB = undefined;
  });

  it('disconnects local sockets on two instances after a session revocation publish', async () => {
    const configuration = loadRedisConfiguration();
    publisher = createRedisClient(configuration);
    subscriberA = createRedisClient(configuration);
    subscriberB = createRedisClient(configuration);
    for (const client of [publisher, subscriberA, subscriberB]) {
      client.on('error', () => undefined);
    }

    const channel = socketSessionInvalidationChannel;
    const instanceA = createInstanceSocket('a');
    const instanceB = createInstanceSocket('b');
    attachInvalidationListener(subscriberA, instanceA.server, channel);
    attachInvalidationListener(subscriberB, instanceB.server, channel);
    await Promise.all([
      subscriberA.subscribe(channel),
      subscriberB.subscribe(channel),
    ]);

    const revocation = new SessionRevocationStore(publisher);
    await revocation.revokeSession('integration-session', 60);
    await Promise.race([
      Promise.all([instanceA.disconnected, instanceB.disconnected]),
      new Promise<never>((_resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Redis socket invalidation was not delivered to both instances')),
          2_000,
        );
        timer.unref?.();
      }),
    ]);

    expect(instanceA.socket.disconnect).toHaveBeenCalledWith(true);
    expect(instanceB.socket.disconnect).toHaveBeenCalledWith(true);
    expect(instanceA.socket.deliver()).toBe(false);
    expect(instanceB.socket.deliver()).toBe(false);
  });
});
