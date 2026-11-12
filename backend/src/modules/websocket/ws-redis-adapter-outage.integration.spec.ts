import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { createConnection, createServer as createTcpServer, type Socket as TcpSocket } from 'node:net';
import { Server } from 'socket.io';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { loadRedisConfiguration } from '../../common/redis/load-redis-configuration';
import { WebsocketAdapterHealthService } from './websocket-adapter-health.service';
import { createWebsocketRedisAdapter, type WebsocketRedisAdapterHandle } from './ws-redis-adapter';

const describeIfRedis = process.env.REDIS_HOST ? describe : describe.skip;

/** Poll only the test condition, with a bounded deadline. */
async function waitUntil(predicate: () => boolean, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for adapter health');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function waitForEvent(socket: ClientSocket, event: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timed out waiting for ${event}`));
    }, 5_000);
    const listener = (value: unknown): void => {
      clearTimeout(timer);
      resolve(value);
    };
    socket.once(event, listener);
  });
}

describeIfRedis('Redis adapter network partition and recovery', () => {
  jest.setTimeout(30_000);

  it('marks the partition degraded and resumes cross-instance delivery after reconnect', async () => {
    const config = loadRedisConfiguration();
    const sockets = new Set<TcpSocket>();
    let blocked = false;
    // An isolated TCP proxy cuts the adapter's connections without touching the
    // shared CI Redis process or any other integration suite.
    const proxy = createTcpServer((downstream) => {
      if (blocked) { downstream.destroy(); return; }
      const upstream = createConnection({ host: config.host, port: config.port });
      sockets.add(downstream);
      sockets.add(upstream);
      downstream.on('error', () => upstream.destroy());
      upstream.on('error', () => downstream.destroy());
      downstream.on('close', () => { sockets.delete(downstream); upstream.destroy(); });
      upstream.on('close', () => { sockets.delete(upstream); downstream.destroy(); });
      downstream.pipe(upstream).pipe(downstream);
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    if (address === null || typeof address === 'string') throw new Error('Proxy did not bind');
    const proxied = { ...config, host: '127.0.0.1', port: address.port };
    const logger = { warn: () => undefined, log: () => undefined };
    const handles: WebsocketRedisAdapterHandle[] = [];
    const servers: Server[] = [];
    let client: ClientSocket | undefined;
    const health = new WebsocketAdapterHealthService();
    try {
      const first = createWebsocketRedisAdapter(proxied, logger);
      if (first === null) throw new Error('Cannot create proxied Redis adapter');
      handles.push(first);
      const second = createWebsocketRedisAdapter(config, logger);
      if (second === null) throw new Error('Cannot create second Redis adapter');
      handles.push(second);
      const room = `partition-${randomUUID()}`;
      for (const handle of handles) {
        const http = createHttpServer();
        const server = new Server(http, { transports: ['websocket'] });
        servers.push(server);
        server.adapter(handle.adapter);
        server.on('connection', (socket) => {
          void (async () => { await socket.join(room); socket.emit('ready'); })();
        });
        await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
      }
      first.startHealthMonitor((state, reason) => health.setState(state, reason), { intervalMs: 100, timeoutMs: 1_000 });
      await waitUntil(() => health.isReady());
      const httpAddress = servers[0].httpServer?.address();
      if (httpAddress === undefined || httpAddress === null || typeof httpAddress === 'string') throw new Error('Socket server did not bind');
      client = io(`http://127.0.0.1:${httpAddress.port}`, { transports: ['websocket'] });
      await waitForEvent(client, 'ready');
      const before = waitForEvent(client, 'before');
      servers[1].to(room).emit('before', 'delivered');
      expect(await before).toBe('delivered');

      blocked = true;
      for (const socket of sockets) socket.destroy();
      await waitUntil(() => !health.isReady());
      expect(health.getSnapshot().state).toBe('degraded');
      blocked = false;
      await waitUntil(() => health.isReady(), 10_000);
      const after = waitForEvent(client, 'after');
      servers[1].to(room).emit('after', 'recovered');
      expect(await after).toBe('recovered');
    } finally {
      client?.disconnect();
      await Promise.all(servers.map((server) => server.close()));
      await Promise.all(handles.map((handle) => handle.close()));
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }
  });
});
