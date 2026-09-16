import { directorySyncConstants } from './directory-sync.constants';
import type { DirectoryReadResult } from './directory-sync.types';

type DirectoryReadCacheEntry = {
  readonly value: DirectoryReadResult;
  readonly expiresAtMilliseconds: number;
};

export class DirectoryReadCache {
  private readonly entries = new Map<string, DirectoryReadCacheEntry>();

  constructor(
    private readonly maximumEntries: number = directorySyncConstants.maximumCacheEntries,
  ) {}

  get(
    cacheKey: string,
    nowMilliseconds: number,
  ): DirectoryReadResult | undefined {
    this.evictExpired(nowMilliseconds);
    const entry = this.entries.get(cacheKey);
    if (entry === undefined || entry.expiresAtMilliseconds <= nowMilliseconds) {
      this.entries.delete(cacheKey);
      return undefined;
    }
    this.entries.delete(cacheKey);
    this.entries.set(cacheKey, entry);
    return entry.value;
  }

  clear(): void {
    this.entries.clear();
  }

  set(input: {
    readonly cacheKey: string;
    readonly value: DirectoryReadResult;
    readonly timeToLiveMilliseconds: number;
    readonly nowMilliseconds: number;
  }): void {
    this.evictExpired(input.nowMilliseconds);
    this.entries.delete(input.cacheKey);
    if (input.timeToLiveMilliseconds <= 0) {
      return;
    }
    while (this.entries.size >= this.maximumEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.entries.delete(oldestKey);
    }
    this.entries.set(input.cacheKey, {
      value: input.value,
      expiresAtMilliseconds: input.nowMilliseconds + input.timeToLiveMilliseconds,
    });
  }

  private evictExpired(nowMilliseconds: number): void {
    for (const [cacheKey, entry] of this.entries) {
      if (entry.expiresAtMilliseconds <= nowMilliseconds) {
        this.entries.delete(cacheKey);
      }
    }
  }
}
