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
  /** M5 B1: SLA profile the pack binds to the service, if the installation has it. */
  readonly slaProfileKey: string | null;
  /** M5 B2: switched off via `private.policyPacks.disabledKeysCsv`. */
  readonly isDisabled: boolean;
  readonly grants: readonly PolicyPackGrant[];
};

export type PolicyPackApplyInput = {
  readonly packKey: string;
  /** M5 B3: the target is an OU, a service or both — what the pack needs is its own rule. */
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

/** M5 B6: the plan the apply would write — shown before the admin confirms. */
export type PolicyPackPlannedAssignment = {
  readonly userId: string;
  readonly roleKey: string;
  readonly permissionKeys: readonly string[];
  readonly organizationalUnitId: string | null;
  readonly serviceId: string | null;
};

/** M5 B1: what the pack writes onto the target service (bundle part). */
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

export function validatePolicyPack(
  input: PolicyPackApplyInput,
): Promise<PolicyPackValidateResult> {
  return apiRequest("/policy-packs/validate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** M5 B5: what an unapply removed (grants count + which links were cleared). */
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

export function unapplyPolicyPack(
  input: PolicyPackApplyInput,
): Promise<PolicyPackUnapplyResult> {
  return apiRequest("/policy-packs/unapply", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listPolicyPacks(): Promise<readonly PolicyPackSummary[]> {
  return apiRequest("/policy-packs");
}

export function applyPolicyPack(
  input: PolicyPackApplyInput,
): Promise<PolicyPackApplyResult> {
  return apiRequest("/policy-packs/apply", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
