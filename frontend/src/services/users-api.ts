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

export type UserSummary = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly isLocalOnly: boolean;
  readonly roleKey: string | null;
  readonly roleName: string | null;
  readonly roleTone: "super" | "manager" | "agent" | "user";
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitName: string | null;
  readonly groupName: string | null;
  readonly policyPackKey: string | null;
  readonly openTicketCount: number;
  readonly mfa: null;
};

export function listUserRoles(
  userId: string,
): Promise<readonly UserRoleResponse[]> {
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

export function removeUserRole(
  userId: string,
  userRoleId: string,
): Promise<void> {
  return apiRequest(
    `/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(userRoleId)}`,
    { method: "DELETE" },
  );
}

export function listUsersSummary(): Promise<readonly UserSummary[]> {
  return apiRequest("/users");
}

export function createUser(input: {
  readonly displayName: string;
  readonly email: string;
  readonly organizationalUnitId?: string | null;
  readonly roleKey: string;
}): Promise<CreateUserResponse> {
  return apiRequest("/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type CreateUserResponse = {
  readonly user: UserSummary;
  readonly temporaryPassword: string | null;
  readonly temporaryPasswordDelivery: "ui" | "email";
};

export function resetUserTemporaryPassword(
  userId: string,
): Promise<CreateUserResponse> {
  return apiRequest(`/users/${encodeURIComponent(userId)}/reset-password`, {
    method: "POST",
  });
}

export function linkUserDirectoryIdentity(
  userId: string,
  directoryExternalId: string,
): Promise<UserSummary> {
  return apiRequest(
    `/users/${encodeURIComponent(userId)}/link-directory-identity`,
    {
      method: "POST",
      body: JSON.stringify({ directoryExternalId }),
    },
  );
}

export function unlinkUserDirectoryIdentity(
  userId: string,
): Promise<CreateUserResponse> {
  return apiRequest(
    `/users/${encodeURIComponent(userId)}/link-directory-identity`,
    { method: "DELETE" },
  );
}

export function updateUser(
  userId: string,
  input: {
    readonly displayName?: string;
    readonly email?: string;
    readonly organizationalUnitId?: string | null;
    readonly isActive?: boolean;
  },
): Promise<UserSummary> {
  return apiRequest(`/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteUser(userId: string): Promise<void> {
  return apiRequest(`/users/${userId}`, { method: "DELETE" });
}
