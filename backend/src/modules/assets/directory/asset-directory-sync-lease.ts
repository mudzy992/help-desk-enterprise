import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';

export const assetDirectorySyncLeaseKey = 'assets:directory-sync:full-run';

export const assetDirectorySyncLeasePolicy = {
  /** A process crash recovers automatically after this bounded lease expires. */
  ttlMilliseconds: 120_000,
  /** Renew often enough to tolerate a short Redis/network stall. */
  renewEveryMilliseconds: 30_000,
  /** Do not let a Redis outage hang a manual request or worker indefinitely. */
  commandTimeoutMilliseconds: 2_000,
} as const;

const renewScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

const releaseScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

type RedisLeaseClient = Pick<Redis, 'set' | 'eval'>;

type LeaseFailureReason = 'unavailable' | 'lost';
type AssetDirectorySyncLeaseOptions = {
  readonly key?: string;
  readonly ttlMilliseconds?: number;
  readonly renewEveryMilliseconds?: number;
  readonly commandTimeoutMilliseconds?: number;
};

export class AssetDirectorySyncLeaseError extends Error {
  constructor(readonly reason: LeaseFailureReason) {
    super(reason === 'unavailable' ? 'directory sync lease is unavailable' : 'directory sync lease was lost');
    this.name = 'AssetDirectorySyncLeaseError';
  }
}

export interface AssetDirectorySyncLeaseHandle {
  readonly runId: string;
  /** Atomically prove ownership and extend the lease from Redis. */
  assertOwned(): Promise<void>;
  /** Fast local check used between bounded write batches. */
  assertHealthy(): void;
  /** Compare-owner release; returns false if Redis no longer contains this lease. */
  release(): Promise<boolean>;
}

/**
 * Redis-backed single-flight lease shared by API, worker and CLI instances.
 * The value carries both the run id and an unguessable owner token; Redis PX
 * expiry recovers the lease after a process crash. All mutations are
 * compare-owner scripts so a stale owner cannot renew or delete a successor's
 * lease.
 */
export class AssetDirectorySyncLease {
  private readonly policy: {
    readonly ttlMilliseconds: number;
    readonly renewEveryMilliseconds: number;
    readonly commandTimeoutMilliseconds: number;
    readonly key: string;
  };

  constructor(
    private readonly redis: RedisLeaseClient,
    policy: AssetDirectorySyncLeaseOptions = {},
  ) {
    this.policy = {
      ttlMilliseconds: policy.ttlMilliseconds ?? assetDirectorySyncLeasePolicy.ttlMilliseconds,
      renewEveryMilliseconds: policy.renewEveryMilliseconds ?? assetDirectorySyncLeasePolicy.renewEveryMilliseconds,
      commandTimeoutMilliseconds: policy.commandTimeoutMilliseconds ?? assetDirectorySyncLeasePolicy.commandTimeoutMilliseconds,
      key: policy.key ?? assetDirectorySyncLeaseKey,
    };
    if (
      this.policy.key.trim() === '' ||
      !Number.isInteger(this.policy.ttlMilliseconds) || this.policy.ttlMilliseconds < 1 ||
      !Number.isInteger(this.policy.renewEveryMilliseconds) || this.policy.renewEveryMilliseconds < 0 ||
      this.policy.renewEveryMilliseconds >= this.policy.ttlMilliseconds ||
      !Number.isInteger(this.policy.commandTimeoutMilliseconds) || this.policy.commandTimeoutMilliseconds < 1
    ) {
      throw new RangeError('invalid directory sync lease policy');
    }
  }

