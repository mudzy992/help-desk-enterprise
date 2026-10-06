import { auditLogActions } from '../audit-log/audit-log.constants';
import { recordOrganizationalUnitChange } from './record-organizational-unit-change';
import { recordUserChange } from '../users/record-user-change';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OrganizationalUnitsService } from './organizational-units.service';
import { createInMemoryOrganizationalUnitPrisma } from './create-in-memory-organizational-unit-prisma';

jest.mock('./record-organizational-unit-change', () => ({
  recordOrganizationalUnitChange: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../users/record-user-change', () => ({
  recordUserChange: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('OrganizationalUnitsService CRUD', () => {
  beforeEach(() => {
    jest.mocked(recordOrganizationalUnitChange).mockClear();
    jest.mocked(recordUserChange).mockClear();
  });
  const createService = (
    invalidateUser = jest.fn().mockResolvedValue(1),
    invalidateUsers = jest.fn().mockResolvedValue(undefined),
  ): {
    service: OrganizationalUnitsService;
    invalidateUser: jest.Mock;
    invalidateUsers: jest.Mock;
    memory: ReturnType<typeof createInMemoryOrganizationalUnitPrisma>;
  } => {
    const memory = createInMemoryOrganizationalUnitPrisma();
    return {
      service: new OrganizationalUnitsService(memory.prisma as never, {
        invalidateUser,
        invalidateUsers,
      } as never),
      invalidateUser,
      invalidateUsers,
      memory,
    };
  };

  it('creates a root OU with DN and canonical path', async () => {
    const { service, memory } = createService();
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
    expect(recordOrganizationalUnitChange).toHaveBeenCalledWith(
      memory.prisma,
      expect.objectContaining({
        action: auditLogActions.organizationalUnitCreated,
        entityId: created.id,
        metadata: expect.objectContaining({
          after: expect.objectContaining({ name: 'Korisnici', ouPath: '/Korisnici' }),
        }),
      }),
    );
  });

  it('rolls back OU mutations when the audit insert fails', async () => {
    const auditFailure = new Error('audit insert failed');
    const { service } = createService();
    jest.mocked(recordOrganizationalUnitChange).mockRejectedValueOnce(auditFailure);

    await expect(
      service.create({
        name: 'Uncommitted',
        type: 'DIRECTORATE',
        distinguishedName: 'OU=Uncommitted,DC=example,DC=com',
      }),
    ).rejects.toBe(auditFailure);
    await expect(service.getTree()).resolves.toEqual([]);

    const created = await service.create({
      name: 'Persisted',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Persisted,DC=example,DC=com',
    });
    jest.mocked(recordOrganizationalUnitChange).mockRejectedValueOnce(auditFailure);
    await expect(service.update(created.id, { name: 'Uncommitted rename' })).rejects.toBe(auditFailure);
    await expect(service.getById(created.id)).resolves.toMatchObject({
      name: 'Persisted',
      ouPath: '/Persisted',
    });

    jest.mocked(recordOrganizationalUnitChange).mockRejectedValueOnce(auditFailure);
    await expect(service.delete(created.id)).rejects.toBe(auditFailure);
    await expect(service.getById(created.id)).resolves.toMatchObject({
      name: 'Persisted',
      ouPath: '/Persisted',
    });
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
    const { service, memory } = createService();
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
    expect(recordOrganizationalUnitChange).toHaveBeenLastCalledWith(
      memory.prisma,
      expect.objectContaining({
        action: auditLogActions.organizationalUnitUpdated,
        entityId: created.id,
        metadata: expect.objectContaining({
          before: expect.objectContaining({ name: 'Korisnici' }),
          after: expect.objectContaining({ name: 'Korisnici Org' }),
        }),
      }),
    );
  });

  it('rolls back a user-to-OU mapping when its audit insert fails', async () => {
    const auditFailure = new Error('audit insert failed');
    const { service, memory } = createService();
    const unit = await service.create({
      name: 'Operations',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Operations,DC=example,DC=com',
    });
    memory.seedUser({
      id: 'mapped-user',
      email: 'mapped@example.com',
      displayName: 'Mapped User',
      organizationalUnitId: null,
      isLocalOnly: true,
      entraObjectId: null,
      localPasswordHash: 'hash-not-for-audit',
    });
    jest.mocked(recordUserChange).mockRejectedValueOnce(auditFailure);

    await expect(
      service.assignUser({ userId: 'mapped-user', organizationalUnitId: unit.id }),
    ).rejects.toBe(auditFailure);
    expect(memory.getUser('mapped-user')?.organizationalUnitId).toBeNull();
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
    const { service, invalidateUsers, memory } = createService();
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

    expect(invalidateUsers).toHaveBeenCalledTimes(1);
    expect(invalidateUsers).toHaveBeenCalledWith(['local-user']);
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
