import { HttpException } from '@nestjs/common';
import { policyPackKeys } from './policy-pack.constants';
import {
  createPolicyPackTestWorld,
  policyPackTestIds,
} from './create-policy-pack-test-world';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * M5 B5 (val 5): apply used to be a one-way street. These tests pin down what
 * "unapply" removes — and, just as important, what it leaves alone.
 */
describe('policy pack unapply', () => {
  it('removes the grants and the OU/service link that apply created', async () => {
    const { memory, service } = createPolicyPackTestWorld();
    await service.apply({
      packKey: policyPackKeys.hrRestricted,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      serviceId: policyPackTestIds.service,
      userIds: [policyPackTestIds.localUser, policyPackTestIds.entraUser],
    });
    expect(memory.getOrganizationalUnit(policyPackTestIds.organizationalUnit)?.policyPackId).toBeTruthy();
    expect(memory.getService(policyPackTestIds.service)?.policyPackId).toBeTruthy();
    expect(memory.listUserRoles()).toHaveLength(2);

    const result = await service.unapply({
      packKey: policyPackKeys.hrRestricted,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      serviceId: policyPackTestIds.service,
      userIds: [policyPackTestIds.localUser, policyPackTestIds.entraUser],
    });

    expect(result.removedUserRoleCount).toBe(2);
    expect(result.unboundOrganizationalUnit).toBe(true);
    expect(result.unboundService).toBe(true);
    expect(memory.listUserRoles()).toHaveLength(0);
    expect(memory.getOrganizationalUnit(policyPackTestIds.organizationalUnit)?.policyPackId).toBeNull();
    expect(memory.getService(policyPackTestIds.service)?.policyPackId).toBeNull();
    // Roles and their permissions stay: they are global rows other targets may
    // still be using.
    expect(memory.listRoles().some((role) => role.key === 'AGENT')).toBe(true);
    expect(memory.listRolePermissions().length).toBeGreaterThan(0);
  });

  it('removes only the grants of the named target', async () => {
    const { memory, service } = createPolicyPackTestWorld();
    await service.apply({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      userIds: [policyPackTestIds.localUser],
    });
    await service.apply({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.siblingOrganizationalUnit,
      userIds: [policyPackTestIds.localUser],
    });
    const before = memory.listUserRoles().length;

    const result = await service.unapply({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      userIds: [policyPackTestIds.localUser],
    });

    expect(result.removedUserRoleCount).toBe(2);
    expect(result.unboundOrganizationalUnit).toBe(true);
    expect(memory.listUserRoles()).toHaveLength(before - 2);
    expect(
      memory.getOrganizationalUnit(policyPackTestIds.siblingOrganizationalUnit)
        ?.policyPackId,
    ).toBeTruthy();
  });

  it('leaves a different pack bound to the same unit untouched', async () => {
    const { memory, service } = createPolicyPackTestWorld();
    await service.apply({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
    });
    const financeApplied = await service.apply({
      packKey: policyPackKeys.financeRestricted,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      serviceId: policyPackTestIds.service,
    });
    expect(financeApplied.packKey).toBe(policyPackKeys.financeRestricted);

    const result = await service.unapply({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
    });

    // The unit now carries the Finance pack, so unapplying IT must not clear it.
    expect(result.unboundOrganizationalUnit).toBe(false);
    expect(
      memory.getOrganizationalUnit(policyPackTestIds.organizationalUnit)
        ?.policyPackId,
    ).not.toBeNull();
  });

  it('refuses a request without any target', async () => {
    const { service } = createPolicyPackTestWorld();
    try {
      await service.unapply({ packKey: policyPackKeys.itStandard });
      throw new Error('expected MISSING_TARGET');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'MISSING_TARGET',
      });
    }
  });

  it('accepts a service-only target even for a pack that needs an OU', async () => {
    const { service } = createPolicyPackTestWorld();
    const result = await service.unapply({
      packKey: policyPackKeys.itStandard,
      serviceId: policyPackTestIds.service,
    });
    expect(result.removedUserRoleCount).toBe(0);
    expect(result.unboundService).toBe(false);
  });
});
