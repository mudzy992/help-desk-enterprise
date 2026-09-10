import type { ClosableRedisClient } from './redis.types';

const QUIT_STATUSES = new Set([
  'ready',
  'connect',
  'connecting',
  'reconnecting',
]);

export async function closeRedisClient(
  client: ClosableRedisClient,
): Promise<void> {
  if (client.status === 'end' || client.status === 'close') {
    return;
  }
  if (!QUIT_STATUSES.has(client.status)) {
    client.disconnect();
    return;
  }
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}
