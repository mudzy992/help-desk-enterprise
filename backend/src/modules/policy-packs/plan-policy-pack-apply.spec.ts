import {
  packRequiresOrganizationalUnit,
  packRequiresService,
  planPolicyPackAssignments,
  readPolicyPackApplyTargetInput,
} from './plan-policy-pack-apply';
import { policyPackGrantScopes } from './policy-pack.constants';
import { PolicyPackError } from './policy-pack.error';
import type {
  PolicyPackApplyTarget,
  PolicyPackDefinition,
} from './policy-pack.types';

/**
 * M5 B3 (val 5): the target of an apply may be an OU, a service or both, and
 * *which* one the pack needs follows from its grant scopes — not from the DTO.
 * These are the pure rules behind that promise.
 */
const pack = (
  grants: PolicyPackDefinition['grants'],
): PolicyPackDefinition => ({
  key: 'PACK_TEST',
  name: 'Test',
  description: '',
  defaultClassification: 'INTERNAL',
  requiresApproval: false,
  slaProfileKey: null,
  grants,
});

const target = (
  overrides: Partial<PolicyPackApplyTarget> & { pack: PolicyPackDefinition },
): PolicyPackApplyTarget => ({
  organizationalUnitId: null,
  organizationalUnitPath: null,
  serviceId: null,
  userIds: ['user-1'],
  ...overrides,
});

describe('planPolicyPackApply target rules (val 5, M5 B3)', () => {
  it('reads the required target from the grant scopes', () => {
    expect(
      packRequiresOrganizationalUnit(
        pack([
          {
            roleKey: 'AGENT',
            permissionKeys: [],
            organizationalUnitScope: policyPackGrantScopes.target,
            serviceScope: policyPackGrantScopes.none,
          },
        ]),
      ),
    ).toBe(true);
    expect(
      packRequiresService(
        pack([
          {
            roleKey: 'AGENT',
            permissionKeys: [],
            organizationalUnitScope: policyPackGrantScopes.none,
            serviceScope: policyPackGrantScopes.target,
          },
        ]),
      ),
    ).toBe(true);
  });

  it('accepts a service-only pack without an organisational unit', () => {
    const serviceOnly = pack([
      {
        roleKey: 'AGENT',
        permissionKeys: ['ticket.attachments.download'],
        organizationalUnitScope: policyPackGrantScopes.none,
        serviceScope: policyPackGrantScopes.target,
      },
    ]);
    const parsed = readPolicyPackApplyTargetInput(serviceOnly, {
      packKey: serviceOnly.key,
      serviceId: 'svc-1',
    });
    expect(parsed).toEqual({
      organizationalUnitId: null,
      serviceId: 'svc-1',
      userIds: [],
    });
    const planned = planPolicyPackAssignments(
      target({
        pack: serviceOnly,
        serviceId: 'svc-1',
        userIds: ['user-1'],
      }),
    );
    expect(planned).toEqual([
      {
        userId: 'user-1',
        roleKey: 'AGENT',
        permissionKeys: ['ticket.attachments.download'],
        // OU scope is `none`: the grant must not silently claim an OU.
        organizationalUnitId: null,
        serviceId: 'svc-1',
      },
    ]);
  });

  it('still refuses a service-only request when the pack needs an OU', () => {
    const ouPack = pack([
      {
        roleKey: 'ADMIN',
        permissionKeys: [],
        organizationalUnitScope: policyPackGrantScopes.target,
        serviceScope: policyPackGrantScopes.none,
      },
    ]);
    expect(() =>
      readPolicyPackApplyTargetInput(ouPack, {
        packKey: ouPack.key,
        serviceId: 'svc-1',
      }),
    ).toThrow(PolicyPackError);
    try {
      readPolicyPackApplyTargetInput(ouPack, {
        packKey: ouPack.key,
        serviceId: 'svc-1',
      });
    } catch (error) {
      expect((error as PolicyPackError).code).toBe(
        'MISSING_ORGANIZATIONAL_UNIT',
      );
    }
  });

  it('refuses a pack that needs a service when only the OU is given', () => {
    const servicePack = pack([
      {
        roleKey: 'AGENT',
        permissionKeys: [],
        organizationalUnitScope: policyPackGrantScopes.none,
        serviceScope: policyPackGrantScopes.target,
      },
    ]);
    try {
      readPolicyPackApplyTargetInput(servicePack, {
        packKey: servicePack.key,
        organizationalUnitId: 'ou-1',
      });
      throw new Error('expected MISSING_SERVICE');
    } catch (error) {
      expect((error as PolicyPackError).code).toBe('MISSING_SERVICE');
    }
  });
});
