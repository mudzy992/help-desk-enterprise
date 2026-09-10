import type { OrganizationalUnitUserResponse } from './organizational-unit.types';

export function toOrganizationalUnitUserResponse(record: {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly organizationalUnitId: string | null;
}): OrganizationalUnitUserResponse {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    organizationalUnitId: record.organizationalUnitId,
  };
}
