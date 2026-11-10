import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { policyPackKeys } from './policy-pack.constants';
import {
  createPolicyPackTestWorld,
  policyPackTestIds,
} from './create-policy-pack-test-world';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('policy pack authorization cache invalidation', () => {
  it('invalidates newly assigned users once in a post-commit batch', async () => {
    const invalidateUsers = jest.fn().mockResolvedValue(undefined);
    const { service } = createPolicyPackTestWorld({ invalidateUsers });

    await service.apply({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      userIds: [policyPackTestIds.localUser],
    });

    expect(invalidateUsers).toHaveBeenCalledTimes(1);
    expect(invalidateUsers).toHaveBeenCalledWith([policyPackTestIds.localUser]);
  });

  it('invalidates each user granted a pack role once in one batch', async () => {
    const invalidateUsers = jest.fn().mockResolvedValue(undefined);
    const { service } = createPolicyPackTestWorld({ invalidateUsers });

    await service.apply({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      userIds: [policyPackTestIds.localUser, policyPackTestIds.entraUser],
    });

    expect(invalidateUsers).toHaveBeenCalledTimes(1);
    expect(invalidateUsers).toHaveBeenCalledWith([
      policyPackTestIds.entraUser,
      policyPackTestIds.localUser,
    ]);
  });

  it('invalidates existing holders outside the target when global role permissions are added', async () => {
    const invalidateUsers = jest.fn().mockResolvedValue(undefined);
    const { memory, service } = createPolicyPackTestWorld({ invalidateUsers });
    const adminRoleId = 'existing-admin-role';
    memory.seedRole({ id: adminRoleId, key: authorizationRoleKeys.admin });
    memory.seedUserRole({
      id: 'existing-admin-holder',
      userId: policyPackTestIds.entraUser,
      roleId: adminRoleId,
      organizationalUnitId: policyPackTestIds.siblingOrganizationalUnit,
      serviceId: null,
    });

    await service.apply({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      userIds: [policyPackTestIds.localUser],
    });

    expect(invalidateUsers).toHaveBeenCalledTimes(1);
    expect(invalidateUsers).toHaveBeenCalledWith([
      policyPackTestIds.entraUser,
      policyPackTestIds.localUser,
    ]);
  });

  it('invalidates removed pack-role holders on unapply', async () => {
    const invalidateUsers = jest.fn().mockResolvedValue(undefined);
    const { service } = createPolicyPackTestWorld({ invalidateUsers });
    const input = {
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      userIds: [policyPackTestIds.localUser],
    };

    await service.apply(input);
    invalidateUsers.mockClear();
    await service.unapply(input);

    expect(invalidateUsers).toHaveBeenCalledTimes(1);
    expect(invalidateUsers).toHaveBeenCalledWith([policyPackTestIds.localUser]);
  });

  it('does not invalidate anyone when an idempotent re-apply changes nothing', async () => {
    const invalidateUsers = jest.fn().mockResolvedValue(undefined);
    const { service } = createPolicyPackTestWorld({ invalidateUsers });
    const input = {
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      userIds: [policyPackTestIds.localUser],
    };

    await service.apply(input);
    const firstCallCount = invalidateUsers.mock.calls.length;
    await service.apply(input);

    expect(firstCallCount).toBe(1);
    expect(invalidateUsers).toHaveBeenCalledTimes(firstCallCount);
  });

  it('keeps the role catalogue constants unchanged', async () => {
    const invalidateUsers = jest.fn().mockResolvedValue(undefined);
    const { service } = createPolicyPackTestWorld({ invalidateUsers });
    await service.apply({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      userIds: [policyPackTestIds.localUser],
    });
    expect(authorizationRoleKeys.agent).toBe('AGENT');
  });
});
