#!/usr/bin/env node
/**
 * Faza 3.1 — cross-instance dokaz: dva Socket.IO servera (kao dvije API instance)
 * dijele Redis adapter, klijent je spojen na instancu B, a emit ide s instance A.
 *
 * Pokretanje:  node ops/ws-cross-instance-check.mjs   (traži Redis na REDIS_URL)
 * Izlaz:       ✔ / ✖ + izlazni kod (0 = dokazano)
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

// Server-side paketi žive u backend/, klijentski u frontend/ — skripta se zato
// ne oslanja na cwd, nego učitava svaki paket iz svog paketa.
const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url));
const frontendRequire = createRequire(new URL('../frontend/package.json', import.meta.url));
const { default: Redis } = backendRequire('ioredis');
const { Server } = backendRequire('socket.io');
const { createAdapter } = backendRequire('@socket.io/redis-adapter');
const { io: createClient } = frontendRequire('socket.io-client');

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const room = 'group:cross-instance-check';

async function bootInstance(port) {
  const httpServer = createServer();
  const server = new Server(httpServer, { cors: { origin: '*' } });
  const pub = new Redis(redisUrl);
  const sub = new Redis(redisUrl);
  sub.on('error', () => undefined);
  pub.on('error', () => undefined);
  server.adapter(createAdapter(pub, sub));
  await new Promise((resolve) => httpServer.listen(port, '127.0.0.1', resolve));
  return { server, close: () => Promise.all([pub.quit(), sub.quit(), server.close()]) };
}

const instanceA = await bootInstance(4321);
const instanceB = await bootInstance(4322);

const client = createClient('http://127.0.0.1:4322', { transports: ['websocket'] });
const received = new Promise((resolve) => {
  client.on('group.feedChanged', (payload) => resolve(payload));
  client.on('connect', () => client.emit('join', room));
});

// Klijent se sam ne joinuje u sobu u ovoj provjeri — join radimo ručno na B.
client.on('connect', () => {
  instanceB.server.in(room).socketsJoin(room);
  // Emit ide s instance A; adapter ga mora prenijeti u sobu na instanci B.
  setTimeout(() => {
    instanceA.server.to(room).emit('group.feedChanged', {
      groupId: 'cross-instance-check',
      ticketId: 'ticket-1',
      kind: 'status',
    });
  }, 150);
});

const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 5000));
const payload = await Promise.race([received, timeout]);

client.close();
await instanceA.close();
await instanceB.close();

if (payload === null) {
  console.error('✖ klijent na instanci B NIJE dobio emit s instance A (Redis adapter ne radi)');
  process.exit(1);
}
console.log('✔ klijent na instanci B dobio je emit s instance A:', payload);
