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
import { problemDefaults } from '../settings/definitions/problem-settings';
import { changeDefaults, parseFreezePeriods, type ChangeFreezePeriod } from '../settings/definitions/change-settings';
import { readInstallationTimeZone } from '../settings/read-installation-time-zone';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import { ChangeError, changeErrorCodes } from './changes.constants';

/** Same grant/scope model as the CMDB, restricted to `change.*` permissions. */
export type ChangeViewer = AssetViewer;
export type ChangeScope = AssetScope;

export function changeViewerOf(request: AuthenticatedHttpRequest, userId: string): ChangeViewer {
  return assetViewerFromContext(readPrincipalContext(request), userId, 'change.');
}

export type ChangeConfiguration = {
  readonly numberPrefix: string;
  readonly normalQuorum: number;
  readonly emergencyQuorum: number;
  readonly minLeadTimeHours: number;
  readonly requireTestPlan: boolean;
  readonly freezePeriods: readonly ChangeFreezePeriod[];
  readonly reminderHoursBeforeStart: number;
  readonly timeZone: string;
};

export type ChangeCapabilities = {
  readonly enabled: boolean;
  /** Addon on but no CAB group yet: the module stays inactive (admins see a setup hint). */
  readonly setupRequired: boolean;
  readonly canRead: boolean;
  readonly canRequest: boolean;
  readonly canManage: boolean;
  readonly canApprove: boolean;
  /** CMDB (3.2) and problems (3.3) links are offered only while those modules are on. */
  readonly cmdbEnabled: boolean;
  readonly problemsEnabled: boolean;
  readonly configuration: ChangeConfiguration | null;
};

/**
 * Paket 3.4 (§15, §16): addon switch, settings and unit scope. Routes carry no
 * @RequirePermissions (the global check rejects unit-bound grants on routes
 * without a unit scope), so every rule is enforced here.
 */
@Injectable()
export class ChangeAccessService {
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

  async isAddonEnabled(): Promise<boolean> {
    return (await this.readSetting<unknown>(settingKeys.privateAddonsChanges, false)) === true;
  }

  async cmdbEnabled(): Promise<boolean> {
    return (await this.readSetting<unknown>(settingKeys.privateAddonsCmdb, false)) === true;
  }

  async problemsEnabled(): Promise<boolean> {
    return (await this.readSetting<unknown>(settingKeys.privateAddonsProblems, false)) === true;
  }

  /** Number prefix of linked problems (3.3). */
  async problemNumberPrefix(): Promise<string> {
    const value = await this.readSetting<unknown>(settingKeys.privateProblemsNumberPrefix, problemDefaults.numberPrefix);
    return typeof value === 'string' ? value : problemDefaults.numberPrefix;
  }

  async hasCabGroup(): Promise<boolean> {
    return (await this.prisma.group.count({ where: { isCabGroup: true } })) > 0;
  }

  /** Decision 2026-10-01: active only with the addon on and at least one CAB group. */
  async isEnabled(): Promise<boolean> {
    return (await this.isAddonEnabled()) && (await this.hasCabGroup());
  }

  async requireEnabled(): Promise<void> {
    if (!(await this.isEnabled())) throw new ChangeError(changeErrorCodes.disabled);
  }

