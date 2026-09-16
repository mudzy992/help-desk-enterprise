import { ConflictException, NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('GroupsService', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const unit = { id: 'ou-1', ouPath: '/IT' };
  const user = {
    id: 'user-1',
    displayName: 'Agent One',
    email: 'agent@example.com',
  };
  const groupRecord = {
    id: 'group-1',
    name: 'IT Support',
    key: 'it-support',
    organizationalUnitId: unit.id,
    isFallback: true,
    createdAt: now,
    updatedAt: now,
    organizationalUnit: { ouPath: unit.ouPath },
    members: [],
    _count: { members: 0 },
  };

  const createService = () => {
    const prisma: {
      organizationalUnit: { findUnique: jest.Mock };
      group: {
        findUnique: jest.Mock;
        findMany: jest.Mock;
        count: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        updateMany: jest.Mock;
        delete: jest.Mock;
      };
      groupMember: {
        findUnique: jest.Mock;
        create: jest.Mock;
        delete: jest.Mock;
      };
      user: { findUnique: jest.Mock };
      ticket: { count: jest.Mock };
      $transaction: jest.Mock;
    } = {
      organizationalUnit: {
        findUnique: jest.fn().mockResolvedValue(unit),
      },
      group: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: groupRecord.id }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn(),
      },
      groupMember: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
      },
      ticket: {
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) =>
        callback(prisma),
      ),
    };
    prisma.group.findUnique.mockImplementation(async ({ where }: { where: { id?: string; key?: string } }) => {
      if (where.id === groupRecord.id) {
        return groupRecord;
      }
      if (where.key !== undefined) {
        return null;
      }
      return null;
    });
    return { service: new GroupsService(prisma as never), prisma };
  };

  it('creates a group in an existing organizational unit', async () => {
    const { service, prisma } = createService();
    const created = await service.create({
      name: 'IT Support',
      organizationalUnitId: unit.id,
      isFallback: true,
    });
    expect(prisma.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'IT Support',
          organizationalUnitId: unit.id,
          isFallback: true,
        }),
      }),
    );
    expect(created.id).toBe(groupRecord.id);
    expect(created.organizationalUnitPath).toBe(unit.ouPath);
  });

  it('blocks deleting the only fallback group for an organizational unit', async () => {
    const { service, prisma } = createService();
    prisma.group.count.mockResolvedValue(1);
    await expect(service.delete(groupRecord.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.group.delete).not.toHaveBeenCalled();
  });

  it('blocks deleting a group with active tickets assigned', async () => {
    const { service, prisma } = createService();
    prisma.group.count.mockResolvedValue(2);
    prisma.ticket.count.mockResolvedValue(3);
    await expect(service.delete(groupRecord.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.group.delete).not.toHaveBeenCalled();
  });

  it('adds and removes a group member', async () => {
    const { service, prisma } = createService();
    prisma.groupMember.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'member-1' });
    const withMember = {
      ...groupRecord,
      members: [
        {
          id: 'member-1',
          userId: user.id,
          createdAt: now,
          user,
        },
      ],
      _count: { members: 1 },
    };
    prisma.group.findUnique
      .mockResolvedValueOnce(groupRecord)
      .mockResolvedValueOnce(withMember)
      .mockResolvedValueOnce(withMember)
      .mockResolvedValueOnce(groupRecord);
    const added = await service.addMember(groupRecord.id, user.id);
    expect(added.members).toHaveLength(1);
    const removed = await service.removeMember(groupRecord.id, user.id);
    expect(removed.members).toHaveLength(0);
  });

  it('maps missing groups to not found', async () => {
    const { service, prisma } = createService();
    prisma.group.findUnique.mockResolvedValue(null);
    await expect(service.getById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
