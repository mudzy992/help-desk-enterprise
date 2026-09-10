import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { policyPackKeys } from './policy-pack.constants';
import {
  createPolicyPackTestWorld,
  policyPackTestIds,
} from './create-policy-pack-test-world';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('policy pack idempotency', () => {
  it('applies IT, HR, and Finance packs without duplicating grants', async () => {
    const { memory, service } = createPolicyPackTestWorld();
    const firstIt = await service.apply({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      userIds: [policyPackTestIds.localUser],
    });
    const secondIt = await service.apply({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      userIds: [policyPackTestIds.localUser],
    });
    expect(firstIt.createdUserRoleCount).toBe(2);
    expect(secondIt.createdUserRoleCount).toBe(0);
    expect(secondIt.existingUserRoleCount).toBe(2);
    expect(secondIt.createdRolePermissionCount).toBe(0);
    expect(memory.getOrganizationalUnit(policyPackTestIds.organizationalUnit)?.policyPackId).toBeTruthy();

    const firstHr = await service.apply({
      packKey: policyPackKeys.hrRestricted,
      organizationalUnitId: policyPackTestIds.siblingOrganizationalUnit,
      serviceId: policyPackTestIds.otherService,
      userIds: [policyPackTestIds.entraUser],
    });
    const secondHr = await service.apply({
      packKey: policyPackKeys.hrRestricted,
      organizationalUnitId: policyPackTestIds.siblingOrganizationalUnit,
      serviceId: policyPackTestIds.otherService,
      userIds: [policyPackTestIds.entraUser],
    });
    expect(firstHr.createdUserRoleCount).toBe(1);
    expect(secondHr.createdUserRoleCount).toBe(0);

    const firstFinance = await service.apply({
      packKey: policyPackKeys.financeRestricted,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      serviceId: policyPackTestIds.service,
      userIds: [policyPackTestIds.localUser],
    });
    const secondFinance = await service.apply({
      packKey: policyPackKeys.financeRestricted,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      serviceId: policyPackTestIds.service,
      userIds: [policyPackTestIds.localUser],
    });
    expect(firstFinance.createdUserRoleCount).toBe(2);
    expect(secondFinance.createdUserRoleCount).toBe(0);
    expect(memory.getService(policyPackTestIds.service)?.policyPackId).toBeTruthy();
  });

  it('does not remove manually assigned roles or extra role permissions', async () => {
    const { memory, service } = createPolicyPackTestWorld();
    memory.seedRole({ id: 'role-agent', key: authorizationRoleKeys.agent });
    memory.seedRole({ id: 'role-user', key: authorizationRoleKeys.user });
    memory.seedPermission({ id: 'permission-merge', key: 'ticket.merge' });
    memory.seedRolePermission({
      id: 'manual-role-permission',
      roleId: 'role-agent',
      permissionId: 'permission-merge',
    });
    memory.seedUserRole({
      id: 'manual-user-role',
      userId: policyPackTestIds.localUser,
      roleId: 'role-user',
      organizationalUnitId: null,
      serviceId: null,
    });
    await service.apply({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      userIds: [policyPackTestIds.localUser],
    });
    expect(
      memory
        .listUserRoles()
        .some((item) => item.id === 'manual-user-role'),
    ).toBe(true);
    expect(
      memory
        .listRolePermissions()
        .some((item) => item.id === 'manual-role-permission'),
    ).toBe(true);
    expect(
      memory.listRoles().some((role) => role.key === authorizationRoleKeys.superAdmin),
    ).toBe(false);
  });
});
