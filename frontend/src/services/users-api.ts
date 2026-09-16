import { apiRequest } from "@/services/api";

export type UserRoleResponse = {
  readonly id: string;
  readonly roleKey: string;
  readonly roleName: string;
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
  readonly serviceName: string | null;
};

export type AssignUserRoleInput = {
  readonly roleKey: string;
  readonly organizationalUnitId?: string;
  readonly serviceId?: string;
};

export function listUserRoles(userId: string): Promise<readonly UserRoleResponse[]> {
  return apiRequest(`/users/${encodeURIComponent(userId)}/roles`);
}

export function assignUserRole(
  userId: string,
  input: AssignUserRoleInput,
): Promise<UserRoleResponse> {
  return apiRequest(`/users/${encodeURIComponent(userId)}/roles`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function removeUserRole(userId: string, userRoleId: string): Promise<void> {
  return apiRequest(`/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(userRoleId)}`, {
    method: "DELETE",
  });
}
