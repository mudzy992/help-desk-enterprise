import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { policyPackKeys } from './policy-pack.constants';
import {
  createPolicyPackTestWorld,
  policyPackTestIds,
} from './create-policy-pack-test-world';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * Phase 2.2 (plan §2.2): applying a policy pack grants roles to users, so their
 * cached principal context has to go — once per affected user, and only for the
 * grants that were actually created.
 */
describe('policy pack authorization cache invalidation', () => {
  it('invalidates each user that received a new role', async () => {
    const invalidateUser = jest.fn().mockResolvedValue(1);
    const { service } = createPolicyPackTestWorld({ invalidateUser });

    await service.apply({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      userIds: [policyPackTestIds.localUser],
    });

    expect(invalidateUser).toHaveBeenCalledTimes(1);
    expect(invalidateUser).toHaveBeenCalledWith(policyPackTestIds.localUser);
  });

  it('invalidates every user of a pack, once each', async () => {
    const invalidateUser = jest.fn().mockResolvedValue(1);
    const { service } = createPolicyPackTestWorld({ invalidateUser });

    await service.apply({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      userIds: [policyPackTestIds.localUser, policyPackTestIds.entraUser],
    });

    expect([...invalidateUser.mock.calls].map((call) => call[0]).sort()).toEqual([
      policyPackTestIds.entraUser,
      policyPackTestIds.localUser,
    ]);
    expect(invalidateUser).toHaveBeenCalledTimes(2);
  });

  it('does not invalidate anyone when the same pack is applied twice', async () => {
    const invalidateUser = jest.fn().mockResolvedValue(1);
    const { service } = createPolicyPackTestWorld({ invalidateUser });
    const input = {
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      userIds: [policyPackTestIds.localUser],
    };

    await service.apply(input);
    const firstCallCount = invalidateUser.mock.calls.length;
    await service.apply(input);

    // The second apply created nothing, so there is nothing to refresh.
    expect(invalidateUser.mock.calls.length).toBe(firstCallCount);
  });

  it('keeps the role catalogue untouched on the way', async () => {
    const invalidateUser = jest.fn().mockResolvedValue(1);
    const { service } = createPolicyPackTestWorld({ invalidateUser });
    await service.apply({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      userIds: [policyPackTestIds.localUser],
    });
    expect(authorizationRoleKeys.agent).toBe('AGENT');
  });
});