  async configuration(): Promise<ChangeConfiguration> {
    const [prefix, normal, emergency, lead, testPlan, freeze, reminder, timeZone] = await Promise.all([
      this.readSetting<unknown>(settingKeys.privateChangesNumberPrefix, changeDefaults.numberPrefix),
      this.readSetting<unknown>(settingKeys.privateChangesNormalQuorum, changeDefaults.normalQuorum),
      this.readSetting<unknown>(settingKeys.privateChangesEmergencyQuorum, changeDefaults.emergencyQuorum),
      this.readSetting<unknown>(settingKeys.privateChangesMinLeadTimeHours, changeDefaults.minLeadTimeHours),
      this.readSetting<unknown>(settingKeys.privateChangesRequireTestPlan, changeDefaults.requireTestPlan),
      this.readSetting<unknown>(settingKeys.privateChangesFreezePeriods, changeDefaults.freezePeriods),
      this.readSetting<unknown>(settingKeys.privateChangesReminderHoursBeforeStart, changeDefaults.reminderHoursBeforeStart),
      readInstallationTimeZone(this.settings),
    ]);
    const integer = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isInteger(value) ? value : fallback);
    return {
      numberPrefix: typeof prefix === 'string' ? prefix : changeDefaults.numberPrefix,
      normalQuorum: integer(normal, changeDefaults.normalQuorum),
      emergencyQuorum: integer(emergency, changeDefaults.emergencyQuorum),
      minLeadTimeHours: integer(lead, changeDefaults.minLeadTimeHours),
      requireTestPlan: testPlan === true,
      freezePeriods: parseFreezePeriods(freeze) ?? [],
      reminderHoursBeforeStart: integer(reminder, changeDefaults.reminderHoursBeforeStart),
      timeZone,
    };
  }

  async homeUnitPath(viewer: ChangeViewer): Promise<string | null> {
    if (viewer.homeOrganizationalUnitId === null) return null;
    const unit = await this.prisma.organizationalUnit.findUnique({
      where: { id: viewer.homeOrganizationalUnitId },
      select: { ouPath: true },
    });
    return unit?.ouPath ?? null;
  }

  /** Module on + permission held; returns the unit scope of that permission. */
  async require(viewer: ChangeViewer, permission: string): Promise<ChangeScope> {
    await this.requireEnabled();
    if (!viewerHasPermission(viewer, permission)) throw new ChangeError(changeErrorCodes.forbidden);
    return resolveAssetScope(viewer, permission, await this.homeUnitPath(viewer));
  }

  hasPermission(viewer: ChangeViewer, permission: string): boolean {
    return viewerHasPermission(viewer, permission);
  }

  async scopeOf(viewer: ChangeViewer, permission: string): Promise<ChangeScope> {
    return resolveAssetScope(viewer, permission, await this.homeUnitPath(viewer));
  }

  async requireUnitInScope(scope: ChangeScope, organizationalUnitId: string): Promise<{ id: string; ouPath: string; name: string }> {
    const unit = await this.prisma.organizationalUnit.findUnique({
      where: { id: organizationalUnitId },
      select: { id: true, ouPath: true, name: true },
    });
    if (unit === null) throw new ChangeError(changeErrorCodes.unitNotFound);
    if (!isPathInScope(scope, unit.ouPath)) throw new ChangeError(changeErrorCodes.outOfScope);
    return unit;
  }

  /**
   * §8: a CAB vote needs change.approve and membership in the change's CAB
   * group. Admins do not bypass membership (decision 2026-10-01).
   */
  async isCabMember(viewer: ChangeViewer, cabGroupId: string | null): Promise<boolean> {
    if (cabGroupId === null || !viewerHasPermission(viewer, permissionKeys.changeApprove)) return false;
    return (await this.prisma.groupMember.count({ where: { groupId: cabGroupId, userId: viewer.userId } })) > 0;
  }

  async capabilities(viewer: ChangeViewer): Promise<ChangeCapabilities> {
    const addon = await this.isAddonEnabled();
    const enabled = addon && (await this.hasCabGroup());
    const has = (permission: string) => enabled && viewerHasPermission(viewer, permission);
    const canRead = has(permissionKeys.changeRead);
    const [cmdbEnabled, problemsEnabled] = canRead ? await Promise.all([this.cmdbEnabled(), this.problemsEnabled()]) : [false, false];
    return {
      enabled,
      setupRequired: addon && !enabled,
      canRead,
      canRequest: canRead && has(permissionKeys.changeRequest),
      canManage: canRead && has(permissionKeys.changeManage),
      canApprove: canRead && has(permissionKeys.changeApprove),
      cmdbEnabled,
      problemsEnabled,
      configuration: canRead ? await this.configuration() : null,
    };
  }
}
