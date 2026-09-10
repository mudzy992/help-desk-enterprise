import { PrismaService } from '../../common/prisma/prisma.service';
import { OrganizationalUnitError } from './organizational-unit.error';

export async function assertOrganizationalUnitIdentityIsAvailable(
  prisma: PrismaService,
  input: {
    readonly distinguishedName: string;
    readonly ouPath: string;
    readonly excludeId?: string;
  },
): Promise<void> {
  const duplicate = await prisma.organizationalUnit.findFirst({
    where: {
      OR: [
        {
          distinguishedName: {
            equals: input.distinguishedName,
            mode: 'insensitive',
          },
        },
        { ouPath: input.ouPath },
      ],
      ...(input.excludeId === undefined ? {} : { NOT: { id: input.excludeId } }),
    },
    select: { distinguishedName: true, ouPath: true },
  });
  if (duplicate === null) {
    return;
  }
  if (
    duplicate.distinguishedName.toLowerCase() ===
    input.distinguishedName.toLowerCase()
  ) {
    throw new OrganizationalUnitError('DUPLICATE_DISTINGUISHED_NAME');
  }
  throw new OrganizationalUnitError('DUPLICATE_OU_PATH');
}
