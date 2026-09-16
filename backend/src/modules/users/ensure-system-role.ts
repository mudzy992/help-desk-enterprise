import type { PrismaService } from '../../common/prisma/prisma.service';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { UsersError } from './users.error';

const systemRoleNames: Readonly<Record<string, string>> = {
  [authorizationRoleKeys.user]: 'User',
  [authorizationRoleKeys.agent]: 'Agent',
  [authorizationRoleKeys.admin]: 'Admin',
  [authorizationRoleKeys.superAdmin]: 'SuperAdmin',
};

export async function ensureSystemRole(
  prisma: PrismaService,
  roleKey: string,
): Promise<string> {
  const key = roleKey.trim();
  const name = systemRoleNames[key];
  if (name === undefined) {
    throw new UsersError('ROLE_NOT_FOUND');
  }
  const existing = await prisma.role.findUnique({
    where: { key },
    select: { id: true },
  });
  if (existing !== null) {
    return existing.id;
  }
  const created = await prisma.role.create({
    data: {
      key,
      name,
      isSystem: true,
    },
    select: { id: true },
  });
  return created.id;
}
