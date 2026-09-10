import { directorySyncConstants } from './directory-sync.constants';
import { DirectorySyncError } from './directory-sync.error';

export function normalizeDirectoryOrganizationalUnitPath(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > directorySyncConstants.maximumOrganizationalUnitPathLength
  ) {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
  if (!trimmed.startsWith('/') || trimmed.includes('\\') || trimmed.includes('//')) {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
  if (trimmed === '/') {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
  if (trimmed.endsWith('/')) {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
  const segments = trimmed.slice(1).split('/');
  if (segments.some((segment) => segment.trim().length === 0)) {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
  return `/${segments.map((segment) => segment.trim()).join('/')}`;
}
