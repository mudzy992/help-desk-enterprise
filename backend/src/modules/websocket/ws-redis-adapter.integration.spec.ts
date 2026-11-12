import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { io as createSocketClient, type Socket as ClientSocket } from 'socket.io-client';
import { loadRedisConfiguration } from '../../common/redis/load-redis-configuration';
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

  it('delivers a room emit from instance B to a client joined on instance A', async () => {
    const room = `adapter-it-${randomUUID()}`;
    instanceA = await createSocketInstance(room);
    instanceB = await createSocketInstance(room);

    clientA = createSocketClient(instanceA.address, { transports: ['websocket'] });
    await waitForClientEvent(clientA, 'ready');

    instanceB.server.to(room).emit('cross-instance-event', 'from-b');
    await expect(waitForClientEvent(clientA, 'cross-instance-event')).resolves.toBe('from-b');
  });
});
