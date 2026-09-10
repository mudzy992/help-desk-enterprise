import { BadRequestException, ConflictException } from '@nestjs/common';
import { createInMemoryOrganizationalUnitPrisma } from './create-in-memory-organizational-unit-prisma';
import { OrganizationalUnitsService } from './organizational-units.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('OrganizationalUnitsService hierarchy', () => {
  const createService = (): OrganizationalUnitsService => {
    const { prisma } = createInMemoryOrganizationalUnitPrisma();
    return new OrganizationalUnitsService(prisma as never);
  };

  async function seedBranch(
    service: OrganizationalUnitsService,
  ): Promise<{ rootId: string; childId: string; grandchildId: string }> {
    const root = await service.create({
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=epbih,DC=ba',
    });
    const child = await service.create({
      name: 'ED Zenica',
      type: 'BRANCH',
      distinguishedName: 'OU=ED Zenica,OU=Korisnici,DC=epbih,DC=ba',
      parentId: root.id,
    });
    const grandchild = await service.create({
      name: 'Breza',
      type: 'OFFICE',
      distinguishedName: 'OU=Breza,OU=ED Zenica,OU=Korisnici,DC=epbih,DC=ba',
      parentId: child.id,
    });
    return { rootId: root.id, childId: child.id, grandchildId: grandchild.id };
  }

  it('returns an explicit nested tree from the roots downward', async () => {
    const service = createService();
    const ids = await seedBranch(service);
    const tree = await service.getTree();
    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe(ids.rootId);
    expect(tree[0]?.children[0]?.id).toBe(ids.childId);
    expect(tree[0]?.children[0]?.children[0]?.id).toBe(ids.grandchildId);
  });

  it('rejects self-parenting', async () => {
    const service = createService();
    const ids = await seedBranch(service);
    await expect(
      service.update(ids.childId, { parentId: ids.childId }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a parent that would create a circular hierarchy', async () => {
    const service = createService();
    const ids = await seedBranch(service);
    await expect(
      service.update(ids.childId, {
        parentId: ids.grandchildId,
        distinguishedName: 'OU=ED Zenica,OU=Breza,OU=Korisnici,DC=epbih,DC=ba',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects deleting an OU that still has children', async () => {
    const service = createService();
    const ids = await seedBranch(service);
    await expect(service.delete(ids.childId)).rejects.toBeInstanceOf(ConflictException);
    const tree = await service.getTree();
    expect(tree[0]?.children[0]?.id).toBe(ids.childId);
  });

  it('reparents a subtree and rewrites descendant application paths', async () => {
    const service = createService();
    const ids = await seedBranch(service);
    const direkcija = await service.create({
      name: 'Direkcija',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Direkcija,OU=Korisnici,DC=epbih,DC=ba',
      parentId: ids.rootId,
    });
    const moved = await service.update(ids.childId, {
      parentId: direkcija.id,
      distinguishedName: 'OU=ED Zenica,OU=Direkcija,OU=Korisnici,DC=epbih,DC=ba',
    });
    expect(moved.parentId).toBe(direkcija.id);
    expect(moved.ouPath).toBe('/Korisnici/Direkcija/ED Zenica');
    const grandchild = await service.getById(ids.grandchildId);
    expect(grandchild.ouPath).toBe('/Korisnici/Direkcija/ED Zenica/Breza');
    expect(grandchild.distinguishedName).toBe(
      'OU=Breza,OU=ED Zenica,OU=Direkcija,OU=Korisnici,DC=epbih,DC=ba',
    );
  });
});
