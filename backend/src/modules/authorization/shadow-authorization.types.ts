import type { AuthorizationDecisionReason } from './authorization-decision-reason';

export const shadowAuthorizationDecisions = {
  allow: 'ALLOW',
  deny: 'DENY',
} as const;

export type ShadowAuthorizationDecision =
  (typeof shadowAuthorizationDecisions)[keyof typeof shadowAuthorizationDecisions];

export type ShadowAuthorizationOrganizationalUnitScope = {
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitPath: string | null;
};

export type ShadowAuthorizationAssignment = {
  readonly roleKey: string;
  readonly permissionKeys: readonly string[];
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
};

export type ShadowAuthorizationRequested = {
  readonly permissionKeys: readonly string[];
  readonly roleKeys: readonly string[];
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
  readonly requireOrganizationalUnitScope: boolean;
  readonly requireServiceScope: boolean;
};

export type ShadowAuthorizationConsidered = {
  readonly subjectId: string | null;
  readonly isSuperAdmin: boolean;
  readonly isLocalOnly: boolean;
  readonly roleKeys: readonly string[];
  readonly permissionKeys: readonly string[];
  readonly organizationalUnitScopes: readonly ShadowAuthorizationOrganizationalUnitScope[];
  readonly serviceIds: readonly (string | null)[];
  readonly assignments: readonly ShadowAuthorizationAssignment[];
};

export type ShadowAuthorizationReport = {
  readonly kind: 'shadow';
  readonly isEnforcing: false;
  readonly decision: ShadowAuthorizationDecision;
  readonly reason: AuthorizationDecisionReason;
  readonly requested: ShadowAuthorizationRequested;
  readonly considered: ShadowAuthorizationConsidered;
};
