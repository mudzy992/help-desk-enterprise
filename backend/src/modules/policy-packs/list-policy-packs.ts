import { listPolicyPackDefinitions } from './policy-pack.registry';

export function listPolicyPacks() {
  return listPolicyPackDefinitions().map((pack) => ({
    key: pack.key,
    name: pack.name,
    description: pack.description,
    defaultClassification: pack.defaultClassification,
    requiresApproval: pack.requiresApproval,
    grants: pack.grants.map((grant) => ({
      roleKey: grant.roleKey,
      permissionKeys: [...grant.permissionKeys],
      organizationalUnitScope: grant.organizationalUnitScope,
      serviceScope: grant.serviceScope,
    })),
  }));
}
