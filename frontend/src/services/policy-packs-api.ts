import { apiRequest } from "@/services/api";

export type PolicyPackGrant = {
  readonly roleKey: string;
  readonly permissionKeys: readonly string[];
  readonly organizationalUnitScope: string;
  readonly serviceScope: string;
};

export type PolicyPackSummary = {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly defaultClassification: string;
  readonly requiresApproval: boolean;
  readonly slaProfileKey: string | null;
  readonly isDisabled: boolean;
  readonly grants: readonly PolicyPackGrant[];
};

export type PersistedPolicyPackOption = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly defaultClassification: string;
  readonly requiresApproval: boolean;
  readonly slaProfileId: string | null;
  readonly isDisabled: boolean;
};

export type PolicyPackApplyInput = {
  readonly packKey: string;
  readonly organizationalUnitId?: string;
  readonly serviceId?: string;
  readonly userIds?: readonly string[];
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
  readonly servicePolicy: PolicyPackServicePolicy | null;
};

export type PolicyPackPlannedAssignment = {
  readonly userId: string;
  readonly roleKey: string;
  readonly permissionKeys: readonly string[];
  readonly organizationalUnitId: string | null;
  readonly serviceId: string | null;
};

export type PolicyPackServicePolicy = {
  readonly classification: string;
  readonly requiresApproval: boolean;
  readonly slaProfileKey: string | null;
  readonly slaProfileResolved: boolean;
};

export type PolicyPackValidateResult = {
  readonly packKey: string;
  readonly name: string;
  readonly valid: true;
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
  readonly userIds: readonly string[];
  readonly servicePolicy: PolicyPackServicePolicy | null;
  readonly plannedAssignments: readonly PolicyPackPlannedAssignment[];
};

export type PolicyPackUnapplyResult = {
  readonly packKey: string;
  readonly name: string;
  readonly organizationalUnitId: string | null;
  readonly serviceId: string | null;
  readonly userIds: readonly string[];
  readonly removedUserRoleCount: number;
  readonly unboundOrganizationalUnit: boolean;
  readonly unboundService: boolean;
  readonly servicePolicy: PolicyPackServicePolicy | null;
  readonly plannedAssignments: readonly PolicyPackPlannedAssignment[];
};

export function listPolicyPacks(): Promise<readonly PolicyPackSummary[]> {
  return apiRequest("/policy-packs");
}

export function listPersistedPolicyPacks(): Promise<readonly PersistedPolicyPackOption[]> {
  return apiRequest("/policy-packs/persisted");
}

export function validatePolicyPack(
  input: PolicyPackApplyInput,
): Promise<PolicyPackValidateResult> {
  return apiRequest("/policy-packs/validate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function applyPolicyPack(
  input: PolicyPackApplyInput,
): Promise<PolicyPackApplyResult> {
  return apiRequest("/policy-packs/apply", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function unapplyPolicyPack(
  input: PolicyPackApplyInput,
): Promise<PolicyPackUnapplyResult> {
  return apiRequest("/policy-packs/unapply", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
