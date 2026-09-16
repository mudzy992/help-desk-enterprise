import type { PrismaService } from '../../common/prisma/prisma.service';

export async function ensurePermissionRows(
  prisma: PrismaService,
  permissionKeys: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const idsByKey = new Map<string, string>();
  for (const permissionKey of permissionKeys) {
    const existing = await prisma.permission.findUnique({
      where: { key: permissionKey },
      select: { id: true, key: true },
    });
    if (existing !== null) {
      idsByKey.set(existing.key, existing.id);
      continue;
    }
    const created = await prisma.permission.create({
      data: { key: permissionKey, description: permissionKey },
      select: { id: true, key: true },
    });
    idsByKey.set(created.key, created.id);
  }
  return idsByKey;
}
