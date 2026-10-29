/* global process */
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';

const host = process.env.REDIS_TLS_TEST_HOST ?? '127.0.0.1';
const port = Number(process.env.REDIS_TLS_TEST_PORT ?? 6380);
const ca = await readFile(process.env.REDIS_TLS_TEST_CA, 'utf8');
const wrongCa = await readFile(process.env.REDIS_TLS_TEST_WRONG_CA, 'utf8');
const password = process.env.REDIS_TLS_TEST_PASSWORD;
if (!password) throw new Error('REDIS_TLS_TEST_PASSWORD is required');

const connect = async (tls, keyPrefix = 'w13:probe:') => {
  const client = new Redis({ host, port, username: 'default', password, tls, keyPrefix, lazyConnect: true, connectTimeout: 3000, maxRetriesPerRequest: 0 });
  try { await client.connect(); await client.ping(); return client; } catch (error) { client.disconnect(); throw error; }
};
const mustReject = async (label, tls) => {
  try { const client = await connect(tls); client.disconnect(); throw new Error(`${label} unexpectedly connected`); }
  catch (error) { if (String(error).includes('unexpectedly connected')) throw error; process.stdout.write(`${label}=rejected\n`); }
};

await mustReject('wrong_ca', { ca: wrongCa, servername: 'redis.internal', rejectUnauthorized: true });
await mustReject('wrong_hostname', { ca, servername: 'wrong.internal', rejectUnauthorized: true });
const production = await connect({ ca, servername: 'redis.internal', rejectUnauthorized: true }, 'production:servicedesk:');
const staging = await connect({ ca, servername: 'redis.internal', rejectUnauthorized: true }, 'staging:servicedesk:');
try {
  await production.set('namespace-proof', 'production');
  await staging.set('namespace-proof', 'staging');
  if (await production.get('namespace-proof') !== 'production' || await staging.get('namespace-proof') !== 'staging') throw new Error('environment namespaces collided');
  process.stdout.write('tls_verified=true namespace_isolated=true\n');
} finally { await Promise.all([production.quit(), staging.quit()]); }
