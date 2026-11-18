import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { io as createSocketClient, type Socket as ClientSocket } from 'socket.io-client';
import { loadRedisConfiguration } from '../../common/redis/load-redis-configuration';
import { GroupScopeRealtimeHub } from '../../common/admin-realtime/group-scope-realtime.hub';
import { createTestAssignment, createTestAuthorizationContext } from '../authorization/create-test-authorization-context';
import { permissionKeys } from '../authorization/authorization.constants';
import { startScopedGroupConfigDispatcher } from './scoped-group-config-dispatcher';
import {
  createWebsocketRedisAdapter,
  type WebsocketRedisAdapterHandle,
} from './ws-redis-adapter';

const describeIfRedis = process.env.REDIS_HOST ? describe : describe.skip;

type SocketInstance = {
  readonly server: Server;
  readonly address: string;
  readonly handle: WebsocketRedisAdapterHandle;
};

const logger = { warn: () => undefined, log: () => undefined };

async function createSocketInstance(room: string): Promise<SocketInstance> {
  const handle = createWebsocketRedisAdapter(loadRedisConfiguration(), logger);
  if (handle === null) {
    throw new Error('Redis adapter handle was not created');
  }
  const httpServer = createHttpServer();
  const server = new Server(httpServer, { transports: ['websocket'] });
  server.adapter(handle.adapter);
  server.on('connection', (socket: Socket) => {
    void (async () => {
      const user = socket.handshake.auth.user;
      if (typeof user === 'string') {
        socket.data.principal = { subjectId: user, sessionId: null, jti: user, issuedAt: 1, expiresAt: 9999999999, authzVersion: 1 };
      }
      await socket.join(room);
      socket.emit('ready');
    })();
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
    await handle.close();
    throw new Error('Socket.IO test server did not bind to a TCP port');
  }
  return { server, address: `http://127.0.0.1:${address.port}`, handle };
}

/**
 * The adapter issues its Redis subscriptions from its constructor, but the
 * Socket.IO `ready` event does not wait for that round trip. A publish that
 * reaches Redis before the receiving instance's `PSUBSCRIBE` is silently lost,
 * which made the cross-instance assertions flaky under CI load. The adapter
 * psubscribes the room channel *before* it subscribes the request channel on the
 * same connection, so waiting until every instance sees every instance on the
 * request channel proves the room channel is live as well.
 */
async function waitForAdapterSubscriptions(instances: readonly SocketInstance[]): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const counts = await Promise.all(
      instances.map((instance) =>
        (instance.server.of('/').adapter as unknown as { serverCount: () => Promise<number> }).serverCount(),
      ),
    );
    if (counts.every((count) => count >= instances.length)) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`Redis adapters did not subscribe in time: ${counts.join(' / ')}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function waitForClientEvent(
  socket: ClientSocket,
  event: string,
  timeoutMs = 3_000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for Socket.IO client event: ${event}`));
    }, timeoutMs);
    const onEvent = (value: unknown) => {
      clearTimeout(timeout);
      resolve(value);
    };
    socket.once(event, onEvent);
  });
}

/**
 * BA-websocket-14: the missing live cross-instance proof. Two real Socket.IO
 * servers share rooms only through the real Redis adapter — an emit on
 * instance B must reach a client joined on instance A. Runs only in the CI
 * integration job (REDIS_HOST set); skipped elsewhere.
 */
describeIfRedis('websocket Redis adapter cross-instance delivery (integration)', () => {
  jest.setTimeout(20_000);
  let instanceA: SocketInstance | undefined;
  let instanceB: SocketInstance | undefined;
  let clientA: ClientSocket | undefined;

  afterEach(async () => {
    clientA?.disconnect();
    if (instanceA !== undefined) await instanceA.server.close();
    if (instanceB !== undefined) await instanceB.server.close();
    // BA-websocket-12: the adapter close is awaited, not fire-and-forget.
    if (instanceA !== undefined) await instanceA.handle.close();
    if (instanceB !== undefined) await instanceB.handle.close();
    instanceA = undefined;
    instanceB = undefined;
    clientA = undefined;
  });

  it('authorizes scoped group invalidation on the receiving Redis instance', async () => {
    instanceA = await createSocketInstance(`scope-${randomUUID()}`);
    instanceB = await createSocketInstance(`scope-${randomUUID()}`);
    await waitForAdapterSubscriptions([instanceA, instanceB]);
    const hubA = new GroupScopeRealtimeHub(); const hubB = new GroupScopeRealtimeHub();
    const deps = {
      loadUnit: async () => ({ id: 'unit', ouPath: '/A/Team' }),
      isSessionCurrent: async () => true,
      loadContext: async (id: string) => createTestAuthorizationContext({ subjectId: id, assignments: [createTestAssignment({ roleKey: 'ADMIN', permissionKeys: [permissionKeys.groupManage], organizationalUnitId: id, organizationalUnitPath: id === 'a' ? '/A' : '/B' })] }),
    };
    const stopA = startScopedGroupConfigDispatcher(instanceA.server, hubA, deps, logger.warn);
    const stopB = startScopedGroupConfigDispatcher(instanceB.server, hubB, deps, logger.warn);
    let denied: ClientSocket | undefined;
    try {
      clientA = createSocketClient(instanceA.address, { transports: ['websocket'], auth: { user: 'a' } });
      denied = createSocketClient(instanceA.address, { transports: ['websocket'], auth: { user: 'b' } });
      await Promise.all([waitForClientEvent(clientA, 'ready'), waitForClientEvent(denied, 'ready')]);
      const seenDenied: unknown[] = [];
      denied.on('admin.config.updated', (payload: unknown) => seenDenied.push(payload));
      const delivered = waitForClientEvent(clientA, 'admin.config.updated');
      hubB.publish({ organizationalUnitId: 'unit' });
      await expect(delivered).resolves.toEqual({ domain: 'groups' });
      const barrier = waitForClientEvent(denied, 'barrier');
      instanceA.server.emit('barrier');
      await barrier;
      expect(seenDenied).toEqual([]);
    } finally {
      denied?.disconnect(); stopA(); stopB();
    }
  });

  it('delivers a room emit from instance B to a client joined on instance A', async () => {
    const room = `adapter-it-${randomUUID()}`;
    instanceA = await createSocketInstance(room);
    instanceB = await createSocketInstance(room);
    await waitForAdapterSubscriptions([instanceA, instanceB]);

    clientA = createSocketClient(instanceA.address, { transports: ['websocket'] });
    await waitForClientEvent(clientA, 'ready');

    const received = waitForClientEvent(clientA, 'cross-instance-event');
    instanceB.server.to(room).emit('cross-instance-event', 'from-b');
    await expect(received).resolves.toBe('from-b');
  });
});
