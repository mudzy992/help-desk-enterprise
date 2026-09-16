import type { UserRoleResponse } from './users.types';

type LoadedUserRole = {
  readonly id: string;
  readonly role: { readonly key: string; readonly name: string };
  readonly organizationalUnit: {
    readonly id: string;
    readonly ouPath: string;
  } | null;
  readonly service: { readonly id: string; readonly name: string } | null;
};

export function mapUserRoleResponse(record: LoadedUserRole): UserRoleResponse {
  return {
    id: record.id,
    roleKey: record.role.key,
    roleName: record.role.name,
    organizationalUnitId: record.organizationalUnit?.id ?? null,
    organizationalUnitPath: record.organizationalUnit?.ouPath ?? null,
    serviceId: record.service?.id ?? null,
    serviceName: record.service?.name ?? null,
  };
}
