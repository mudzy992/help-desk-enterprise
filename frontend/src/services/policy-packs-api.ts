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
  readonly grants: readonly PolicyPackGrant[];
};

export type PolicyPackApplyInput = {
  readonly packKey: string;
  readonly organizationalUnitId: string;
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
};

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
