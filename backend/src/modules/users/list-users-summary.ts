import type { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import type {
  UserMfaState,
  UserPolicyPackSource,
  UserRoleTone,
  UserSummaryResponse,
} from './users.types';

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

/**
 * Paket 5.3.2 (§4.4): a pack is only ever inherited from the organizational
 * unit — the user row has no pack of its own — and "actually active" excludes
 * packs the installation switched off in settings.
 */
function resolvePolicyPackSource(
  unit: { readonly policyPack: { readonly key: string } | null } | null | undefined,
): UserPolicyPackSource {
  return unit?.policyPack ? 'organizational_unit' : 'none';
}

function resolvePolicyPackDisabled(
  packKey: string | null,
  disabledPolicyPackKeys: ReadonlySet<string>,
): boolean {
  return packKey !== null && disabledPolicyPackKeys.has(packKey.toUpperCase());
}

/**
 * Directory-linked accounts authenticate through Entra/AD, where the second
 * factor belongs to the provider — our MFA can neither be enrolled nor reset.
 */
export function resolveUserMfaState(
  isLocalOnly: boolean,
  enabledAt: Date | null,
): UserMfaState {
  if (!isLocalOnly) {
    return 'not_applicable';
  }
  return enabledAt === null ? 'disabled' : 'enabled';
}

export const userListMaxTake = 500;
export const userListDefaultTake = userListMaxTake;

export type ListUsersSummaryOptions = {
  /** Only these users (single-user reloads after create/update/reset). */
  readonly ids?: readonly string[];
  /** Case-insensitive match on display name or e-mail. */
  readonly query?: string;
  /**
   * Paket 5.3.2 (§4.4): packs switched off with
   * `private.policyPacks.disabledKeysCsv` are not "actually active", so the
   * admin screen must not show them as the user's pack.
   */
  readonly disabledPolicyPackKeys?: readonly string[];
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
      mfa: { select: { enabledAt: true } },
      _count: {
        select: {
          assignedTickets: {
            where: { status: { notIn: [...closedTicketStatuses] } },
          },
        },
      },
    },
  });
  const disabledPolicyPackKeys = new Set(
    (options.disabledPolicyPackKeys ?? []).map((key) => key.trim().toUpperCase()),
  );
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
      policyPackSource: resolvePolicyPackSource(user.organizationalUnit),
      policyPackDisabled: resolvePolicyPackDisabled(
        user.organizationalUnit?.policyPack?.key ?? null,
        disabledPolicyPackKeys,
      ),
      openTicketCount: user._count.assignedTickets,
      mfa: resolveUserMfaState(user.isLocalOnly, user.mfa?.enabledAt ?? null),
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
