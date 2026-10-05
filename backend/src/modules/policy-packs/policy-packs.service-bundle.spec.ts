import { policyPackKeys } from './policy-pack.constants';
import {
  createPolicyPackTestWorld,
  policyPackTestIds,
} from './create-policy-pack-test-world';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * M5 B1 (val 5): a pack used to carry roles and permissions only, even though
 * the model has had `defaultClassification`, `requiresApproval` and
 * `slaProfileId` all along. These tests pin down the bundle part: what apply
 * writes onto a *service*, and what it does when this installation has no
 * matching SLA profile.
 */
describe('policy pack service bundle (M5 B1)', () => {
  it('writes classification, approval flag and the SLA profile of the pack', async () => {
    const { memory, service } = createPolicyPackTestWorld();
    memory.seedSlaProfile({ id: 'sla-hr', key: 'HR' });
    const validated = await service.validate({
      packKey: policyPackKeys.hrRestricted,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      serviceId: policyPackTestIds.service,
    });
    expect(validated.servicePolicy).toEqual({
      classification: 'RESTRICTED',
      requiresApproval: true,
      slaProfileKey: 'HR',
      slaProfileResolved: true,
    });

    const applied = await service.apply({
      packKey: policyPackKeys.hrRestricted,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      serviceId: policyPackTestIds.service,
    });

    expect(applied.servicePolicy).toEqual(validated.servicePolicy);
    expect(memory.getService(policyPackTestIds.service)).toMatchObject({
      classification: 'RESTRICTED',
      requiresApproval: true,
      slaProfileId: 'sla-hr',
    });
  });

  it('reports an unresolved SLA profile and keeps the service binding', async () => {
    const { memory, service } = createPolicyPackTestWorld();
    const applied = await service.apply({
      packKey: policyPackKeys.financeRestricted,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      serviceId: policyPackTestIds.service,
    });

    // The wizard seeds FINANCE, but a trimmed installation may not have it —
    // the apply must not fail, and must not silently bind some other profile.
    expect(applied.servicePolicy).toEqual({
      classification: 'CONFIDENTIAL',
      requiresApproval: true,
      slaProfileKey: 'FINANCE',
      slaProfileResolved: false,
    });
    expect(memory.getService(policyPackTestIds.service)?.slaProfileId).toBeUndefined();
    expect(memory.getService(policyPackTestIds.service)).toMatchObject({
      classification: 'CONFIDENTIAL',
      requiresApproval: true,
    });
  });

  it('has nothing to write when the target is an OU', async () => {
    const { memory, service } = createPolicyPackTestWorld();
    const validated = await service.validate({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
    });
    expect(validated.servicePolicy).toBeNull();
    expect(memory.getOrganizationalUnit(policyPackTestIds.organizationalUnit)).toBeDefined();
  });
});
