import { HttpException, NotFoundException } from '@nestjs/common';
import { policyPackKeys } from './policy-pack.constants';
import {
  createPolicyPackTestWorld,
  policyPackTestIds,
} from './create-policy-pack-test-world';

async function expectErrorCode(
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await operation;
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getResponse()).toMatchObject({ code });
  }
}

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('policy pack validation', () => {
  it('lists registry packs without writing', async () => {
    const { service } = createPolicyPackTestWorld();
    const packs = await service.list();
    expect(packs.map((pack) => pack.key)).toEqual([
      policyPackKeys.itStandard,
      policyPackKeys.hrRestricted,
      policyPackKeys.financeRestricted,
    ]);
  });

  it('validates IT apply against existing OU and users', async () => {
    const { service } = createPolicyPackTestWorld();
    const result = await service.validate({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      serviceId: undefined,
      userIds: [policyPackTestIds.entraUser, policyPackTestIds.localUser],
    });
    expect(result.valid).toBe(true);
    expect(result.userIds).toEqual([
      policyPackTestIds.entraUser,
      policyPackTestIds.localUser,
    ]);
    expect(result.plannedAssignments).toHaveLength(4);
  });

  it('reports a missing OU as a domain error, not as a forbidden request (val 5, M5 B3)', async () => {
    const { service } = createPolicyPackTestWorld();
    // Pre vala 5 je OuAccessGuard odbijao zahtjev bez OU prije servisa (403);
    // sada odluku nosi domenski sloj, a poruka kaže šta paket stvarno traži.
    await expectErrorCode(
      service.validate({
        packKey: policyPackKeys.itStandard,
        organizationalUnitId: undefined,
        serviceId: undefined,
        userIds: [policyPackTestIds.localUser],
      }),
      'MISSING_ORGANIZATIONAL_UNIT',
    );
    await expectErrorCode(
      service.validate({
        packKey: policyPackKeys.hrRestricted,
        organizationalUnitId: undefined,
        serviceId: policyPackTestIds.service,
        userIds: [policyPackTestIds.localUser],
      }),
      'MISSING_ORGANIZATIONAL_UNIT',
    );
  });

  it('requires a service for HR and Finance packs', async () => {
    const { service } = createPolicyPackTestWorld();
    await expectErrorCode(
      service.validate({
        packKey: policyPackKeys.hrRestricted,
        organizationalUnitId: policyPackTestIds.organizationalUnit,
        serviceId: undefined,
        userIds: [policyPackTestIds.localUser],
      }),
      'MISSING_SERVICE',
    );
    await expectErrorCode(
      service.validate({
        packKey: policyPackKeys.financeRestricted,
        organizationalUnitId: policyPackTestIds.organizationalUnit,
        serviceId: undefined,
        userIds: [policyPackTestIds.localUser],
      }),
      'MISSING_SERVICE',
    );
  });

  it('rejects unknown pack, OU, service, and user before apply', async () => {
    const { service } = createPolicyPackTestWorld();
    await expect(
      service.validate({
        packKey: 'PACK_UNKNOWN',
        organizationalUnitId: policyPackTestIds.organizationalUnit,
        serviceId: policyPackTestIds.service,
        userIds: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expectErrorCode(
      service.validate({
        packKey: policyPackKeys.itStandard,
        organizationalUnitId: 'missing-ou',
        serviceId: undefined,
        userIds: [],
      }),
      'UNKNOWN_ORGANIZATIONAL_UNIT',
    );
    await expectErrorCode(
      service.validate({
        packKey: policyPackKeys.hrRestricted,
        organizationalUnitId: policyPackTestIds.organizationalUnit,
        serviceId: 'missing-service',
        userIds: [],
      }),
      'UNKNOWN_SERVICE',
    );
    await expectErrorCode(
      service.validate({
        packKey: policyPackKeys.financeRestricted,
        organizationalUnitId: policyPackTestIds.organizationalUnit,
        serviceId: policyPackTestIds.service,
        userIds: ['missing-user'],
      }),
      'UNKNOWN_USER',
    );
  });
});
