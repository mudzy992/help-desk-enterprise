import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuthorizationPrincipal } from '../../authentication/authentication.types';
import { authorizationRoleKeys, permissionKeys } from '../../authorization/authorization.constants';
import { AuthorizationService } from '../../authorization/authorization.service';
import type { AuthorizationRequirements } from '../../authorization/authorization.types';
import { reportRecipientSkipReasons, type ReportRecipientSkipReason } from './report-schedule.constants';

/**
 * Exactly what `ReportsController` demands (roles, permissions, OU scope):
 * „has access to Izvještaji for this unit”. Keep it in sync with the
 * decorators there — the spec compares both.
 */
export const reportsAccessRequirements: AuthorizationRequirements = {
  requiredRoles: [authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin],
  requiredPermissions: [permissionKeys.reportsExport, permissionKeys.auditExport],
  organizationalUnitScope: { field: 'organizationalUnitId' },
  serviceScope: null,
  requireOrganizationalUnitScope: true,
  requireServiceScope: false,
};

export type ReportRecipientUser = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly preferredLocale: string | null;
  readonly isLocalOnly: boolean;
  readonly isActive: boolean;
};

export type ReportRecipientVerdict =
  | { readonly ok: true; readonly user: ReportRecipientUser }
  | { readonly ok: false; readonly userId: string; readonly reason: ReportRecipientSkipReason };

const recipientSelect = {
  id: true,
  email: true,
  displayName: true,
  preferredLocale: true,
  isLocalOnly: true,
  isActive: true,
} as const;

/** Paket 2.5 (§5.2): who may see — and therefore receive — a unit's reports. */
@Injectable()
export class ReportAccessChecker {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async canAccess(principal: AuthorizationPrincipal, organizationalUnitId: string): Promise<boolean> {
    return this.authorizationService.authorize({
      principal,
      requirements: reportsAccessRequirements,
      organizationalUnitId,
      serviceId: null,
    });
  }

  async canUserAccess(userId: string, organizationalUnitId: string): Promise<boolean> {
    const [verdict] = await this.evaluate([userId], organizationalUnitId);
    return verdict?.ok === true;
  }

  /** One verdict per id, in input order (unknown ids count as inactive). */
  async evaluate(userIds: readonly string[], organizationalUnitId: string): Promise<ReportRecipientVerdict[]> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return [];
    const users = (await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: recipientSelect,
    })) as ReportRecipientUser[];
    const byId = new Map(users.map((user) => [user.id, user]));
    const verdicts: ReportRecipientVerdict[] = [];
    for (const userId of unique) {
      const user = byId.get(userId);
      if (user === undefined || !user.isActive) {
        verdicts.push({ ok: false, userId, reason: reportRecipientSkipReasons.inactive });
        continue;
      }
      const allowed = await this.canAccess(
        { subjectId: user.id, email: user.email, displayName: user.displayName, isLocalOnly: user.isLocalOnly },
        organizationalUnitId,
      );
      verdicts.push(
        allowed ? { ok: true, user } : { ok: false, userId, reason: reportRecipientSkipReasons.noAccess },
      );
    }
    return verdicts;
  }

  /** Active report users matching `query`, filtered to those with access to the unit. */
  async candidates(organizationalUnitId: string, query: string, limit: number): Promise<ReportRecipientUser[]> {
    const text = query.trim();
    const users = (await this.prisma.user.findMany({
      where: {
        isActive: true,
        userRoles: {
          some: { role: { key: { in: [authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin] } } },
        },
        ...(text.length === 0
          ? {}
          : {
              OR: [
                { displayName: { contains: text, mode: 'insensitive' } },
                { email: { contains: text, mode: 'insensitive' } },
              ],
            }),
      },
      select: recipientSelect,
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
      take: limit * 3,
    })) as ReportRecipientUser[];
    const result: ReportRecipientUser[] = [];
    for (const user of users) {
      if (result.length >= limit) break;
      const allowed = await this.canAccess(
        { subjectId: user.id, email: user.email, displayName: user.displayName, isLocalOnly: user.isLocalOnly },
        organizationalUnitId,
      );
      if (allowed) result.push(user);
    }
    return result;
  }
}
