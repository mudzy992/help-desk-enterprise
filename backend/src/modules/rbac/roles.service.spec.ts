import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../authorization/create-test-authorization-context';
import {
  createTestAuthorizationHarness,
  shadowTestPrincipal,
} from '../authorization/create-test-authorization-harness';
import { shadowAuthorizationDecisions } from '../authorization/shadow-authorization.types';
import { RolesService } from './roles.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('RolesService preview and replace', () => {
  const role = { id: 'role-agent', key: authorizationRoleKeys.agent, name: 'Agent' };
  const permissionMerge = { id: 'perm-merge', key: permissionKeys.ticketMerge };
  const permissionSettings = {
    id: 'perm-settings',
    key: permissionKeys.settingsWrite,
  };

  const createService = () => {
    const prisma: Record<string, unknown> = {
      role: {
        findUnique: jest.fn().mockResolvedValue(role),
        findMany: jest.fn(),
      },
      rolePermission: {
        findMany: jest.fn().mockResolvedValue([
          { permission: { key: permissionKeys.ticketMerge } },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
      permission: {
        findUnique: jest.fn().mockImplementation(async ({ where }: { where: { key: string } }) => {
          if (where.key === permissionKeys.ticketMerge) {
            return permissionMerge;
          }
          if (where.key === permissionKeys.settingsWrite) {
            return permissionSettings;
          }
          return null;
        }),
        create: jest.fn(),
      },
      userRole: {
        findMany: jest.fn().mockResolvedValue([
          {
            user: {
              id: 'user-1',
              displayName: 'Agent One',
              email: 'agent@example.com',
            },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>): Promise<unknown> =>
        callback(prisma),
      ),
      $executeRaw: jest.fn(),
    };
    const harness = createTestAuthorizationHarness();
    harness.loadBySubjectId.mockResolvedValue(
      createTestAuthorizationContext({
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.agent,
            permissionKeys: [permissionKeys.ticketMerge],
          }),
        ],
      }),
    );
    const service = new RolesService(
      prisma as never,
      { loadBySubjectId: harness.loadBySubjectId } as never,
      harness.shadowAuthorizationService,
    );
    type PrismaMock = {
      rolePermission: { deleteMany: jest.Mock };
      auditLog: { create: jest.Mock };
    };
    return { service, prisma: prisma as unknown as PrismaMock, harness };
  };

  it('preview reports lost access when ticket.merge is removed from agent', async () => {
    const { service } = createService();
    const preview = await service.preview(authorizationRoleKeys.agent, []);
    expect(preview.removedPermissionKeys).toEqual([permissionKeys.ticketMerge]);
    expect(preview.samples.length).toBeGreaterThan(0);
    expect(preview.samples[0]?.before.decision).toBe(
      shadowAuthorizationDecisions.allow,
    );
    expect(preview.samples[0]?.after.decision).toBe(
      shadowAuthorizationDecisions.deny,
    );
  });

  it('replace swaps role permissions and writes audit metadata', async () => {
    const { service, prisma } = createService();
    const next = await service.replace({
      roleKey: authorizationRoleKeys.agent,
      permissionKeys: [permissionKeys.settingsWrite],
      actorUserId: 'super-1',
      requestId: 'req-1',
    });
    expect(next).toEqual([permissionKeys.settingsWrite]);
    expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({
      where: { roleId: role.id },
    });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});
