import { directorySyncConstants } from './directory-sync.constants';
import { DirectorySyncError } from './directory-sync.error';
import type { DirectoryReadOperation } from './directory-sync.types';

export function parseDirectoryReadOperation(
  value: unknown,
): DirectoryReadOperation {
  if (value === directorySyncConstants.operations[0]) {
    return 'users';
  }
  if (value === directorySyncConstants.operations[1]) {
    return 'groups';
  }
  if (value === directorySyncConstants.operations[2]) {
    return 'organizational_units';
  }
  throw new DirectorySyncError('INVALID_SCOPE');
}
