export type InMemoryPolicyPackUser = {
  id: string;
  isActive: boolean;
  isLocalOnly: boolean;
  entraObjectId: string | null;
};

export type InMemoryPolicyPackOrganizationalUnit = {
  id: string;
  ouPath: string;
  policyPackId: string | null;
};

export type InMemoryPolicyPackService = {
  id: string;
  policyPackId: string | null;
};

export type InMemoryUserRole = {
  id: string;
  userId: string;
  roleId: string;
  organizationalUnitId: string | null;
  serviceId: string | null;
};

export type InMemoryRoleRecord = { id: string; key: string };
export type InMemoryPermissionRecord = { id: string; key: string };
export type InMemoryRolePermissionRecord = {
  id: string;
  roleId: string;
  permissionId: string;
};
export type InMemoryPolicyPackRecord = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  defaultClassification: string;
  requiresApproval: boolean;
};

export type InMemoryPolicyPackStores = {
  readonly users: Map<string, InMemoryPolicyPackUser>;
  readonly units: Map<string, InMemoryPolicyPackOrganizationalUnit>;
  readonly services: Map<string, InMemoryPolicyPackService>;
  readonly roles: Map<string, InMemoryRoleRecord>;
  readonly permissions: Map<string, InMemoryPermissionRecord>;
  readonly rolePermissions: InMemoryRolePermissionRecord[];
  readonly userRoles: InMemoryUserRole[];
  readonly policyPacks: Map<string, InMemoryPolicyPackRecord>;
};
