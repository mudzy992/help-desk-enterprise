import { directorySyncConstants } from './directory-sync.constants';
import { DirectorySyncError } from './directory-sync.error';
import type { DirectorySyncStrategy } from './directory-sync.types';

export function parseDirectorySyncStrategy(
  value: unknown,
): DirectorySyncStrategy {
  if (value === directorySyncConstants.strategies[0]) {
    return 'manual_only';
  }
  if (value === directorySyncConstants.strategies[1]) {
    return 'scheduled';
  }
  throw new DirectorySyncError('DIRECTORY_SYNC_UNAVAILABLE');
}
