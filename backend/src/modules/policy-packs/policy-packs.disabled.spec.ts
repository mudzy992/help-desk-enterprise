import { HttpException } from '@nestjs/common';
import { settingKeys } from '../settings/setting-keys';
import { policyPackKeys } from './policy-pack.constants';
import {
  createPolicyPackTestWorld,
  policyPackTestIds,
} from './create-policy-pack-test-world';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * M5 B2 (val 5): packs live in code, but `private.policyPacks.disabledKeysCsv`
 * lets an installation switch one off. Disabled means "cannot be applied";
 * unapply stays available so a disabled pack can still be cleaned up.
 */
describe('policy pack disabled by settings (M5 B2)', () => {
  const disabledHr = {
    [settingKeys.privatePolicyPacksDisabledKeysCsv]:
      'pack_hr_restricted, PACK_FINANCE_RESTRICTED',
  };

  it('marks disabled packs in the list', async () => {
    const { service } = createPolicyPackTestWorld({
      settingValues: disabledHr,
    });
    const packs = await service.list();
    expect(
      packs.map((pack) => [pack.key, pack.isDisabled] as const),
    ).toEqual([
      [policyPackKeys.itStandard, false],
      [policyPackKeys.hrRestricted, true],
      [policyPackKeys.financeRestricted, true],
    ]);
  });

  it('refuses to validate or apply a disabled pack', async () => {
    const { service } = createPolicyPackTestWorld({
      settingValues: disabledHr,
    });
    const input = {
      packKey: policyPackKeys.hrRestricted,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      serviceId: policyPackTestIds.service,
    };
    for (const operation of [service.validate(input), service.apply(input)]) {
      try {
        await operation;
        throw new Error('expected PACK_DISABLED');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getResponse()).toMatchObject({
          code: 'PACK_DISABLED',
        });
      }
    }
  });

  it('still allows unapplying a disabled pack', async () => {
    const { service } = createPolicyPackTestWorld({
      settingValues: disabledHr,
    });
    await expect(
      service.unapply({
        packKey: policyPackKeys.hrRestricted,
        organizationalUnitId: policyPackTestIds.organizationalUnit,
        serviceId: policyPackTestIds.service,
      }),
    ).resolves.toMatchObject({ removedUserRoleCount: 0 });
  });

  it('applies everything when no pack is switched off', async () => {
    const { service } = createPolicyPackTestWorld();
    await expect(
      service.apply({
        packKey: policyPackKeys.itStandard,
        organizationalUnitId: policyPackTestIds.organizationalUnit,
      }),
    ).resolves.toMatchObject({ packKey: policyPackKeys.itStandard });
  });
});
