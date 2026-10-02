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
      distinguishedName: 'OU=Korisnici,DC=example,DC=com',
    });
    expect(created.parentId).toBeNull();
    expect(created.distinguishedName).toBe('OU=Korisnici,DC=example,DC=com');
    expect(created.ouPath).toBe('/Korisnici');
    expect(created.children).toEqual([]);
    expect(created.users).toEqual([]);
  });

  it('creates a child OU under a parent', async () => {
    const { service } = createService();
    const root = await service.create({
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=example,DC=com',
    });
    const child = await service.create({
      name: 'Direkcija',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Direkcija,OU=Korisnici,DC=example,DC=com',
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
      distinguishedName: 'OU=Korisnici,DC=example,DC=com',
      company: 'Primjer d.o.o.',
    });
    const updated = await service.update(created.id, { name: 'Korisnici Org' });
    expect(updated.name).toBe('Korisnici Org');
    expect(updated.ouPath).toBe('/Korisnici Org');
    expect(updated.company).toBe('Primjer d.o.o.');
  });

  it('rejects duplicate distinguished names and paths', async () => {
    const { service } = createService();
    await service.create({
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=example,DC=com',
    });
    await expect(
      service.create({
        name: 'Korisnici',
        type: 'BRANCH',
        distinguishedName: 'ou=Korisnici,dc=example,dc=com',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a distinguished name that does not sit under the parent DN', async () => {
    const { service } = createService();
    const root = await service.create({
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=example,DC=com',
    });
    await expect(
      service.create({
        name: 'Direkcija',
        type: 'DIRECTORATE',
        distinguishedName: 'OU=Direkcija,DC=example,DC=com',
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
        distinguishedName: 'OU=Direkcija,OU=Korisnici,DC=example,DC=com',
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
      distinguishedName: 'OU=Korisnici,DC=example,DC=com',
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
      distinguishedName: 'OU=Korisnici,DC=example,DC=com',
    });
    await service.delete(created.id);
    await expect(service.getById(created.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
