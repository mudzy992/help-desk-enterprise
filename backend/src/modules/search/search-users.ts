import type { Prisma } from '../../generated/prisma/client';
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
 *
 * W7.110 (`BA-search-09`): the order is `displayName` **and then `id`**. Two
 * people can share a display name, and `LIMIT` without a tie-breaker leaves the
 * capped page's content to the planner: a different plan, a vacuum or a row
 * update can swap two equal names in and out of the page between two identical
 * requests. The `id` column is unique, so the page is total-ordered and stable.
 * `SearchKnowledgeArticles` already orders this way (`updatedAt`, `id`); the
 * directory was the one group without it.
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
      orderBy: directoryUserOrder,
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
      orderBy: directoryUserOrder,
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
    orderBy: directoryUserOrder,
    take: input.limit,
  });
  return users.map((user: DirectoryUserRowWithEmail) => ({
    id: user.id,
    displayName: user.displayName,
    email: user.email,
  }));
}

/**
 * W7.110 (`BA-search-09`): one ordering for every scope branch. `displayName`
 * alone is not unique, so a capped result set had no defined membership; `id`
 * breaks the tie and makes the page reproducible.
 */
const directoryUserOrder: Prisma.UserOrderByWithRelationInput[] = [
  { displayName: 'asc' },
  { id: 'asc' },
];

type DirectoryUserRow = {
  readonly id: string;
  readonly displayName: string;
};

type DirectoryUserRowWithEmail = DirectoryUserRow & { readonly email: string };
