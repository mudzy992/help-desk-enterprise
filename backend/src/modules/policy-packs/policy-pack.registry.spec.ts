import {
  authorizationRoleKeys,
  defaultRolePermissionKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { assertPolicyPackDefinition } from './assert-policy-pack-definition';
import { policyPackGrantScopes, policyPackKeys } from './policy-pack.constants';
import { PolicyPackError } from './policy-pack.error';
import {
  defaultPolicyPacks,
  getPolicyPackDefinition,
  listPolicyPackDefinitions,
} from './policy-pack.registry';
import type { PolicyPackDefinition } from './policy-pack.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('policy pack registry', () => {
  it('exposes IT, HR, and Finance default packs', () => {
    expect(listPolicyPackDefinitions().map((pack) => pack.key)).toEqual([
      policyPackKeys.itStandard,
      policyPackKeys.hrRestricted,
      policyPackKeys.financeRestricted,
    ]);
  });

  it('validates every default pack against existing roles and permissions', () => {
    for (const pack of defaultPolicyPacks) {
      expect(() => assertPolicyPackDefinition(pack)).not.toThrow();
      expect(pack.grants.length).toBeGreaterThan(0);
      for (const grant of pack.grants) {
        expect(grant.roleKey).not.toBe(authorizationRoleKeys.superAdmin);
        expect(grant.permissionKeys).not.toContain(
          permissionKeys.confidentialBreakGlass,
        );
        const allowed = new Set(defaultRolePermissionKeys[grant.roleKey] ?? []);
        for (const permissionKey of grant.permissionKeys) {
          expect(allowed.has(permissionKey)).toBe(true);
        }
      }
    }
  });

  it('scopes IT to the target OU and leaves service unscoped', () => {
    const pack = getPolicyPackDefinition(policyPackKeys.itStandard);
    expect(pack?.grants.map((grant) => grant.roleKey).sort()).toEqual([
      authorizationRoleKeys.admin,
      authorizationRoleKeys.agent,
    ]);
    expect(
      pack?.grants.every(
        (grant) =>
          grant.organizationalUnitScope === policyPackGrantScopes.target &&
          grant.serviceScope === policyPackGrantScopes.none,
      ),
    ).toBe(true);
  });

  it('restricts HR to AGENT with OU and service scopes', () => {
    const pack = getPolicyPackDefinition(policyPackKeys.hrRestricted);
    expect(pack?.requiresApproval).toBe(true);
    expect(pack?.grants).toHaveLength(1);
    expect(pack?.grants[0]?.roleKey).toBe(authorizationRoleKeys.agent);
    expect(pack?.grants[0]?.serviceScope).toBe(policyPackGrantScopes.target);
  });

  it('restricts Finance ADMIN and AGENT to OU and service scopes', () => {
    const pack = getPolicyPackDefinition(policyPackKeys.financeRestricted);
    expect(pack?.requiresApproval).toBe(true);
    expect(pack?.grants.map((grant) => grant.roleKey).sort()).toEqual([
      authorizationRoleKeys.admin,
      authorizationRoleKeys.agent,
    ]);
    expect(
      pack?.grants.every(
        (grant) => grant.serviceScope === policyPackGrantScopes.target,
      ),
    ).toBe(true);
  });

  it('rejects SuperAdmin grants before apply', () => {
    const invalid: PolicyPackDefinition = {
      key: 'PACK_INVALID',
      name: 'Invalid',
      description: 'invalid',
      defaultClassification: 'INTERNAL',
      requiresApproval: false,
      grants: [
        {
          roleKey: authorizationRoleKeys.superAdmin,
          permissionKeys: [],
          organizationalUnitScope: policyPackGrantScopes.none,
          serviceScope: policyPackGrantScopes.none,
        },
      ],
    };
    expect(() => assertPolicyPackDefinition(invalid)).toThrow(PolicyPackError);
    try {
      assertPolicyPackDefinition(invalid);
    } catch (error) {
      expect(error).toBeInstanceOf(PolicyPackError);
      expect((error as PolicyPackError).code).toBe('SUPER_ADMIN_GRANT_FORBIDDEN');
    }
  });
});
