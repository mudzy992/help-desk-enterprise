import { DataClassification } from '../../generated/prisma/enums';
import {
  authorizationRoleKeys,
  defaultRolePermissionKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { policyPackGrantScopes, policyPackKeys } from './policy-pack.constants';
import type { PolicyPackDefinition } from './policy-pack.types';
import { sortPolicyPackTokens } from './sort-policy-pack-tokens';

const agentDefaults = defaultRolePermissionKeys[authorizationRoleKeys.agent] ?? [];
const adminDefaults = defaultRolePermissionKeys[authorizationRoleKeys.admin] ?? [];

const itStandardPack: PolicyPackDefinition = {
  key: policyPackKeys.itStandard,
  name: 'IT Standard',
  description:
    'Standard IT operations pack: AGENT and ADMIN roles scoped to the target organizational unit.',
  defaultClassification: DataClassification.INTERNAL,
  requiresApproval: false,
  grants: [
    {
      roleKey: authorizationRoleKeys.admin,
      permissionKeys: sortPolicyPackTokens([...adminDefaults]),
      organizationalUnitScope: policyPackGrantScopes.target,
      serviceScope: policyPackGrantScopes.none,
    },
    {
      roleKey: authorizationRoleKeys.agent,
      permissionKeys: sortPolicyPackTokens([...agentDefaults]),
      organizationalUnitScope: policyPackGrantScopes.target,
      serviceScope: policyPackGrantScopes.none,
    },
  ],
};

const hrRestrictedPack: PolicyPackDefinition = {
  key: policyPackKeys.hrRestricted,
  name: 'HR Restricted',
  description:
    'Restricted HR pack: AGENT role scoped to the target organizational unit and service.',
  defaultClassification: DataClassification.RESTRICTED,
  requiresApproval: true,
  grants: [
    {
      roleKey: authorizationRoleKeys.agent,
      permissionKeys: sortPolicyPackTokens([
        permissionKeys.ticketAttachmentsDownload,
        permissionKeys.ticketAttachmentsUpload,
      ]),
      organizationalUnitScope: policyPackGrantScopes.target,
      serviceScope: policyPackGrantScopes.target,
    },
  ],
};

const financeRestrictedPack: PolicyPackDefinition = {
  key: policyPackKeys.financeRestricted,
  name: 'Finance Restricted',
  description:
    'Restricted Finance pack: AGENT and ADMIN roles scoped to the target organizational unit and service.',
  defaultClassification: DataClassification.CONFIDENTIAL,
  requiresApproval: true,
  grants: [
    {
      roleKey: authorizationRoleKeys.admin,
      permissionKeys: sortPolicyPackTokens([
        permissionKeys.auditExport,
        permissionKeys.routingWrite,
        permissionKeys.slaWrite,
      ]),
      organizationalUnitScope: policyPackGrantScopes.target,
      serviceScope: policyPackGrantScopes.target,
    },
    {
      roleKey: authorizationRoleKeys.agent,
      permissionKeys: sortPolicyPackTokens([
        permissionKeys.ticketAttachmentsDownload,
        permissionKeys.ticketAttachmentsUpload,
        permissionKeys.ticketMerge,
      ]),
      organizationalUnitScope: policyPackGrantScopes.target,
      serviceScope: policyPackGrantScopes.target,
    },
  ],
};

export const defaultPolicyPacks: readonly PolicyPackDefinition[] = [
  itStandardPack,
  hrRestrictedPack,
  financeRestrictedPack,
];

const packsByKey = new Map(
  defaultPolicyPacks.map((pack) => [pack.key, pack] as const),
);

export function getPolicyPackDefinition(
  packKey: string,
): PolicyPackDefinition | null {
  const key = packKey.trim();
  if (key.length === 0) {
    return null;
  }
  return packsByKey.get(key) ?? null;
}

export function listPolicyPackDefinitions(): readonly PolicyPackDefinition[] {
  return defaultPolicyPacks;
}
