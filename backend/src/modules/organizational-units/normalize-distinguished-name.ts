import { organizationalUnitConstants } from './organizational-unit.constants';
import { OrganizationalUnitError } from './organizational-unit.error';

const allowedAttributeTypes = new Set<string>(
  organizationalUnitConstants.allowedDistinguishedNameAttributeTypes,
);

export function normalizeDistinguishedName(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > organizationalUnitConstants.maximumDistinguishedNameLength
  ) {
    throw new OrganizationalUnitError('INVALID_DISTINGUISHED_NAME');
  }
  const relativeDistinguishedNames = trimmed.split(',').map((part) => part.trim());
  if (relativeDistinguishedNames.some((part) => part.length === 0)) {
    throw new OrganizationalUnitError('INVALID_DISTINGUISHED_NAME');
  }
  return relativeDistinguishedNames.map(normalizeRelativeDistinguishedName).join(',');
}

function normalizeRelativeDistinguishedName(value: string): string {
  const separatorIndex = value.indexOf('=');
  if (separatorIndex <= 0) {
    throw new OrganizationalUnitError('INVALID_DISTINGUISHED_NAME');
  }
  const attributeType = value.slice(0, separatorIndex).trim().toUpperCase();
  const attributeValue = value.slice(separatorIndex + 1).trim();
  if (
    !allowedAttributeTypes.has(attributeType) ||
    attributeValue.length === 0 ||
    attributeValue.includes(',') ||
    attributeValue.includes('/')
  ) {
    throw new OrganizationalUnitError('INVALID_DISTINGUISHED_NAME');
  }
  return `${attributeType}=${attributeValue}`;
}
