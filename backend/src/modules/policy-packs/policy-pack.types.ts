import type { DataClassification } from '../../generated/prisma/enums';
import type { policyPackGrantScopes } from './policy-pack.constants';

export type PolicyPackGrantScope =
  (typeof policyPackGrantScopes)[keyof typeof policyPackGrantScopes];

export type PolicyPackGrantDefinition = {
  readonly roleKey: string;
  readonly permissionKeys: readonly string[];
  readonly organizationalUnitScope: PolicyPackGrantScope;
  readonly serviceScope: PolicyPackGrantScope;
};

export type PolicyPackDefinition = {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly defaultClassification: DataClassification;
  readonly requiresApproval: boolean;
  readonly grants: readonly PolicyPackGrantDefinition[];
};

export type PolicyPackApplyInput = {
  readonly packKey: string;
  readonly organizationalUnitId?: string | null;
  readonly serviceId?: string | null;
  readonly userIds?: readonly string[] | null;
};

export type PolicyPackApplyTarget = {
  readonly pack: PolicyPackDefinition;
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
  readonly userIds: readonly string[];
};

export type { PrincipalInvalidationHook } from '../../common/principal-context/principal-context.types';

export type PolicyPackPlannedAssignment = {
  readonly userId: string;
  readonly roleKey: string;
  readonly permissionKeys: readonly string[];
  readonly organizationalUnitId: string | null;
  readonly serviceId: string | null;
};

export type PolicyPackValidateResult = {
  readonly packKey: string;
  readonly name: string;
  readonly valid: true;
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
  readonly userIds: readonly string[];
  readonly plannedAssignments: readonly PolicyPackPlannedAssignment[];
};

export type PolicyPackApplyResult = {
  readonly packKey: string;
  readonly name: string;
  readonly organizationalUnitId: string | null;
  readonly serviceId: string | null;
  readonly userIds: readonly string[];
  readonly createdUserRoleCount: number;
  readonly existingUserRoleCount: number;
  readonly createdRolePermissionCount: number;
  readonly existingRolePermissionCount: number;
  readonly plannedAssignments: readonly PolicyPackPlannedAssignment[];
};
