import { recordOrganizationalUnitChange } from './record-organizational-unit-change';
import { recordUserChange } from '../users/record-user-change';
import { OrganizationalUnitsService } from './organizational-units.service';
import { createInMemoryOrganizationalUnitPrisma } from './create-in-memory-organizational-unit-prisma';
import {
  createTestOrganizationalUnitScopeLoader,
  testOrganizationalUnitAdminContext,
} from './create-test-organizational-unit-scope';

jest.mock('./record-organizational-unit-change', () => ({
  recordOrganizationalUnitChange: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../users/record-user-change', () => ({
  recordUserChange: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * W2.11 (`BA-organizational-units-02`): the shared catalogue revision is what
 * makes another instance's cache correct. It has to move with the topology write
 * and only with it - a bump that survives a rolled-back write would evict every
 * instance's cache for nothing, and a missing bump would leave a stale `ouPath`
 * (and therefore a stale descendant scope) alive.
 */
describe('organizational unit catalogue revision (W2.11)', () => {
  const createService = () => {
    const memory = createInMemoryOrganizationalUnitPrisma();
    const service = new OrganizationalUnitsService(
      memory.prisma as never,
      createTestOrganizationalUnitScopeLoader() as never,
      {
        invalidateUser: jest.fn().mockResolvedValue(undefined),
        invalidateUsers: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
    return { service, memory };
  };

  beforeEach(() => {
    jest.mocked(recordOrganizationalUnitChange).mockClear();
    jest.mocked(recordUserChange).mockClear();
    jest.mocked(recordOrganizationalUnitChange).mockResolvedValue(undefined);
  });

  it('bumps the revision in the same transaction as the create', async () => {
    const { service, memory } = createService();
    expect(memory.getCatalogRevision()).toBe(0n);

    await service.create({
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=example,DC=com',
    });

    expect(memory.getCatalogRevision()).toBe(1n);
  });

  it('bumps again when a rename rewrites the subtree path', async () => {
    const { service, memory } = createService();
    const root = await service.create({
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=example,DC=com',
    });
    await service.create({
      name: 'IT',
      type: 'BRANCH',
      distinguishedName: 'OU=IT,OU=Korisnici,DC=example,DC=com',
      parentId: root.id,
    });
    const beforeRename = memory.getCatalogRevision();

    await service.update(
      root.id,
      { name: 'Directorate' },
      testOrganizationalUnitAdminContext,
    );

    expect(memory.getCatalogRevision()).toBe(beforeRename + 1n);
  });

  it('bumps on delete', async () => {
    const { service, memory } = createService();
    const unit = await service.create({
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=example,DC=com',
    });
    const beforeDelete = memory.getCatalogRevision();

    await service.delete(unit.id, testOrganizationalUnitAdminContext);

    expect(memory.getCatalogRevision()).toBe(beforeDelete + 1n);
  });

  it('does not bump when the transaction rolls back', async () => {
    const { service, memory } = createService();
    jest
      .mocked(recordOrganizationalUnitChange)
      .mockRejectedValueOnce(new Error('audit insert failed'));

    await expect(
      service.create({
        name: 'Uncommitted',
        type: 'DIRECTORATE',
        distinguishedName: 'OU=Uncommitted,DC=example,DC=com',
      }),
    ).rejects.toThrow('audit insert failed');

    expect(memory.getCatalogRevision()).toBe(0n);
  });
});
