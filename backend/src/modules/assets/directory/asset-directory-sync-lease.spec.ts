import type Redis from 'ioredis';
import {
  assetDirectorySyncLeaseKey,
  AssetDirectorySyncLease,
  AssetDirectorySyncLeaseError,
} from './asset-directory-sync-lease';

type RedisCall = (script: string, numberOfKeys: number, ...args: Array<string | number>) => Promise<unknown>;

function createRedis() {
  return {
    set: jest.fn<Promise<'OK' | null>, [string, string, 'PX', number, 'NX']>().mockResolvedValue('OK'),
    eval: jest.fn<ReturnType<RedisCall>, Parameters<RedisCall>>().mockResolvedValue(1),
  } as unknown as Redis & {
    set: jest.Mock;
    eval: jest.Mock;
  };
}

describe('AssetDirectorySyncLease', () => {
  it('claims atomically with a run id and owner token, then renews/releases only its own value', async () => {
    const redis = createRedis();
    redis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    const lease = new AssetDirectorySyncLease(redis, {
      ttlMilliseconds: 2_000,
      renewEveryMilliseconds: 0,
      commandTimeoutMilliseconds: 100,
    });

    const owner = await lease.tryAcquire('run-a');
    expect(owner).not.toBeNull();
    expect(redis.set).toHaveBeenCalledWith(
      assetDirectorySyncLeaseKey,
      expect.any(String),
      'PX',
      2_000,
      'NX',
    );
    const value = redis.set.mock.calls[0]?.[1] as string;
    expect(JSON.parse(value)).toEqual({ runId: 'run-a', ownerToken: expect.any(String) });

    await expect(lease.tryAcquire('run-b')).resolves.toBeNull();
    await owner!.assertOwned();
    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('PEXPIRE'), 1, assetDirectorySyncLeaseKey, value, 2_000);
    await expect(owner!.release()).resolves.toBe(true);
    expect(redis.eval).toHaveBeenLastCalledWith(expect.stringContaining('DEL'), 1, assetDirectorySyncLeaseKey, value);
  });

  it('fails closed when renewal discovers that this run no longer owns the lease', async () => {
    const redis = createRedis();
    redis.eval.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    const lease = new AssetDirectorySyncLease(redis, {
      ttlMilliseconds: 2_000,
      renewEveryMilliseconds: 0,
      commandTimeoutMilliseconds: 100,
    });
    const owner = await lease.tryAcquire('run-a');

    await expect(owner!.assertOwned()).rejects.toBeInstanceOf(AssetDirectorySyncLeaseError);
    await expect(owner!.assertOwned()).rejects.toMatchObject({ reason: 'lost' });
    await expect(owner!.release()).resolves.toBe(false);
  });

  it('fails closed when Redis cannot arbitrate the lease', async () => {
    const redis = createRedis();
    redis.set.mockRejectedValue(new Error('connection refused'));
    const lease = new AssetDirectorySyncLease(redis, {
      ttlMilliseconds: 2_000,
      renewEveryMilliseconds: 0,
      commandTimeoutMilliseconds: 100,
    });

    await expect(lease.tryAcquire('run-a')).rejects.toMatchObject({ reason: 'unavailable' });
  });

  it('rejects invalid lease timing that could expire before renewal', () => {
    expect(() => new AssetDirectorySyncLease(createRedis(), {
      ttlMilliseconds: 1_000,
      renewEveryMilliseconds: 1_000,
    })).toThrow('invalid directory sync lease policy');
  });
});
