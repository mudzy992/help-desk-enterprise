import type { PrismaService } from '../../common/prisma/prisma.service';
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

export async function listUsersSummary(
  prisma: PrismaService,
): Promise<readonly UserSummaryResponse[]> {
  const users = await prisma.user.findMany({
    orderBy: { displayName: 'asc' },
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
    };
  });
}
