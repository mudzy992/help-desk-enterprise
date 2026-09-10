import { AuthenticationError } from './authentication.error';
import {
  buildEntraIssuer,
  buildEntraJwksUrl,
  isEntraDirectoryObjectIdentifier,
} from './entra-authentication.constants';
import type { EntraAuthenticationConfiguration } from './entra-authentication.configuration';

export function parseEntraAuthenticationConfiguration(input: {
  readonly tenantId: unknown;
  readonly clientId: unknown;
}): EntraAuthenticationConfiguration {
  const tenantId = parseDirectoryObjectIdentifier(input.tenantId);
  const clientId = parseDirectoryObjectIdentifier(input.clientId);
  return {
    tenantId,
    clientId,
    issuer: buildEntraIssuer(tenantId),
    jwksUrl: buildEntraJwksUrl(tenantId),
  };
}

function parseDirectoryObjectIdentifier(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AuthenticationError('AUTHENTICATION_UNAVAILABLE');
  }
  const normalized = value.trim().toLowerCase();
  if (!isEntraDirectoryObjectIdentifier(normalized)) {
    throw new AuthenticationError('AUTHENTICATION_UNAVAILABLE');
  }
  return normalized;
}
