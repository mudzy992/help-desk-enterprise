import { PrismaService } from '../../common/prisma/prisma.service';

export async function clearFallbackForOrganizationalUnit(
  prisma: PrismaService,
  organizationalUnitId: string,
  exceptGroupId: string | null = null,
): Promise<void> {
  await prisma.group.updateMany({
    where: {
      organizationalUnitId,
      isFallback: true,
      ...(exceptGroupId === null ? {} : { id: { not: exceptGroupId } }),
    },
    data: { isFallback: false },
  });
}
