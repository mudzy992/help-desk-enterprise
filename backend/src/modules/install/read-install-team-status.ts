import { PrismaService } from '../../common/prisma/prisma.service';
import { findInstallFallbackGroup } from './ensure-install-fallback-group';
import { findInstallSuperAdmin } from './find-install-super-admin';
import { installTeamLimits } from './install-team.constants';
import type {
  InstallTeamMemberRecord,
  InstallTeamPublicRecord,
} from './install-team.types';

/**
 * Install wizard v2 (F2): the team step lists the people in the handler group
 * created by the structure step. The founder is marked separately — the group
 * having exactly one member means the team step is not answered yet
 * (`isTeamInvited`), which is what the registry reads to decide `completed`.
 */
export async function readInstallTeamStatus(
  prisma: PrismaService,
): Promise<InstallTeamPublicRecord> {
  const [group, superAdmin] = await Promise.all([
    findInstallFallbackGroup(prisma),
    findInstallSuperAdmin(prisma),
  ]);
  if (group === null) {
    return {
      members: [],
      groupName: null,
      maxMembers: installTeamLimits.maxMembers,
      isTeamInvited: false,
    };
  }
  const memberships = await prisma.groupMember.findMany({
    where: { groupId: group.id },
    orderBy: { createdAt: 'asc' },
  });
  const members = await Promise.all(
    memberships.map((membership) =>
      readMember(prisma, membership.userId, superAdmin?.id ?? null),
    ),
  );
  const resolved = members.filter(
    (member): member is InstallTeamMemberRecord => member !== null,
  );
  return {
    members: resolved,
    groupName: group.name,
    maxMembers: installTeamLimits.maxMembers,
    isTeamInvited: resolved.some((member) => !member.isSuperAdmin),
  };
}

export function isInstallTeamInvited(team: InstallTeamPublicRecord): boolean {
  return team.isTeamInvited;
}

async function readMember(
  prisma: PrismaService,
  userId: string,
  superAdminUserId: string | null,
): Promise<InstallTeamMemberRecord | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: { select: { key: true } } } } },
  });
  if (user === null) {
    return null;
  }
  return {
    userId: user.id,
    displayName: user.displayName,
    email: user.email,
    roleKey: user.userRoles?.[0]?.role?.key ?? null,
    isSuperAdmin: user.id === superAdminUserId,
  };
}
