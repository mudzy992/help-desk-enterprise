export type UserRoleResponse = {
  readonly id: string;
  readonly roleKey: string;
  readonly roleName: string;
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
  readonly serviceName: string | null;
};

export type { PrincipalInvalidationHook } from '../../common/principal-context/principal-context.types';

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

export type UserRoleTone = 'super' | 'manager' | 'agent' | 'user';

export type UserSummaryResponse = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly isLocalOnly: boolean;
  readonly roleKey: string | null;
  readonly roleName: string | null;
  readonly roleTone: UserRoleTone;
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitName: string | null;
  readonly groupName: string | null;
  readonly policyPackKey: string | null;
  readonly openTicketCount: number;
  readonly mfa: null;
};

export type CreateUserInput = {
  readonly displayName: string;
  readonly email: string;
  readonly organizationalUnitId?: string | null;
  readonly roleKey: string;
  readonly actorUserId: string | null;
  readonly actorIsSuperAdmin: boolean;
  readonly requestId: string | null;
};

export type TemporaryPasswordDelivery = 'ui' | 'email';

export type CreateUserResponse = {
  readonly user: UserSummaryResponse;
  /** Present only when delivery is `ui`. Never returned from GET endpoints. */
  readonly temporaryPassword: string | null;
  readonly temporaryPasswordDelivery: TemporaryPasswordDelivery;
};

export type ResetUserPasswordResponse = CreateUserResponse;

export type UpdateUserInput = {
  readonly userId: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly organizationalUnitId?: string | null;
  readonly isActive?: boolean;
};
