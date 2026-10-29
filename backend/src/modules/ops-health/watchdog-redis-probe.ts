import type Redis from 'ioredis';
import { closeRedisClient } from '../../common/redis/close-redis-client';
import { createRedisClient } from '../../common/redis/create-redis-client';
import { loadRedisConfiguration } from '../../common/redis/load-redis-configuration';
import { readWorkerHeartbeatValue } from '../health/health-probes';
import { workerHeartbeatRedisKey } from '../integration-queue/integration-queue.constants';
import type { OpsSnapshot } from './ops-health.runner';
import { OpsStateStore } from './ops-state.store';

export type WatchdogRedisClientFactory = () => { client: Redis; ownsConnection: boolean };

/**
 * Dedicated ioredis connection for the API watchdog. The shared Nest Redis
 * client has been observed to return null for an existing heartbeat key while
 * a fresh client in the same container reads it correctly — that false miss
 * opens worker.down and ignores silence (GET ops:silence also comes back empty).
 */
export class WatchdogRedisProbe {
  private client: Redis | null = null;
  private store: OpsStateStore | null = null;
  private ownsConnection = false;

  constructor(
    private readonly createClient: WatchdogRedisClientFactory = () => ({
      client: createRedisClient(loadRedisConfiguration()),
      ownsConnection: true,
    }),
  ) {}

  async ensureConnected(): Promise<OpsStateStore> {
    if (this.client !== null && this.store !== null && this.client.status === 'ready') {
      return this.store;
    }
    await this.dispose();
    const created = this.createClient();
    const client = created.client;
    this.ownsConnection = created.ownsConnection;
    client.on?.('error', () => undefined);
    if (client.status === 'wait') await client.connect();
    this.client = client;
    this.store = new OpsStateStore(client);
    return this.store;
  }

  async readHeartbeat(): Promise<string | null> {
    const client = this.client;
    if (client === null) return null;
    return readWorkerHeartbeatValue(() => client.get(workerHeartbeatRedisKey), {
      attempts: 4,
      delayMs: 200,
    });
  }

  /**
   * Can Redis be trusted about *absence*? Writes a key and reads it back in the
   * same tick; a miss means eviction/prefix/proxy trouble, not a dead worker.
   */
  async verifyKeyRetention(nonce: string): Promise<boolean> {
    if (this.store === null) return false;
    return this.store.verifyKeyRetention(nonce);
  }

  async readSnapshot(): Promise<Pick<OpsSnapshot, 'generatedAt'> | null> {
    return (await this.store?.readSnapshot<Pick<OpsSnapshot, 'generatedAt'>>()) ?? null;
  }

  async dispose(): Promise<void> {
    const client = this.client;
    const owns = this.ownsConnection;
    this.client = null;
    this.store = null;
    this.ownsConnection = false;
    if (client !== null && owns) await closeRedisClient(client);
  }
}
