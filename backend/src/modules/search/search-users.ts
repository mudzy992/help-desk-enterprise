import { PrismaService } from '../../common/prisma/prisma.service';
import type { UserSearchMatch } from './search.types';

/**
 * People search of `GET /search?types=user`.
 *
 * The only existing list of directory users is
 * `GET /organizational-units/:id/users`, which is an admin route, and the header
 * search used to reach it through one request per organizational unit. To keep
 * the very same reach (and to not open a new door), the group is answered only
 * for admins and super admins; everyone else gets an empty group instead of an
 * error, because the other two groups still have hits.
 */
export async function searchDirectoryUsers(input: {
  readonly prisma: PrismaService;
  readonly query: string;
  readonly limit: number;
  readonly maySearchUsers: boolean;
}): Promise<readonly UserSearchMatch[]> {
  if (!input.maySearchUsers) {
    return [];
  }
  const users = await input.prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { displayName: { contains: input.query, mode: 'insensitive' } },
        { email: { contains: input.query, mode: 'insensitive' } },
      ],
    },
    select: { id: true, displayName: true, email: true },
    orderBy: { displayName: 'asc' },
    take: input.limit,
  });
  return users.map((user) => ({
    id: user.id,
    displayName: user.displayName,
    email: user.email,
  }));
}

/** `ADMIN` (or super admin) is what the directory user list requires. */
export function maySearchDirectoryUsers(context: {
  readonly isSuperAdmin: boolean;
  readonly roleKeys: readonly string[];
}): boolean {
  return context.isSuperAdmin || context.roleKeys.includes('ADMIN');
}
