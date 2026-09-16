import type { ManualDirectoryOrganizationalUnitResponse } from './manual-directory-catalog.types';

export function toManualDirectoryOrganizationalUnitResponse(record: {
  readonly id: string;
  readonly externalId: string;
  readonly displayName: string;
  readonly distinguishedName: string;
  readonly organizationalUnitPath: string;
  readonly parentExternalId: string | null;
}): ManualDirectoryOrganizationalUnitResponse {
  return {
    id: record.id,
    externalId: record.externalId,
    displayName: record.displayName,
    distinguishedName: record.distinguishedName,
    organizationalUnitPath: record.organizationalUnitPath,
    parentExternalId: record.parentExternalId,
  };
}
