import type { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import type { UserRoleTone, UserSummaryResponse } from './users.types';

const closedTicketStatuses = ['RESOLVED', 'CLOSED', 'ARCHIVED'] as const;

export function resolveUserRoleTone(roleKey: string | null): UserRoleTone {
  if (roleKey === authorizationRoleKeys.superAdmin) {
    return 'super';
  }
  if (roleKey === authorizationRoleKeys.admin) {
    return 'manager';
  }
  if (roleKey === authorizationRoleKeys.agent) {
    return 'agent';
  }
  return 'user';
}

export const userListMaxTake = 500;
export const userListDefaultTake = userListMaxTake;

export type ListUsersSummaryOptions = {
  /** Only these users (single-user reloads after create/update/reset). */
  readonly ids?: readonly string[];
  /** Case-insensitive match on display name or e-mail. */
  readonly query?: string;
  readonly take?: number;
  readonly skip?: number;
};

export type UserSummaryPage = {
  readonly items: readonly UserSummaryResponse[];
  readonly total: number;
};

function buildUsersSummaryWhere(options: ListUsersSummaryOptions): Prisma.UserWhereInput {
  const query = options.query?.trim() ?? '';
  return {
    ...(options.ids !== undefined ? { id: { in: [...options.ids] } } : {}),
    ...(query.length > 0
      ? {
          OR: [
            { displayName: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
            { userRoles: { some: { role: { name: { contains: query, mode: 'insensitive' } } } } },
          ],
        }
      : {}),
  };
}

/**
 * Review 2026-09-25 (S3): every mutation used to reload the whole directory to
 * return one row, and `GET /users` had no way to page. `ids` narrows to single
 * users; `query`/`take`/`skip` are optional (without them the full list is
 * returned, as the admin screen expects), `take` is capped at 500.
 */
export async function listUsersSummary(
  prisma: PrismaService,
  options: ListUsersSummaryOptions = {},
): Promise<readonly UserSummaryResponse[]> {
  const users = await prisma.user.findMany({
    where: buildUsersSummaryWhere(options),
    ...(options.take !== undefined
      ? { take: Math.min(Math.max(1, Math.trunc(options.take)), userListMaxTake) }
      : {}),
    ...(options.skip !== undefined && options.skip > 0
      ? { skip: Math.trunc(options.skip) }
      : {}),
    orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    include: {
      organizationalUnit: {
        select: {
          id: true,
          name: true,
          policyPack: { select: { key: true } },
        },
      },
      userRoles: {
        include: { role: { select: { key: true, name: true } } },
      },
      groupMembers: {
        include: { group: { select: { name: true } } },
        take: 1,
      },
      _count: {
        select: {
          assignedTickets: {
            where: { status: { notIn: [...closedTicketStatuses] } },
          },
        },
      },
    },
  });
  return users.map((user) => {
    const primaryRole =
      user.userRoles.find(
        (assignment) =>
          assignment.role.key === authorizationRoleKeys.superAdmin,
      )?.role ??
      user.userRoles[0]?.role ??
      null;
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      isActive: user.isActive,
      isLocalOnly: user.isLocalOnly,
      roleKey: primaryRole?.key ?? null,
      roleName: primaryRole?.name ?? null,
      roleTone: resolveUserRoleTone(primaryRole?.key ?? null),
      organizationalUnitId: user.organizationalUnitId,
      organizationalUnitName: user.organizationalUnit?.name ?? null,
      groupName: user.groupMembers[0]?.group.name ?? null,
      policyPackKey: user.organizationalUnit?.policyPack?.key ?? null,
      openTicketCount: user._count.assignedTickets,
      mfa: null,
      anonymizedAt: user.anonymizedAt?.toISOString() ?? null,
      legalHold: user.legalHoldAt !== null,
    };
  });
}

/** Paged HTTP read; `total` is computed from the same filters, not the slice. */
export async function listUsersSummaryPage(
  prisma: PrismaService,
  options: ListUsersSummaryOptions = {},
): Promise<UserSummaryPage> {
  const take = Math.min(
    Math.max(1, Math.trunc(options.take ?? userListDefaultTake)),
    userListMaxTake,
  );
  const [items, total] = await Promise.all([
    listUsersSummary(prisma, { ...options, take }),
    prisma.user.count({ where: buildUsersSummaryWhere(options) }),
  ]);
  return { items, total };
}
