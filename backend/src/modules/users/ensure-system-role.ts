import type { PrismaService } from '../../common/prisma/prisma.service';
import { authorizationRoleNames } from '../authorization/authorization.constants';
import { UsersError } from './users.error';

export async function ensureSystemRole(
  prisma: PrismaService,
  roleKey: string,
): Promise<string> {
  const key = roleKey.trim();
  const name = authorizationRoleNames[key];
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
