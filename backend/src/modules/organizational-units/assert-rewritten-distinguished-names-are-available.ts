import { PrismaService } from '../../common/prisma/prisma.service';
import { OrganizationalUnitError } from './organizational-unit.error';

export async function assertRewrittenDistinguishedNamesAreAvailable(
  prisma: PrismaService,
  input: {
    readonly excludedIds: readonly string[];
    readonly nextDistinguishedNames: readonly string[];
  },
): Promise<void> {
  if (input.nextDistinguishedNames.length === 0) {
    return;
  }
  const uniqueNames = new Set(
    input.nextDistinguishedNames.map((value) => value.toLowerCase()),
  );
  if (uniqueNames.size !== input.nextDistinguishedNames.length) {
    throw new OrganizationalUnitError('DUPLICATE_DISTINGUISHED_NAME');
  }
  const conflict = await prisma.organizationalUnit.findFirst({
    where: {
      OR: input.nextDistinguishedNames.map((distinguishedName) => ({
        distinguishedName: { equals: distinguishedName, mode: 'insensitive' as const },
      })),
      NOT: { id: { in: [...input.excludedIds] } },
    },
    select: { id: true },
  });
  if (conflict !== null) {
    throw new OrganizationalUnitError('DUPLICATE_DISTINGUISHED_NAME');
  }
}
