import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OrganizationalUnitsService } from './organizational-units.service';
import { createInMemoryOrganizationalUnitPrisma } from './create-in-memory-organizational-unit-prisma';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('OrganizationalUnitsService CRUD', () => {
  const createService = (
    invalidateUser = jest.fn().mockResolvedValue(1),
  ): {
    service: OrganizationalUnitsService;
    invalidateUser: jest.Mock;
    memory: ReturnType<typeof createInMemoryOrganizationalUnitPrisma>;
  } => {
    const memory = createInMemoryOrganizationalUnitPrisma();
    return {
      service: new OrganizationalUnitsService(memory.prisma as never, {
        invalidateUser,
      } as never),
      invalidateUser,
      memory,
    };
  };

  it('creates a root OU with DN and canonical path', async () => {
    const { service } = createService();
    const created = await service.create({
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=epbih,DC=ba',
    });
    expect(created.parentId).toBeNull();
    expect(created.distinguishedName).toBe('OU=Korisnici,DC=epbih,DC=ba');
    expect(created.ouPath).toBe('/Korisnici');
    expect(created.children).toEqual([]);
    expect(created.users).toEqual([]);
  });

  it('creates a child OU under a parent', async () => {
    const { service } = createService();
    const root = await service.create({
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=epbih,DC=ba',
    });
    const child = await service.create({
      name: 'Direkcija',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Direkcija,OU=Korisnici,DC=epbih,DC=ba',
      parentId: root.id,
    });
    expect(child.parentId).toBe(root.id);
    expect(child.ouPath).toBe('/Korisnici/Direkcija');
    const retrieved = await service.getById(root.id);
    expect(retrieved.children.map((item) => item.id)).toEqual([child.id]);
  });

  it('retrieves and updates an OU', async () => {
    const { service } = createService();
    const created = await service.create({
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=epbih,DC=ba',
      company: 'EPBiH',
    });
    const updated = await service.update(created.id, { name: 'Korisnici EP' });
    expect(updated.name).toBe('Korisnici EP');
    expect(updated.ouPath).toBe('/Korisnici EP');
    expect(updated.company).toBe('EPBiH');
  });

  it('rejects duplicate distinguished names and paths', async () => {
    const { service } = createService();
    await service.create({
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=epbih,DC=ba',
    });
    await expect(
      service.create({
        name: 'Korisnici',
        type: 'BRANCH',
        distinguishedName: 'ou=Korisnici,dc=epbih,dc=ba',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a distinguished name that does not sit under the parent DN', async () => {
    const { service } = createService();
    const root = await service.create({
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=epbih,DC=ba',
    });
    await expect(
      service.create({
        name: 'Direkcija',
        type: 'DIRECTORATE',
        distinguishedName: 'OU=Direkcija,DC=epbih,DC=ba',
        parentId: root.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid parent reference', async () => {
    const { service } = createService();
    await expect(
      service.create({
        name: 'Direkcija',
        type: 'DIRECTORATE',
        distinguishedName: 'OU=Direkcija,OU=Korisnici,DC=epbih,DC=ba',
        parentId: 'missing-parent',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('drops the cached authorization data of a user moved to another unit', async () => {
    // Phase 2.2 (plan §2.2): the unit is part of the principal context.
    const { service, invalidateUser, memory } = createService();
    const created = await service.create({
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=epbih,DC=ba',
    });
    memory.seedUser({
      id: 'local-user',
      email: 'admin@example.com',
      displayName: 'Local Admin',
      organizationalUnitId: null,
      isLocalOnly: true,
      entraObjectId: null,
      localPasswordHash: 'hash-must-not-leak',
    });

    await service.assignUser({
      userId: 'local-user',
      organizationalUnitId: created.id,
    });

    expect(invalidateUser).toHaveBeenCalledTimes(1);
    expect(invalidateUser).toHaveBeenCalledWith('local-user');
  });

  it('deletes a leaf OU', async () => {
    const { service } = createService();
    const created = await service.create({
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=epbih,DC=ba',
    });
    await service.delete(created.id);
    await expect(service.getById(created.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
