import { createDirectoryReadCacheKey } from './create-directory-read-cache-key';
import { DirectoryReadCache } from './directory-read.cache';
import type { DirectoryReadResult } from './directory-sync.types';

function createResult(label: string): DirectoryReadResult {
  return {
    strategy: 'manual_only',
    operation: 'users',
    scope: {
      distinguishedName: `OU=${label},DC=example,DC=com`,
      organizationalUnitPath: null,
      includeSubtree: true,
    },
    users: [],
    groups: [],
    organizationalUnits: [],
  };
}

describe('DirectoryReadCache', () => {
  it('returns a cache hit before expiry and misses after explicit expiry', () => {
    const cache = new DirectoryReadCache();
    const result = createResult('Users');
    const cacheKey = createDirectoryReadCacheKey({
      strategy: result.strategy,
      operation: result.operation,
      scope: result.scope,
    });
    cache.set({
      cacheKey,
      value: result,
      timeToLiveMilliseconds: 1_000,
      nowMilliseconds: 0,
    });
    expect(cache.get(cacheKey, 999)).toEqual(result);
    expect(cache.get(cacheKey, 1_000)).toBeUndefined();
  });

  it('keeps scoped results isolated by provider, operation, and scope', () => {
    const cache = new DirectoryReadCache();
    const usersResult = createResult('Users');
    const groupsScope = {
      distinguishedName: 'OU=Groups,DC=example,DC=com',
      organizationalUnitPath: null,
      includeSubtree: true,
    };
    const usersKey = createDirectoryReadCacheKey({
      strategy: 'manual_only',
      operation: 'users',
      scope: usersResult.scope,
    });
    const groupsKey = createDirectoryReadCacheKey({
      strategy: 'manual_only',
      operation: 'groups',
      scope: groupsScope,
    });
    const subtreeOffKey = createDirectoryReadCacheKey({
      strategy: 'manual_only',
      operation: 'users',
      scope: { ...usersResult.scope, includeSubtree: false },
    });
    cache.set({
      cacheKey: usersKey,
      value: usersResult,
      timeToLiveMilliseconds: 1_000,
      nowMilliseconds: 0,
    });
    expect(cache.get(groupsKey, 0)).toBeUndefined();
    expect(cache.get(subtreeOffKey, 0)).toBeUndefined();
    expect(usersKey).not.toBe(groupsKey);
    expect(usersKey).not.toBe(subtreeOffKey);
  });

  it('evicts the oldest entry when the bounded cache is full', () => {
    const cache = new DirectoryReadCache(2);
    cache.set({
      cacheKey: 'one',
      value: createResult('One'),
      timeToLiveMilliseconds: 1_000,
      nowMilliseconds: 0,
    });
    cache.set({
      cacheKey: 'two',
      value: createResult('Two'),
      timeToLiveMilliseconds: 1_000,
      nowMilliseconds: 0,
    });
    cache.set({
      cacheKey: 'three',
      value: createResult('Three'),
      timeToLiveMilliseconds: 1_000,
      nowMilliseconds: 0,
    });
    expect(cache.get('one', 0)).toBeUndefined();
    expect(cache.get('two', 0)?.scope.distinguishedName).toContain('Two');
    expect(cache.get('three', 0)?.scope.distinguishedName).toContain('Three');
  });
});
