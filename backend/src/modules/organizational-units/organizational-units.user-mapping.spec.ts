import { ConflictException, NotFoundException } from '@nestjs/common';
import { createInMemoryOrganizationalUnitPrisma } from './create-in-memory-organizational-unit-prisma';
import { OrganizationalUnitsService } from './organizational-units.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('OrganizationalUnitsService user mapping', () => {
  const setup = () => {
    const memory = createInMemoryOrganizationalUnitPrisma();
    const service = new OrganizationalUnitsService(memory.prisma as never);
    return { ...memory, service };
  };

  it('assigns, reassigns, and lists users for an OU', async () => {
    const { service, seedUser } = setup();
    const first = await service.create({
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=epbih,DC=ba',
    });
    const second = await service.create({
      name: 'Direkcija',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Direkcija,OU=Korisnici,DC=epbih,DC=ba',
      parentId: first.id,
    });
    seedUser({
      id: 'user-1',
      email: 'agent@example.com',
      displayName: 'Agent',
      organizationalUnitId: null,
      isLocalOnly: true,
      entraObjectId: null,
      localPasswordHash: 'hash-must-not-leak',
    });
    const assigned = await service.assignUser({
      userId: 'user-1',
      organizationalUnitId: first.id,
    });
    expect(assigned).toEqual({
      id: 'user-1',
      email: 'agent@example.com',
      displayName: 'Agent',
      organizationalUnitId: first.id,
    });
    expect(assigned).not.toHaveProperty('localPasswordHash');
    const listed = await service.listUsers(first.id);
    expect(listed.map((user) => user.id)).toEqual(['user-1']);
    const reassigned = await service.assignUser({
      userId: 'user-1',
      organizationalUnitId: second.id,
    });
    expect(reassigned.organizationalUnitId).toBe(second.id);
    expect(await service.listUsers(first.id)).toEqual([]);
    expect(await service.listUsers(second.id)).toEqual([reassigned]);
    const detail = await service.getById(second.id);
    expect(detail.users).toEqual([reassigned]);
  });

  it('rejects deleting an OU that still has mapped users', async () => {
    const { service, seedUser } = setup();
    const unit = await service.create({
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=epbih,DC=ba',
    });
    seedUser({
      id: 'user-1',
      email: 'agent@example.com',
      displayName: 'Agent',
      organizationalUnitId: unit.id,
      isLocalOnly: false,
      entraObjectId: null,
      localPasswordHash: null,
    });
    await expect(service.delete(unit.id)).rejects.toBeInstanceOf(ConflictException);
    await service.assignUser({ userId: 'user-1', organizationalUnitId: null });
    await service.delete(unit.id);
    await expect(service.getById(unit.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
