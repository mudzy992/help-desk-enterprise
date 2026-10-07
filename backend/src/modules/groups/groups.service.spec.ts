import { auditLogActions } from '../audit-log/audit-log.constants';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../authorization/create-test-authorization-context';
import { recordGroupChange } from './record-group-change';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';

jest.mock('./record-group-change', () => ({
  recordGroupChange: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('GroupsService', () => {
  beforeEach(() => jest.mocked(recordGroupChange).mockClear());

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
    isProblemGroup: false,
    isCabGroup: false,
    createdAt: now,
    updatedAt: now,
    organizationalUnit: { ouPath: unit.ouPath },
    members: [],
    _count: { members: 0 },
  };

  const createService = (
    invalidateUser = jest.fn().mockResolvedValue(1),
    invalidateUsers = jest.fn().mockResolvedValue(undefined),
  ) => {
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
        create: jest.fn().mockResolvedValue({
          id: groupRecord.id,
          name: groupRecord.name,
          key: groupRecord.key,
          organizationalUnitId: groupRecord.organizationalUnitId,
          isFallback: groupRecord.isFallback,
          isProblemGroup: false,
          isCabGroup: false,
        }),
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
    const authorizationContextLoader = {
      loadBySubjectId: jest.fn().mockResolvedValue(null),
    };
    return {
      service: new GroupsService(
        prisma as never,
        authorizationContextLoader as never,
        { load: async () => { throw new Error('not used'); } } as never,
        { invalidateUser, invalidateUsers } as never,
      ),
      prisma,
      authorizationContextLoader,
      invalidateUser,
      invalidateUsers,
    };
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
    expect(recordGroupChange).toHaveBeenCalledWith(prisma, expect.objectContaining({
      action: auditLogActions.groupCreated,
      entityId: groupRecord.id,
      metadata: expect.objectContaining({
        after: expect.objectContaining({ name: 'IT Support', organizationalUnitId: unit.id }),
      }),
    }));
  });

  it('filters group collections per OU and allows only the explicit unscoped group.manage grant globally', async () => {
    const { service, prisma, authorizationContextLoader } = createService();
    const groupA = {
      ...groupRecord,
      id: 'group-a',
      organizationalUnitId: 'ou-a',
      organizationalUnit: { ouPath: '/A/Team' },
    };
    const groupB = {
      ...groupRecord,
      id: 'group-b',
      key: 'group-b',
      organizationalUnitId: 'ou-b',
      organizationalUnit: { ouPath: '/B/Team' },
    };
    prisma.group.findMany.mockResolvedValue([groupA, groupB]);
    authorizationContextLoader.loadBySubjectId
      .mockResolvedValueOnce(createTestAuthorizationContext({
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.admin,
            permissionKeys: [permissionKeys.groupManage],
            organizationalUnitId: 'ou-a',
            organizationalUnitPath: '/A',
          }),
        ],
      }))
      .mockResolvedValueOnce(createTestAuthorizationContext({
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.admin,
            permissionKeys: [permissionKeys.groupManage],
          }),
        ],
      }));

    await expect(service.listAccessible({}, 'scoped-admin')).resolves.toMatchObject([
      { id: 'group-a', organizationalUnitId: 'ou-a' },
    ]);
    await expect(service.listAccessible({}, 'global-admin')).resolves.toMatchObject([
      { id: 'group-a', organizationalUnitId: 'ou-a' },
      { id: 'group-b', organizationalUnitId: 'ou-b' },
    ]);
  });

  it('audits only changed fields when a group is updated', async () => {
    const { service, prisma } = createService();
    prisma.group.findUnique.mockResolvedValue(groupRecord);
    prisma.group.update.mockResolvedValue({ ...groupRecord, name: 'Updated Support' });
    await service.update(
      groupRecord.id,
      { name: 'Updated Support' },
      { actorUserId: 'admin-1', requestId: 'req-update' },
    );
    expect(recordGroupChange).toHaveBeenCalledWith(prisma, expect.objectContaining({
      action: auditLogActions.groupUpdated,
      entityId: groupRecord.id,
      actorUserId: 'admin-1',
      requestId: 'req-update',
      metadata: { before: { name: 'IT Support' }, after: { name: 'Updated Support' } },
    }));
  });

  it('rolls back a group membership change when the audit insert fails', async () => {
    const auditFailure = new Error('audit insert failed');
    let persistedMembership = false;
    const { service, prisma } = createService();
    prisma.group.findUnique.mockResolvedValue(groupRecord);
    prisma.groupMember.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => {
      let stagedMembership = persistedMembership;
      const transaction = {
        groupMember: {
          create: jest.fn(async () => {
            stagedMembership = true;
            return { id: 'member-1' };
          }),
        },
      };
      const result = await callback(transaction);
      persistedMembership = stagedMembership;
      return result;
    });
    jest.mocked(recordGroupChange).mockRejectedValueOnce(auditFailure);

    await expect(service.addMember(groupRecord.id, user.id)).rejects.toBe(auditFailure);
    expect(persistedMembership).toBe(false);
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

  it('invalidates every member after an audited group deletion', async () => {
    const invalidateUsers = jest.fn().mockResolvedValue(undefined);
    const { service, prisma } = createService(jest.fn(), invalidateUsers);
    prisma.group.count.mockResolvedValue(2);
    prisma.group.findUnique.mockResolvedValue({
      ...groupRecord,
      members: [
        { id: 'member-1', userId: 'user-1', createdAt: now, user },
        { id: 'member-2', userId: 'user-2', createdAt: now, user },
      ],
      _count: { members: 2 },
    });
    await service.delete(groupRecord.id, { actorUserId: 'admin-1', requestId: 'req-1' });
    expect(prisma.group.delete).toHaveBeenCalledWith({ where: { id: groupRecord.id } });
    expect(recordGroupChange).toHaveBeenCalledWith(prisma, expect.objectContaining({
      action: auditLogActions.groupDeleted,
      entityId: groupRecord.id,
      metadata: expect.objectContaining({ before: expect.objectContaining({ memberCount: 2 }) }),
    }));
    expect(invalidateUsers).toHaveBeenCalledWith(['user-1', 'user-2']);
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
    const context = { actorUserId: 'admin-1', requestId: 'req-1' };
    const added = await service.addMember(groupRecord.id, user.id, context);
    expect(added.members).toHaveLength(1);
    expect(recordGroupChange).toHaveBeenCalledWith(prisma, expect.objectContaining({
      action: auditLogActions.groupMemberAdded,
      entityId: groupRecord.id,
      actorUserId: 'admin-1',
      requestId: 'req-1',
      organizationalUnitId: unit.id,
      metadata: { userId: user.id, membership: 'added' },
    }));
    const removed = await service.removeMember(groupRecord.id, user.id, context);
    expect(removed.members).toHaveLength(0);
    expect(recordGroupChange).toHaveBeenCalledWith(prisma, expect.objectContaining({
      action: auditLogActions.groupMemberRemoved,
      entityId: groupRecord.id,
      metadata: { userId: user.id, membership: 'removed' },
    }));
  });

  it('drops the cached authorization data of the member whose access changed', async () => {
    // Phase 2.2 (plan §2.2): group membership feeds the principal context, so
    // every membership change has to invalidate exactly that member.
    const { service, prisma, invalidateUser } = createService();
    prisma.groupMember.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'member-1' });
    const withMember = {
      ...groupRecord,
      members: [
        { id: 'member-1', userId: user.id, createdAt: now, user },
      ],
      _count: { members: 1 },
    };
    prisma.group.findUnique
      .mockResolvedValueOnce(groupRecord)
      .mockResolvedValueOnce(withMember)
      .mockResolvedValueOnce(withMember)
      .mockResolvedValueOnce(groupRecord);

    await service.addMember(groupRecord.id, user.id);
    expect(invalidateUser).toHaveBeenCalledTimes(1);
    expect(invalidateUser).toHaveBeenCalledWith(user.id);

    await service.removeMember(groupRecord.id, user.id);
    expect(invalidateUser).toHaveBeenCalledTimes(2);
    expect(invalidateUser).toHaveBeenLastCalledWith(user.id);
  });

  it('does not invalidate when the membership change was rejected', async () => {
    const { service, prisma, invalidateUser } = createService();
    prisma.group.findUnique.mockResolvedValue(groupRecord);
    prisma.groupMember.findUnique.mockResolvedValue({ id: 'member-1' });
    await expect(service.addMember(groupRecord.id, user.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(invalidateUser).not.toHaveBeenCalled();
  });

  it('maps missing groups to not found', async () => {
    const { service, prisma } = createService();
    prisma.group.findUnique.mockResolvedValue(null);
    await expect(service.getById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
