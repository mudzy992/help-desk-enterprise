import { listPolicyPackDefinitions } from './policy-pack.registry';

export function listPolicyPacks(
  disabledPackKeys: readonly string[] = [],
) {
  const disabled = new Set(disabledPackKeys);
  return listPolicyPackDefinitions().map((pack) => ({
    key: pack.key,
    name: pack.name,
    description: pack.description,
    defaultClassification: pack.defaultClassification,
    requiresApproval: pack.requiresApproval,
    slaProfileKey: pack.slaProfileKey,
    isDisabled: disabled.has(pack.key.toUpperCase()),
    grants: pack.grants.map((grant) => ({
      roleKey: grant.roleKey,
      permissionKeys: [...grant.permissionKeys],
      organizationalUnitScope: grant.organizationalUnitScope,
      serviceScope: grant.serviceScope,
    })),
  }));
}
