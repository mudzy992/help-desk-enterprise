import { policyPackGrantScopes } from './policy-pack.constants';
import { PolicyPackError } from './policy-pack.error';
import { getPolicyPackDefinition } from './policy-pack.registry';
import type {
  PolicyPackApplyInput,
  PolicyPackApplyTarget,
  PolicyPackDefinition,
  PolicyPackPlannedAssignment,
} from './policy-pack.types';
import { sortPolicyPackTokens } from './sort-policy-pack-tokens';

function readOptionalId(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function packRequiresOrganizationalUnit(
  pack: PolicyPackDefinition,
): boolean {
  return pack.grants.some(
    (grant) => grant.organizationalUnitScope === policyPackGrantScopes.target,
  );
}

export function packRequiresService(pack: PolicyPackDefinition): boolean {
  return pack.grants.some(
    (grant) => grant.serviceScope === policyPackGrantScopes.target,
  );
}

export function resolvePolicyPackFromInput(
  input: PolicyPackApplyInput,
): PolicyPackDefinition {
  const pack = getPolicyPackDefinition(input.packKey ?? '');
  if (pack === null) {
    throw new PolicyPackError('UNKNOWN_POLICY_PACK');
  }
  return pack;
}

export function readPolicyPackApplyTargetInput(
  pack: PolicyPackDefinition,
  input: PolicyPackApplyInput,
): Pick<
  PolicyPackApplyTarget,
  'organizationalUnitId' | 'serviceId' | 'userIds'
> {
  const organizationalUnitId = readOptionalId(input.organizationalUnitId);
  const serviceId = readOptionalId(input.serviceId);
  if (packRequiresOrganizationalUnit(pack) && organizationalUnitId === null) {
    throw new PolicyPackError('MISSING_ORGANIZATIONAL_UNIT');
  }
  if (packRequiresService(pack) && serviceId === null) {
    throw new PolicyPackError('MISSING_SERVICE');
  }
  return {
    organizationalUnitId,
    serviceId,
    userIds: sortPolicyPackTokens(input.userIds ?? []),
  };
}

export function planPolicyPackAssignments(
  target: PolicyPackApplyTarget,
): readonly PolicyPackPlannedAssignment[] {
  const planned: PolicyPackPlannedAssignment[] = [];
  for (const userId of target.userIds) {
    for (const grant of target.pack.grants) {
      planned.push({
        userId,
        roleKey: grant.roleKey,
        permissionKeys: sortPolicyPackTokens([...grant.permissionKeys]),
        organizationalUnitId:
          grant.organizationalUnitScope === policyPackGrantScopes.target
            ? target.organizationalUnitId
            : null,
        serviceId:
          grant.serviceScope === policyPackGrantScopes.target
            ? target.serviceId
            : null,
      });
    }
  }
  return planned;
}
