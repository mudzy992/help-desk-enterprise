import { directorySyncConstants } from './directory-sync.constants';
import { DirectorySyncError } from './directory-sync.error';

const allowedAttributeTypes = new Set<string>(
  directorySyncConstants.allowedDistinguishedNameAttributeTypes,
);

export function normalizeDirectoryDistinguishedName(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > directorySyncConstants.maximumDistinguishedNameLength
  ) {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
  const relativeDistinguishedNames = trimmed.split(',').map((part) => part.trim());
  if (relativeDistinguishedNames.some((part) => part.length === 0)) {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
  return relativeDistinguishedNames
    .map(normalizeRelativeDistinguishedName)
    .join(',');
}

function normalizeRelativeDistinguishedName(value: string): string {
  const separatorIndex = value.indexOf('=');
  if (separatorIndex <= 0) {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
  const attributeType = value.slice(0, separatorIndex).trim().toUpperCase();
  const attributeValue = value.slice(separatorIndex + 1).trim();
  if (
    !allowedAttributeTypes.has(attributeType) ||
    attributeValue.length === 0 ||
    attributeValue.includes(',') ||
    attributeValue.includes('/')
  ) {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
  return `${attributeType}=${attributeValue}`;
}
