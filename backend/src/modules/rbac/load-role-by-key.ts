import type { PrismaService } from '../../common/prisma/prisma.service';
import { RbacError } from './rbac.error';

export async function loadRoleByKey(
  prisma: PrismaService,
  roleKey: string,
): Promise<{ readonly id: string; readonly key: string; readonly name: string }> {
  const normalized = roleKey.trim();
  const role = await prisma.role.findUnique({
    where: { key: normalized },
    select: { id: true, key: true, name: true },
  });
  if (role === null) {
    throw new RbacError('ROLE_NOT_FOUND');
  }
  return role;
}
