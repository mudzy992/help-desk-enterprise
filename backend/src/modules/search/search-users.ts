import { PrismaService } from '../../common/prisma/prisma.service';
import type { DirectorySearchScope } from './search-directory-scope';
import type { UserSearchMatch } from './search.types';

/**
 * People search of `GET /search?types=user`.
 *
 * The scope comes from `search-directory-scope.ts`: an empty scope is answered
 * with an empty group (never an error — the ticket and article groups still
 * have hits), and a scoped read carries the organizational-unit predicate in the
 * query itself, so a user outside the caller's subtrees is never returned.
 *
 * The e-mail column is only selected when the scope allows it: the rows that
 * must not be exposed are then not even read.
 */
export async function searchDirectoryUsers(input: {
  readonly prisma: PrismaService;
  readonly query: string;
  readonly limit: number;
  readonly scope: DirectorySearchScope;
}): Promise<readonly UserSearchMatch[]> {
  if (input.scope.kind === 'none') {
    return [];
  }
  if (input.scope.kind === 'organizationalUnits') {
    // A user without a unit is outside every assigned subtree and therefore not
    // discoverable by a scoped caller (fail-closed); only a global reach reads
    // the whole active directory.
    const users = await input.prisma.user.findMany({
      where: {
        isActive: true,
        organizationalUnitId: { in: [...input.scope.organizationalUnitIds] },
        OR: [
          { displayName: { contains: input.query, mode: 'insensitive' } },
          { email: { contains: input.query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
      take: input.limit,
    });
    return users.map((user: DirectoryUserRow) => ({
      id: user.id,
      displayName: user.displayName,
      email: null,
    }));
  }
  if (!input.scope.includeEmail) {
    const users = await input.prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { displayName: { contains: input.query, mode: 'insensitive' } },
          { email: { contains: input.query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
      take: input.limit,
    });
    return users.map((user: DirectoryUserRow) => ({
      id: user.id,
      displayName: user.displayName,
      email: null,
    }));
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
  return users.map((user: DirectoryUserRowWithEmail) => ({
    id: user.id,
    displayName: user.displayName,
    email: user.email,
  }));
}

type DirectoryUserRow = {
  readonly id: string;
  readonly displayName: string;
};

type DirectoryUserRowWithEmail = DirectoryUserRow & { readonly email: string };