  async tryAcquire(runId: string): Promise<AssetDirectorySyncLeaseHandle | null> {
    if (runId.trim() === '') throw new TypeError('directory sync run id is required');
    const ownerToken = randomUUID();
    const value = JSON.stringify({ runId, ownerToken });
    let result: string | null;
    try {
      result = await withCommandTimeout(
        this.redis.set(this.policy.key, value, 'PX', this.policy.ttlMilliseconds, 'NX'),
        this.policy.commandTimeoutMilliseconds,
      );
    } catch {
      throw new AssetDirectorySyncLeaseError('unavailable');
    }
    if (result === null) return null;
    if (result !== 'OK') throw new AssetDirectorySyncLeaseError('unavailable');

    const lease = new RedisDirectorySyncLeaseHandle(this.redis, {
      key: this.policy.key,
      value,
      runId,
      ttlMilliseconds: this.policy.ttlMilliseconds,
      renewEveryMilliseconds: this.policy.renewEveryMilliseconds,
      commandTimeoutMilliseconds: this.policy.commandTimeoutMilliseconds,
    });
    lease.startRenewal();
    return lease;
  }
}

class RedisDirectorySyncLeaseHandle implements AssetDirectorySyncLeaseHandle {
  private renewalTimer: NodeJS.Timeout | null = null;
  private renewalInFlight: Promise<void> | null = null;
  private failureReason: LeaseFailureReason | null = null;
  private stopping = false;
  private released = false;

  constructor(
    private readonly redis: RedisLeaseClient,
    private readonly options: {
      readonly key: string;
      readonly value: string;
      readonly runId: string;
      readonly ttlMilliseconds: number;
      readonly renewEveryMilliseconds: number;
      readonly commandTimeoutMilliseconds: number;
    },
  ) {}

  get runId(): string {
    return this.options.runId;
  }

  startRenewal(): void {
    if (this.options.renewEveryMilliseconds === 0) return;
    this.renewalTimer = setInterval(() => {
      void this.renew().catch(() => undefined);
    }, this.options.renewEveryMilliseconds);
    this.renewalTimer.unref();
  }

  async assertOwned(): Promise<void> {
    this.assertHealthy();
    await this.renew();
    this.assertHealthy();
  }

  assertHealthy(): void {
    if (this.failureReason !== null || this.stopping || this.released) {
      throw new AssetDirectorySyncLeaseError(this.failureReason ?? 'lost');
    }
  }

  async release(): Promise<boolean> {
    if (this.released) return false;
    this.stopping = true;
    if (this.renewalTimer !== null) clearInterval(this.renewalTimer);
    this.renewalTimer = null;
    await this.renewalInFlight?.catch(() => undefined);
    this.released = true;
    try {
      const result = await withCommandTimeout(
        this.redis.eval(releaseScript, 1, this.options.key, this.options.value),
        this.options.commandTimeoutMilliseconds,
      );
      return Number(result) === 1;
    } catch {
      // The bounded Redis TTL remains the recovery path if release cannot reach Redis.
      return false;
    }
  }

  private async renew(): Promise<void> {
    if (this.failureReason !== null) throw new AssetDirectorySyncLeaseError(this.failureReason);
    if (this.stopping || this.released) throw new AssetDirectorySyncLeaseError('lost');
    if (this.renewalInFlight !== null) return this.renewalInFlight;

    const renewal = this.renewOnce();
    this.renewalInFlight = renewal;
    try {
      await renewal;
    } catch (error) {
      const reason = error instanceof AssetDirectorySyncLeaseError ? error.reason : 'unavailable';
      this.failureReason = reason;
      throw new AssetDirectorySyncLeaseError(reason);
    } finally {
      if (this.renewalInFlight === renewal) this.renewalInFlight = null;
    }
  }

  private async renewOnce(): Promise<void> {
    let result: unknown;
    try {
      result = await withCommandTimeout(
        this.redis.eval(
          renewScript,
          1,
          this.options.key,
          this.options.value,
          this.options.ttlMilliseconds,
        ),
        this.options.commandTimeoutMilliseconds,
      );
    } catch {
      throw new AssetDirectorySyncLeaseError('unavailable');
    }
    if (Number(result) !== 1) throw new AssetDirectorySyncLeaseError('lost');
  }
}

async function withCommandTimeout<T>(work: Promise<T>, timeoutMilliseconds: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('redis command timed out')), timeoutMilliseconds);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
