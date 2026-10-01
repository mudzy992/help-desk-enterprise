import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { readPrincipalContext, type AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { permissionKeys } from '../authorization/authorization.constants';
import {
  assetViewerFromContext,
  isPathInScope,
  resolveAssetScope,
  viewerHasPermission,
  type AssetScope,
  type AssetViewer,
} from '../assets/asset-viewer';
import { problemDefaults, parseRootCauseCategories } from '../settings/definitions/problem-settings';
import { opsDefaults } from '../settings/definitions/ops-settings';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import type { ProblemTargetDays } from './problem-target';
import { ProblemError, problemErrorCodes } from './problems.constants';

/** Same grant/scope model as the CMDB, restricted to `problem.*` permissions. */
export type ProblemViewer = AssetViewer;
export type ProblemScope = AssetScope;

export function problemViewerOf(request: AuthenticatedHttpRequest, userId: string): ProblemViewer {
  return assetViewerFromContext(readPrincipalContext(request), userId, 'problem.');
}

export type ProblemConfiguration = {
  readonly numberPrefix: string;
  readonly rootCauseCategories: readonly string[];
  readonly requireWorkaroundForKnownError: boolean;
  readonly autoCloseDays: number;
  readonly bulkResolveMax: number;
  readonly targetEnabled: boolean;
  /** P5 (§10): calendar id ('' = default) and working days per priority. */
  readonly targetCalendarId: string;
  readonly targetDays: ProblemTargetDays;
};

export type ProblemCapabilities = {
  readonly enabled: boolean;
  /** Addon on but no problem group yet: the module stays inactive (admins see a setup hint). */
  readonly setupRequired: boolean;
  readonly canRead: boolean;
  /** Report a problem and link tickets (agents and up). */
  readonly canReport: boolean;
  /** Holds problem.manage (runs problems of the own problem groups). */
  readonly canManage: boolean;
  readonly canClose: boolean;
  readonly configuration: ProblemConfiguration | null;
};

/**
 * Paket 3.3 (§12, §13): addon switch, settings and unit scope. Routes carry no
 * @RequirePermissions (the global check rejects unit-bound grants on routes
 * without a unit scope), so every rule is enforced here.
 */
@Injectable()
export class ProblemAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private async readSetting<T>(key: string, fallback: T): Promise<T> {
    try {
      const value = await this.settings.getSetting(key);
      return value === undefined || value === null ? fallback : (value as T);
    } catch {
      return fallback;
    }
  }

  /** P5b (§9): affected CMDB items only while the CMDB module (3.2) is on. */
  async cmdbEnabled(): Promise<boolean> {
    return (await this.readSetting<unknown>(settingKeys.privateAddonsCmdb, false)) === true;
  }

  /** P5b (§9): status-page incident links only while the status page (2.7) is on. */
  async statusPageEnabled(): Promise<boolean> {
    return (await this.readSetting<unknown>(settingKeys.privateStatusPageEnabled, opsDefaults.statusPageEnabled)) === true;
  }

  async isAddonEnabled(): Promise<boolean> {
    return (await this.readSetting<unknown>(settingKeys.privateAddonsProblems, false)) === true;
  }

  async hasProblemGroup(): Promise<boolean> {
    return (await this.prisma.group.count({ where: { isProblemGroup: true } })) > 0;
  }

  /** Decision 2026-10-01: the module is active only with the addon on and at least one problem group. */
  async isEnabled(): Promise<boolean> {
    return (await this.isAddonEnabled()) && (await this.hasProblemGroup());
  }

  /**
   * Authority over one problem (§12, decision 2026-10-01): ADMIN/SUPER_ADMIN
   * always; otherwise the permission plus membership in the problem's group.
   */
  async hasGroupAuthority(viewer: ProblemViewer, permission: string, groupId: string | null): Promise<boolean> {
    if (!viewerHasPermission(viewer, permission)) return false;
    if (viewer.isSuperAdmin || viewer.isAdmin === true) return true;
    if (groupId === null) return false;
    return (await this.prisma.groupMember.count({ where: { groupId, userId: viewer.userId } })) > 0;
  }

  async requireGroupAuthority(viewer: ProblemViewer, permission: string, groupId: string | null): Promise<void> {
    if (!(await this.hasGroupAuthority(viewer, permission, groupId))) throw new ProblemError(problemErrorCodes.forbidden, 'problem_group');
  }

  async configuration(): Promise<ProblemConfiguration> {
    const [prefix, categories, requireWorkaround, autoClose, bulkMax, target, calendarId, critical, high, medium, low] = await Promise.all([
      this.readSetting<unknown>(settingKeys.privateProblemsNumberPrefix, problemDefaults.numberPrefix),
      this.readSetting<unknown>(settingKeys.privateProblemsRootCauseCategories, problemDefaults.rootCauseCategories),
      this.readSetting<unknown>(settingKeys.privateProblemsRequireWorkaroundForKnownError, problemDefaults.requireWorkaroundForKnownError),
      this.readSetting<unknown>(settingKeys.privateProblemsAutoCloseDays, problemDefaults.autoCloseDays),
      this.readSetting<unknown>(settingKeys.privateProblemsBulkResolveMax, problemDefaults.bulkResolveMax),
      this.readSetting<unknown>(settingKeys.privateProblemsTargetEnabled, problemDefaults.targetEnabled),
      this.readSetting<unknown>(settingKeys.privateProblemsTargetCalendarId, problemDefaults.targetCalendarId),
      this.readSetting<unknown>(settingKeys.privateProblemsTargetCriticalWorkingDays, problemDefaults.targetCriticalWorkingDays),
      this.readSetting<unknown>(settingKeys.privateProblemsTargetHighWorkingDays, problemDefaults.targetHighWorkingDays),
      this.readSetting<unknown>(settingKeys.privateProblemsTargetMediumWorkingDays, problemDefaults.targetMediumWorkingDays),
      this.readSetting<unknown>(settingKeys.privateProblemsTargetLowWorkingDays, problemDefaults.targetLowWorkingDays),
    ]);
    const integer = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isInteger(value) ? value : fallback);
    return {
      numberPrefix: typeof prefix === 'string' ? prefix : problemDefaults.numberPrefix,
      rootCauseCategories: parseRootCauseCategories(categories) ?? parseRootCauseCategories(problemDefaults.rootCauseCategories) ?? [],
      requireWorkaroundForKnownError: requireWorkaround === true,
      autoCloseDays: integer(autoClose, problemDefaults.autoCloseDays),
      bulkResolveMax: integer(bulkMax, problemDefaults.bulkResolveMax),
      targetEnabled: target === true,
      targetCalendarId: typeof calendarId === 'string' ? calendarId : '',
      targetDays: {
        CRITICAL: integer(critical, problemDefaults.targetCriticalWorkingDays),
        HIGH: integer(high, problemDefaults.targetHighWorkingDays),
        MEDIUM: integer(medium, problemDefaults.targetMediumWorkingDays),
        LOW: integer(low, problemDefaults.targetLowWorkingDays),
      },
    };
  }

  async requireEnabled(): Promise<void> {
    if (!(await this.isEnabled())) throw new ProblemError(problemErrorCodes.disabled);
  }

  async homeUnitPath(viewer: ProblemViewer): Promise<string | null> {
    if (viewer.homeOrganizationalUnitId === null) return null;
    const unit = await this.prisma.organizationalUnit.findUnique({
      where: { id: viewer.homeOrganizationalUnitId },
      select: { ouPath: true },
    });
    return unit?.ouPath ?? null;
  }

  /** Module on + permission held; returns the unit scope of that permission. */
  async require(viewer: ProblemViewer, permission: string): Promise<ProblemScope> {
    await this.requireEnabled();
    if (!viewerHasPermission(viewer, permission)) throw new ProblemError(problemErrorCodes.forbidden);
    return resolveAssetScope(viewer, permission, await this.homeUnitPath(viewer));
  }

  hasPermission(viewer: ProblemViewer, permission: string): boolean {
    return viewerHasPermission(viewer, permission);
  }

  async scopeOf(viewer: ProblemViewer, permission: string): Promise<ProblemScope> {
    return resolveAssetScope(viewer, permission, await this.homeUnitPath(viewer));
  }

  /** The unit must exist and be inside the scope (writes into a unit). */
  async requireUnitInScope(scope: ProblemScope, organizationalUnitId: string): Promise<{ id: string; ouPath: string; name: string }> {
    const unit = await this.prisma.organizationalUnit.findUnique({
      where: { id: organizationalUnitId },
      select: { id: true, ouPath: true, name: true },
    });
    if (unit === null) throw new ProblemError(problemErrorCodes.unitNotFound);
    if (!isPathInScope(scope, unit.ouPath)) throw new ProblemError(problemErrorCodes.outOfScope);
    return unit;
  }

  async capabilities(viewer: ProblemViewer): Promise<ProblemCapabilities> {
    const addon = await this.isAddonEnabled();
    const enabled = addon && (await this.hasProblemGroup());
    const has = (permission: string) => enabled && viewerHasPermission(viewer, permission);
    const canRead = has(permissionKeys.problemRead);
    return {
      enabled,
      setupRequired: addon && !enabled,
      canRead,
      canReport: canRead && has(permissionKeys.problemReport),
      canManage: canRead && has(permissionKeys.problemManage),
      canClose: canRead && has(permissionKeys.problemClose),
      configuration: canRead ? await this.configuration() : null,
    };
  }
}
