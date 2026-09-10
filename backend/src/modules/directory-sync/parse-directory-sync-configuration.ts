import { directorySyncConstants } from './directory-sync.constants';
import { DirectorySyncError } from './directory-sync.error';
import type { DirectorySyncConfiguration } from './directory-sync.types';
import { parseDirectorySyncStrategy } from './parse-directory-sync-strategy';

export function parseDirectorySyncConfiguration(input: {
  readonly enabled: unknown;
  readonly strategy: unknown;
  readonly usersBaseDistinguishedName: unknown;
  readonly groupsBaseDistinguishedName: unknown;
  readonly maxQueriesPerSecond: unknown;
  readonly cacheTimeToLiveMinutes: unknown;
  readonly organizationalUnitCacheTimeToLiveHours: unknown;
}): DirectorySyncConfiguration {
  if (typeof input.enabled !== 'boolean') {
    throw new DirectorySyncError('DIRECTORY_SYNC_UNAVAILABLE');
  }
  const maxQueriesPerSecond = parsePositiveFiniteNumber(
    input.maxQueriesPerSecond,
  );
  return {
    enabled: input.enabled,
    strategy: parseDirectorySyncStrategy(input.strategy),
    usersBaseDistinguishedName: parseOptionalString(
      input.usersBaseDistinguishedName,
    ),
    groupsBaseDistinguishedName: parseOptionalString(
      input.groupsBaseDistinguishedName,
    ),
    maxQueriesPerSecond,
    cacheTimeToLiveMilliseconds:
      parseNonNegativeFiniteNumber(input.cacheTimeToLiveMinutes) *
      directorySyncConstants.millisecondsPerMinute,
    organizationalUnitCacheTimeToLiveMilliseconds:
      parseNonNegativeFiniteNumber(input.organizationalUnitCacheTimeToLiveHours) *
      directorySyncConstants.millisecondsPerHour,
  };
}

function parseOptionalString(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  if (typeof value !== 'string') {
    throw new DirectorySyncError('DIRECTORY_SYNC_UNAVAILABLE');
  }
  return value;
}

function parsePositiveFiniteNumber(value: unknown): number {
  const parsed = parseNonNegativeFiniteNumber(value);
  if (parsed <= 0) {
    throw new DirectorySyncError('DIRECTORY_SYNC_UNAVAILABLE');
  }
  return parsed;
}

function parseNonNegativeFiniteNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new DirectorySyncError('DIRECTORY_SYNC_UNAVAILABLE');
  }
  return value;
}
