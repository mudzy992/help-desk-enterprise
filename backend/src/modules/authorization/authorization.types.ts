import type { AuthorizationDecisionReason } from './authorization-decision-reason';

export type AuthorizationAssignment = {
  readonly roleKey: string;
  readonly permissionKeys: readonly string[];
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
};

export type AuthorizationContext = {
  readonly subjectId: string;
  readonly isLocalOnly: boolean;
  readonly isSuperAdmin: boolean;
  readonly assignments: readonly AuthorizationAssignment[];
};

export type AuthorizationUserRecord = {
  readonly id: string;
  readonly isActive: boolean;
  readonly isLocalOnly: boolean;
  readonly entraObjectId: string | null;
  /** Optional for compatibility with existing in-memory authorization fixtures. */
  readonly directoryObjectGuid?: string | null;
  readonly assignments: readonly AuthorizationAssignment[];
};

export type AuthorizationScopeLocator = {
  readonly field: string;
  /** Resolve a group id to its owning OU before evaluating the permission. */
  readonly resource?: 'group';
};

export type AuthorizationDecisionInput = {
  readonly context: AuthorizationContext | null;
  readonly requiredRoles: readonly string[];
  readonly requiredPermissions: readonly string[];
  /** Omitted means the legacy OR behavior. */
  readonly permissionMatchMode?: 'any' | 'all';
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
  readonly requireOrganizationalUnitScope: boolean;
  readonly requireServiceScope: boolean;
};

export type AuthorizationRequirements = {
  readonly requiredRoles: readonly string[];
  readonly requiredPermissions: readonly string[];
  readonly permissionMatchMode?: 'any' | 'all';
  /** Resource permissions enforced by a collection's filtered service path. */
  readonly auditPermissionKeys?: readonly string[];
  readonly organizationalUnitScope: AuthorizationScopeLocator | null;
  readonly serviceScope: AuthorizationScopeLocator | null;
  readonly requireOrganizationalUnitScope: boolean;
  readonly requireServiceScope: boolean;
};

export type AuthorizationAccessDecision = {
  readonly allowed: boolean;
  readonly reason: AuthorizationDecisionReason;
};
