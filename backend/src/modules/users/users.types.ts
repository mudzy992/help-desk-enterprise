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
  readonly userId: string;
  readonly roleKey: string;
  readonly organizationalUnitId?: string | null;
  readonly serviceId?: string | null;
  readonly actorUserId: string | null;
  readonly actorIsSuperAdmin: boolean;
  readonly requestId: string | null;
};

export type RemoveUserRoleInput = {
  readonly userId: string;
  readonly userRoleId: string;
  readonly actorUserId: string | null;
  readonly requestId: string | null;
};
