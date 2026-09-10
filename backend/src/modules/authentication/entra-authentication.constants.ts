export const entraAuthenticationConstants = {
  authorityHost: 'https://login.microsoftonline.com',
  idTokenSigningAlgorithm: 'RS256',
  directoryObjectIdPattern:
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
} as const;

export function buildEntraIssuer(tenantId: string): string {
  return `${entraAuthenticationConstants.authorityHost}/${tenantId}/v2.0`;
}

export function buildEntraJwksUrl(tenantId: string): string {
  return `${entraAuthenticationConstants.authorityHost}/${tenantId}/discovery/v2.0/keys`;
}

export function isEntraDirectoryObjectIdentifier(value: string): boolean {
  return entraAuthenticationConstants.directoryObjectIdPattern.test(value);
}
