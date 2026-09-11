import { installSeedConstants } from './install-seed.constants';
import {
  createInstallSeedHarness,
  seedNow,
} from './create-install-seed-harness';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('InstallSeedService reuse', () => {
  it('reuses an existing organizational unit', async () => {
    const { service, memory } = await createInstallSeedHarness();
    memory.seedUnit({
      id: 'ou-existing',
      name: 'IT',
      type: 'SECTOR',
      distinguishedName: 'OU=IT,DC=example,DC=com',
      ouPath: '/IT',
      company: null,
      department: null,
      parentId: null,
      createdAt: seedNow,
      updatedAt: seedNow,
    });
    const seeded = await service.seed();
    expect(seeded.created.organizationalUnit).toBe(false);
    expect(seeded.organizationalUnit).toMatchObject({
      id: 'ou-existing',
      name: 'IT',
      ouPath: '/IT',
    });
    expect(memory.countUnits()).toBe(1);
    expect(seeded.routingRule?.originUnitId).toBe('ou-existing');
    expect(seeded.resolution).toMatchObject({
      outcome: 'EXACT',
      groupId: seeded.fallbackGroup?.id,
    });
  });

  it('reuses an existing fallback group', async () => {
    const { service, memory } = await createInstallSeedHarness();
    memory.seedUnit({
      id: 'ou-existing',
      name: 'IT',
      type: 'SECTOR',
      distinguishedName: 'OU=IT,DC=example,DC=com',
      ouPath: '/IT',
      company: null,
      department: null,
      parentId: null,
      createdAt: seedNow,
      updatedAt: seedNow,
    });
    memory.seedGroup({
      id: 'group-existing',
      name: 'IT Support',
      key: 'it-support',
      organizationalUnitId: 'ou-existing',
      isFallback: true,
      createdAt: seedNow,
      updatedAt: seedNow,
    });
    const seeded = await service.seed();
    expect(seeded.created.fallbackGroup).toBe(false);
    expect(seeded.fallbackGroup).toMatchObject({
      id: 'group-existing',
      key: 'it-support',
      isFallback: true,
    });
    expect(memory.countGroups()).toBe(1);
    expect(seeded.routingRule?.groupId).toBe('group-existing');
  });

  it('reuses an existing offered service', async () => {
    const { service, memory } = await createInstallSeedHarness();
    memory.seedCategory({
      id: 'category-existing',
      name: 'Access',
      slug: 'access',
      sortOrder: 0,
      parentId: null,
      createdAt: seedNow,
      updatedAt: seedNow,
    });
    memory.seedService({
      id: 'service-existing',
      name: 'VPN',
      slug: 'vpn',
      categoryId: 'category-existing',
      lifecycle: 'ACTIVE',
      availability: 'OPERATIONAL',
      classification: 'INTERNAL',
      requiresApproval: false,
      isConfidentialDefault: false,
      autoAssignStrategy: 'NONE',
      slaProfileId: null,
      policyPackId: null,
      createdAt: seedNow,
      updatedAt: seedNow,
    });
    const seeded = await service.seed();
    expect(seeded.created.service).toBe(false);
    expect(seeded.created.serviceCategory).toBe(false);
    expect(seeded.service).toMatchObject({
      id: 'service-existing',
      slug: 'vpn',
      lifecycle: 'ACTIVE',
    });
    expect(memory.countServices()).toBe(1);
    expect(seeded.routingRule?.serviceId).toBe('service-existing');
  });

  it('reuses an existing routing rule to the fallback group', async () => {
    const { service, memory } = await createInstallSeedHarness();
    memory.seedUnit({
      id: 'ou-existing',
      name: installSeedConstants.organizationalUnitName,
      type: 'DIRECTORATE',
      distinguishedName: installSeedConstants.distinguishedName,
      ouPath: `/${installSeedConstants.organizationalUnitName}`,
      company: null,
      department: null,
      parentId: null,
      createdAt: seedNow,
      updatedAt: seedNow,
    });
    memory.seedGroup({
      id: 'group-existing',
      name: installSeedConstants.fallbackGroupName,
      key: installSeedConstants.fallbackGroupKey,
      organizationalUnitId: 'ou-existing',
      isFallback: true,
      createdAt: seedNow,
      updatedAt: seedNow,
    });
    memory.seedCategory({
      id: 'category-existing',
      name: installSeedConstants.categoryName,
      slug: installSeedConstants.categorySlug,
      sortOrder: 0,
      parentId: null,
      createdAt: seedNow,
      updatedAt: seedNow,
    });
    memory.seedService({
      id: 'service-existing',
      name: installSeedConstants.serviceName,
      slug: installSeedConstants.serviceSlug,
      categoryId: 'category-existing',
      lifecycle: 'ACTIVE',
      availability: 'OPERATIONAL',
      classification: 'INTERNAL',
      requiresApproval: false,
      isConfidentialDefault: false,
      autoAssignStrategy: 'NONE',
      slaProfileId: null,
      policyPackId: null,
      createdAt: seedNow,
      updatedAt: seedNow,
    });
    memory.seedRule({
      id: 'rule-existing',
      originUnitId: 'ou-existing',
      serviceId: 'service-existing',
      groupId: 'group-existing',
      createdAt: seedNow,
      updatedAt: seedNow,
    });
    const seeded = await service.seed();
    expect(seeded.created.routingRule).toBe(false);
    expect(seeded.routingRule?.id).toBe('rule-existing');
    expect(memory.countRules()).toBe(1);
    expect(seeded.resolution).toMatchObject({
      outcome: 'EXACT',
      groupId: 'group-existing',
      fallbackDepth: 0,
    });
  });
});
