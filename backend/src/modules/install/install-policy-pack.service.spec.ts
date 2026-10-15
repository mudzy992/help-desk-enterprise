import { HttpException } from '@nestjs/common';
import { applyPolicyPack } from '../policy-packs/apply-policy-pack';
import { policyPackKeys } from '../policy-packs/policy-pack.constants';
import { settingKeys } from '../settings/setting-keys';
import { createInstallWizardHarness } from './create-install-wizard-harness';
import { InstallPolicyPackService } from './install-policy-pack.service';

/**
 * F4.3: the step may only apply what the applied blueprint offers, and only a pack
 * the deployment has not switched off. The grants themselves are `applyPolicyPack`'s
 * job (covered by the policy-packs specs); this spec checks the wizard's rules and
 * the marker that makes the step count as answered.
 */
jest.mock('../policy-packs/apply-policy-pack', () => ({
  applyPolicyPack: jest.fn(),
}));

const applyPolicyPackMock = applyPolicyPack as jest.MockedFunction<
  typeof applyPolicyPack
>;

async function createService() {
  const harness = await createInstallWizardHarness();
  return {
    harness,
    service: new InstallPolicyPackService(
      harness.prisma,
      harness.settingsService,
      harness.registry,
    ),
  };
}

function errorCode(error: unknown): string {
  if (!(error instanceof HttpException)) {
    throw new Error(`Expected an HttpException, got ${String(error)}`);
  }
  return (error.getResponse() as { code?: string }).code ?? '';
}

function applyResult() {
  return {
    packKey: policyPackKeys.itStandard,
    name: 'IT Standard',
    organizationalUnitId: 'unit-1',
    serviceId: 'service-1',
    userIds: [],
    createdUserRoleCount: 2,
    existingUserRoleCount: 0,
    createdRolePermissionCount: 3,
    existingRolePermissionCount: 1,
    servicePolicy: null,
    plannedAssignments: [],
  };
}

describe('InstallPolicyPackService', () => {
  beforeEach(() => {
    applyPolicyPackMock.mockReset();
    applyPolicyPackMock.mockResolvedValue(applyResult());
  });

  it('offers every pack while no blueprint was applied', async () => {
    const { service } = await createService();

    const status = await service.getStatus();

    expect(status.applied).toBeNull();
    expect(status.blueprint).toBeNull();
    expect(status.packs.map((pack) => pack.key)).toEqual([
      policyPackKeys.itStandard,
      policyPackKeys.hrRestricted,
      policyPackKeys.financeRestricted,
    ]);
  });

  it('offers only the packs of the applied blueprint', async () => {
    const { service, harness } = await createService();
    await harness.settingsService.setSettingValue(
      settingKeys.privateInstallBlueprint,
      'itServiceDesk',
      { reason: 'install_wizard', actorUserId: harness.actorUserId },
    );

    const status = await service.getStatus();

    // F4.3 (open question 3): the IT blueprint has no HR or finance request
    // types, so those packs are not offered here.
    expect(status.packs.map((pack) => pack.key)).toEqual([
      policyPackKeys.itStandard,
    ]);
  });

  it('applies the pack to the seeded unit and service, then marks the step', async () => {
    const { service, harness } = await createService();
    await harness.seedMinimum();

    const result = await service.apply({
      policyPackKey: policyPackKeys.itStandard,
    });

    expect(applyPolicyPackMock).toHaveBeenCalledTimes(1);
    const [prisma, input, actor] = applyPolicyPackMock.mock.calls[0];
    expect(prisma).toBe(harness.prisma);
    expect(input).toMatchObject({
      packKey: policyPackKeys.itStandard,
      serviceId: expect.any(String),
    });
    expect(input.organizationalUnitId).toBe(
      (await harness.seedMinimum()).organizationalUnit?.id,
    );
    expect(actor).toEqual({ actorUserId: harness.actorUserId, requestId: null });
    expect(result).toMatchObject({
      policyPackKey: policyPackKeys.itStandard,
      createdUserRoleCount: 2,
      createdRolePermissionCount: 3,
    });
    await expect(
      harness.settingsService.getSetting(settingKeys.privateInstallPolicyPack),
    ).resolves.toBe(policyPackKeys.itStandard);
  });

  it('refuses a pack the blueprint does not offer', async () => {
    const { service, harness } = await createService();
    await harness.settingsService.setSettingValue(
      settingKeys.privateInstallBlueprint,
      'itServiceDesk',
      { reason: 'install_wizard', actorUserId: harness.actorUserId },
    );

    const error = await service
      .apply({ policyPackKey: policyPackKeys.hrRestricted })
      .catch((thrown: unknown) => thrown);

    expect(errorCode(error)).toBe('POLICY_PACK_NOT_OFFERED');
    expect(applyPolicyPackMock).not.toHaveBeenCalled();
  });

  it('honours a pack the deployment switched off', async () => {
    const { service, harness } = await createService();
    await harness.settingsService.setSettingValue(
      settingKeys.privatePolicyPacksDisabledKeysCsv,
      policyPackKeys.itStandard,
      { reason: 'install_wizard', actorUserId: harness.actorUserId },
    );

    const error = await service
      .apply({ policyPackKey: policyPackKeys.itStandard })
      .catch((thrown: unknown) => thrown);

    // The same code and wording the Settings screen answers with.
    expect(errorCode(error)).toBe('PACK_DISABLED');
    expect(applyPolicyPackMock).not.toHaveBeenCalled();
  });
});
