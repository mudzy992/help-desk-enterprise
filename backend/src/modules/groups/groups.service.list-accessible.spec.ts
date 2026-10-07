import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../authorization/create-test-authorization-context';
import { GroupsService } from './groups.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const now = new Date('2026-10-07T00:00:00.000Z');

function group(id: string, organizationalUnitId: string, path: string) {
  return {
    id,
    name: `Group ${id}`,
    key: `group-${id}`,
    organizationalUnitId,
    isFallback: false,
    isProblemGroup: false,
    isCabGroup: false,
    createdAt: now,
    updatedAt: now,
    organizationalUnit: { ouPath: path },
    _count: { members: 0 },
  };
}

describe('GroupsService.listAccessible (5.2.1 M4 B4)', () => {
  it('filters the collection to an OU subtree and allows global access only for an unscoped group.manage grant', async () => {
    const authorizationContextLoader = {
      loadBySubjectId: jest
        .fn()
        .mockResolvedValueOnce(
          createTestAuthorizationContext({
            assignments: [
              createTestAssignment({
                roleKey: authorizationRoleKeys.admin,
                permissionKeys: [permissionKeys.groupManage],
                organizationalUnitId: 'ou-a',
                organizationalUnitPath: '/A',
              }),
            ],
          }),
        )
        .mockResolvedValueOnce(
          createTestAuthorizationContext({
            assignments: [
              createTestAssignment({
                roleKey: authorizationRoleKeys.admin,
                permissionKeys: [permissionKeys.groupManage],
              }),
            ],
          }),
        )
        .mockResolvedValueOnce(
          createTestAuthorizationContext({
            assignments: [
              createTestAssignment({
                roleKey: authorizationRoleKeys.admin,
                permissionKeys: [permissionKeys.groupManage],
                serviceId: 'service-a',
              }),
            ],
          }),
        ),
    };
    const prisma = {
      group: {
        findMany: jest
          .fn()
          .mockResolvedValue([group('a', 'ou-a', '/A/Team'), group('b', 'ou-b', '/B/Team')]),
      },
    };
    const service = new GroupsService(prisma as never, authorizationContextLoader as never, {} as never);

    await expect(service.listAccessible({}, 'scoped-admin')).resolves.toMatchObject([
      { id: 'a', organizationalUnitId: 'ou-a' },
    ]);
    await expect(service.listAccessible({}, 'global-admin')).resolves.toMatchObject([
      { id: 'a', organizationalUnitId: 'ou-a' },
      { id: 'b', organizationalUnitId: 'ou-b' },
    ]);
    await expect(service.listAccessible({}, 'service-scoped-admin')).resolves.toEqual([]);
  });
});
