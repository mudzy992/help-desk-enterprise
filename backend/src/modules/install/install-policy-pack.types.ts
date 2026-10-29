import type { DataClassification } from '../../generated/prisma/enums';

export type InstallPolicyPackSummary = {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly defaultClassification: DataClassification;
  readonly requiresApproval: boolean;
  /** The profile the pack's services move to; `null` when the pack sets none. */
  readonly slaProfileKey: string | null;
  readonly grantCount: number;
};

/**
 * F4.3: what the policy pack step shows — the packs the applied blueprint offers,
 * which one (if any) the wizard already applied, and the blueprint behind that
 * offer. The wizard renders the pack's effect from these fields instead of
 * hard-coding „IT Standard grants the admin and agent roles“.
 */
export type InstallPolicyPackStatus = {
  readonly applied: string | null;
  readonly blueprint: string | null;
  readonly packs: readonly InstallPolicyPackSummary[];
};

export type InstallPolicyPackApplyResult = {
  readonly policyPackKey: string;
  readonly name: string;
  readonly organizationalUnitId: string | null;
  readonly serviceId: string | null;
  readonly createdUserRoleCount: number;
  readonly existingUserRoleCount: number;
  readonly createdRolePermissionCount: number;
  readonly existingRolePermissionCount: number;
};
