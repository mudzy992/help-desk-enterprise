import { createHash } from 'node:crypto';

export function createManualDirectoryOrganizationalUnitExternalId(
  organizationalUnitPath: string,
): string {
  const digest = createHash('sha256')
    .update(organizationalUnitPath)
    .digest('base64url');
  return `manual_only:ou:${digest}`;
}