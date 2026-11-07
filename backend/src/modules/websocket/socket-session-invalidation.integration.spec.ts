import { createServer as createHttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { io as createSocketClient, type Socket as ClientSocket } from 'socket.io-client';
import type Redis from 'ioredis';
import { closeRedisClient } from '../../common/redis/close-redis-client';
import { createRedisClient } from '../../common/redis/create-redis-client';
import { loadRedisConfiguration } from '../../common/redis/load-redis-configuration';
import {
  parseSocketSessionInvalidation,
  socketSessionInvalidationChannel,
} from '../../common/security/socket-session-invalidation';
import { SessionRevocationStore } from '../authentication/session-revocation.store';
import { attachSocketPrincipal } from './authenticated-socket';
import { disconnectInvalidatedSockets } from './socket-session-invalidation-subscriber';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const describeIfRedis = process.env.REDIS_HOST ? describe : describe.skip;

type SocketInstance = {
  readonly server: Server;
  readonly address: string;
};

async function createSocketInstance(instanceId: string): Promise<SocketInstance> {
  const httpServer = createHttpServer();
  const server = new Server(httpServer, { transports: ['websocket'] });
  server.on('connection', (socket: Socket) => {
    attachSocketPrincipal(socket, {
      subjectId: 'integration-user',
      sessionId: 'integration-session',
      jti: `integration-token-${instanceId}`,
      issuedAt: Math.floor(Date.now() / 1000) - 1,
      expiresAt: Math.floor(Date.now() / 1000) + 3_600,
      authzVersion: 1,
    });
    socket.emit('ready', instanceId);
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', () => {
      httpServer.off('error', reject);
      resolve();
    });
  });

  const address = httpServer.address();
  if (address === null || typeof address === 'string') {
    await server.close();
    throw new Error('Socket.IO test server did not bind to a TCP port');
  }
  return { server, address: `http://127.0.0.1:${address.port}` };
}

function waitForClientEvent(
  socket: ClientSocket,
  event: string,
  timeoutMs = 2_000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let cleanup = () => undefined;
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for Socket.IO client event: ${event}`));
    }, timeoutMs);
    const onEvent = (value: unknown) => {
      cleanup();
      resolve(value);
    };
    const onConnectError = (error: Error) => {
      cleanup();
      reject(error);
    };
    cleanup = () => {
      clearTimeout(timeout);
      socket.off(event, onEvent);
      socket.off('connect_error', onConnectError);
    };
    socket.once(event, onEvent);
    socket.once('connect_error', onConnectError);
  });
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
  let instanceA: SocketInstance | undefined;
  let instanceB: SocketInstance | undefined;
  let clientA: ClientSocket | undefined;
  let clientB: ClientSocket | undefined;

  afterEach(async () => {
    clientA?.disconnect();
    clientB?.disconnect();
    await Promise.all(
      [instanceA, instanceB]
        .filter((instance): instance is SocketInstance => instance !== undefined)
        .map((instance) => instance.server.close()),
    );
    await Promise.all(
      [publisher, subscriberA, subscriberB]
        .filter((client): client is Redis => client !== undefined)
        .map(closeRedisClient),
    );
    publisher = undefined;
    subscriberA = undefined;
    subscriberB = undefined;
    instanceA = undefined;
    instanceB = undefined;
    clientA = undefined;
    clientB = undefined;
  });

  it('disconnects live Socket.IO clients on two instances after revocation and blocks later events', async () => {
    const configuration = loadRedisConfiguration();
    publisher = createRedisClient(configuration);
    subscriberA = createRedisClient(configuration);
    subscriberB = createRedisClient(configuration);
    for (const client of [publisher, subscriberA, subscriberB]) {
      client.on('error', () => undefined);
    }

    const serverA = await createSocketInstance('a');
    const serverB = await createSocketInstance('b');
    instanceA = serverA;
    instanceB = serverB;
    attachInvalidationListener(subscriberA, serverA.server, socketSessionInvalidationChannel);
    attachInvalidationListener(subscriberB, serverB.server, socketSessionInvalidationChannel);
    await Promise.all([
      subscriberA.subscribe(socketSessionInvalidationChannel),
      subscriberB.subscribe(socketSessionInvalidationChannel),
    ]);

    const socketClientA = createSocketClient(serverA.address, {
      autoConnect: false,
      forceNew: true,
      reconnection: false,
      timeout: 2_000,
      transports: ['websocket'],
    });
    const socketClientB = createSocketClient(serverB.address, {
      autoConnect: false,
      forceNew: true,
      reconnection: false,
      timeout: 2_000,
      transports: ['websocket'],
    });
    clientA = socketClientA;
    clientB = socketClientB;
    const readyA = waitForClientEvent(socketClientA, 'ready');
    const readyB = waitForClientEvent(socketClientB, 'ready');
    socketClientA.connect();
    socketClientB.connect();
    await expect(Promise.all([readyA, readyB])).resolves.toEqual(['a', 'b']);

    const socketIdA = socketClientA.id;
    const socketIdB = socketClientB.id;
    if (socketIdA === undefined || socketIdB === undefined) {
      throw new Error('Connected Socket.IO clients must have server socket IDs');
    }

    const receivedA: string[] = [];
    const receivedB: string[] = [];
    socketClientA.on('protected-event', (event: string) => receivedA.push(event));
    socketClientB.on('protected-event', (event: string) => receivedB.push(event));
    const beforeA = waitForClientEvent(socketClientA, 'protected-event');
    const beforeB = waitForClientEvent(socketClientB, 'protected-event');
    serverA.server.to(socketIdA).emit('protected-event', 'before-revocation-a');
    serverB.server.to(socketIdB).emit('protected-event', 'before-revocation-b');
    await expect(Promise.all([beforeA, beforeB])).resolves.toEqual([
      'before-revocation-a',
      'before-revocation-b',
    ]);

    const disconnectedA = waitForClientEvent(socketClientA, 'disconnect');
    const disconnectedB = waitForClientEvent(socketClientB, 'disconnect');
    const revocation = new SessionRevocationStore(publisher);
    await revocation.revokeSession('integration-session', 60);
    await expect(Promise.all([disconnectedA, disconnectedB])).resolves.toEqual([
      'io server disconnect',
      'io server disconnect',
    ]);

    expect(socketClientA.connected).toBe(false);
    expect(socketClientB.connected).toBe(false);
    serverA.server.to(socketIdA).emit('protected-event', 'after-revocation-a');
    serverB.server.to(socketIdB).emit('protected-event', 'after-revocation-b');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(receivedA).toEqual(['before-revocation-a']);
    expect(receivedB).toEqual(['before-revocation-b']);
  }, 15_000);
});
