import { Injectable } from '@nestjs/common';
import { PrincipalContextLoader } from '../../common/principal-context/principal-context.loader';
import { PrismaService } from '../../common/prisma/prisma.service';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';
import { maxLinkableGroups } from './teams.constants';
import { toTeamsLocale, type TeamsLocale } from './teams-text';

export const simulatedUserPrefix = 'sim-user:';

export interface TeamsLinkedUser {
  readonly id: string;
  readonly displayName: string;
  readonly locale: TeamsLocale;
}

/**
 * Paket 3.1 (§11): a Teams user is our user with the same Entra object ID,
 * active and not anonymized. Local-only accounts are never linked.
 */
@Injectable()
export class TeamsIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly principals: PrincipalContextLoader,
  ) {}

  async resolveUser(aadObjectId: string | undefined, defaultLocale: TeamsLocale, simulator = false): Promise<TeamsLinkedUser | null> {
    const objectId = aadObjectId?.trim().toLowerCase();
    if (!objectId) return null;
    // Simulator only: users without an Entra ID are addressed as `sim-user:<id>` (§20a).
    const simulatedUserId = simulator && objectId.startsWith(simulatedUserPrefix) ? aadObjectId!.trim().slice(simulatedUserPrefix.length) : null;
    const user = await this.prisma.user.findFirst({
      where: { ...(simulatedUserId ? { id: simulatedUserId } : { entraObjectId: { equals: objectId, mode: 'insensitive' } }), isActive: true, anonymizedAt: null },
      select: { id: true, displayName: true, preferredLocale: true },
    });
    if (!user) return null;
    return { id: user.id, displayName: user.displayName, locale: user.preferredLocale ? toTeamsLocale(user.preferredLocale) : defaultLocale };
  }

  /**
   * Groups the user may link to a channel: everything with
   * `integrations.teams.manage` (or SUPER_ADMIN), otherwise the groups the user
   * belongs to when holding `group.manage`. Design §15 names a "group leader";
   * the product has no such role, so `group.manage` + membership stands for it.
   */
  async linkableGroups(userId: string): Promise<{ id: string; name: string }[]> {
    const context = await this.principals.load(userId);
    if (!context || !context.isActive) return [];
    const has = (permission: string) => context.assignments.some((assignment) => assignment.permissionKeys.includes(permission));
    const isSuperAdmin = context.roleKeys.includes(authorizationRoleKeys.superAdmin);
    if (isSuperAdmin || has(permissionKeys.integrationsTeamsManage)) {
      return this.prisma.group.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' }, take: maxLinkableGroups });
    }
    if (!has(permissionKeys.groupManage) || context.groupIds.length === 0) return [];
    return this.prisma.group.findMany({
      where: { id: { in: [...context.groupIds] } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: maxLinkableGroups,
    });
  }
}
