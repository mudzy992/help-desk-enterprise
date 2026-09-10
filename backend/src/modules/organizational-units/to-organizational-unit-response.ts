import type {
  OrganizationalUnitRecord,
  OrganizationalUnitResponse,
} from './organizational-unit.types';

export function toOrganizationalUnitResponse(
  record: OrganizationalUnitRecord,
): OrganizationalUnitResponse {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    distinguishedName: record.distinguishedName,
    ouPath: record.ouPath,
    company: record.company,
    department: record.department,
    parentId: record.parentId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
