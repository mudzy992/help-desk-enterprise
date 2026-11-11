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
  /**
   * M5 B1 (val 5): the pack is a bundle, not just a role list. When the target
   * is a service, apply writes the classification and the approval flag onto
   * that service, and binds this SLA profile (by key, resolved at apply time)
   * to it. Packs that do not carry a profile leave the service SLA untouched.
   */
  readonly slaProfileKey: string | null;
  readonly grants: readonly PolicyPackGrantDefinition[];
};

/** M5 B1: what the pack wants the target service to look like. */
export type PolicyPackServicePolicyPlan = {
  readonly classification: DataClassification;
  readonly requiresApproval: boolean;
  readonly slaProfileKey: string | null;
  /** False when the installation has no SLA profile with `slaProfileKey`. */
  readonly slaProfileResolved: boolean;
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
  /** Null when the request has no service target — an OU has no such fields. */
  readonly servicePolicy: PolicyPackServicePolicyPlan | null;
  readonly plannedAssignments: readonly PolicyPackPlannedAssignment[];
};

/** M5 B5 (val 5): what an unapply actually removed, for the UI and the docs. */
export type PolicyPackUnapplyResult = {
  readonly packKey: string;
  readonly name: string;
  readonly organizationalUnitId: string | null;
  readonly serviceId: string | null;
  readonly userIds: readonly string[];
  readonly removedUserRoleCount: number;
  readonly unboundOrganizationalUnit: boolean;
  readonly unboundService: boolean;
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
  readonly servicePolicy: PolicyPackServicePolicyPlan | null;
  readonly plannedAssignments: readonly PolicyPackPlannedAssignment[];
};
